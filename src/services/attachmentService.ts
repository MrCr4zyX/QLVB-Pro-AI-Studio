// Local browser attachment storage. References are saved in Document.attachment.
// Files remain on this browser/device; they are NOT synchronized by JSON/Drive sync.
const DB_NAME = 'k02_attachment_files_v1';
const STORE = 'files';
export const ATTACHMENT_PREFIX = 'k02-attachment:';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveAttachment(file: File): Promise<string> {
  const db = await openDb();
  const id = crypto.randomUUID();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put({ blob: file, name: file.name, type: file.type }, id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally { db.close(); }
  return ATTACHMENT_PREFIX + id;
}

export async function getAttachment(reference: string): Promise<{ blob: Blob; name: string; type: string } | null> {
  if (!reference.startsWith(ATTACHMENT_PREFIX)) return null;
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const request = tx.objectStore(STORE).get(reference.slice(ATTACHMENT_PREFIX.length));
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error);
    });
  } finally { db.close(); }
}

export async function openAttachment(reference: string): Promise<void> {
  if (reference.startsWith(ATTACHMENT_PREFIX)) {
    const record = await getAttachment(reference);
    if (!record) throw new Error('Không tìm thấy file trên thiết bị này. Hãy chọn lại file đính kèm.');
    const url = URL.createObjectURL(record.blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    anchor.download = record.name;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    return;
  }
  if (/^https?:\/\//i.test(reference)) {
    window.open(reference, '_blank', 'noopener,noreferrer');
    return;
  }
  throw new Error('Trình duyệt không thể tự mở đường dẫn Windows/Android đã nhập. Hãy dùng Chọn file để lưu bản sao vào ứng dụng.');
}

export async function chooseAttachmentFolder(fileName: string): Promise<void> {
  const picker = (window as Window & { showDirectoryPicker?: () => Promise<any> }).showDirectoryPicker;
  if (!picker) throw new Error('Trình duyệt này không hỗ trợ mở thư mục trực tiếp. Trên Android hãy dùng ứng dụng Quản lý tệp.');
  const directory = await picker();
  // Browser does not disclose the original parent directory of a selected file.
  if (fileName) {
    try {
      await directory.getFileHandle(fileName);
      alert(`Đã chọn thư mục chứa ${fileName}: ${directory.name}`);
      return;
    } catch { /* The chosen folder does not contain this file. */ }
  }
  alert(`Đã chọn thư mục: ${directory.name}. Trình duyệt không cho phép tự mở Explorer tại thư mục gốc của file.`);
}
