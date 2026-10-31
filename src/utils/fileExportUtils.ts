import * as XLSX from 'xlsx';

export const QLVB_EXPORT_FOLDER = 'QLVB_PRO';
export const QLVB_EXPORT_PATH_LABEL = `Download/${QLVB_EXPORT_FOLDER}`;

const FS_DB_NAME = 'k02_qlvb_fs_db';
const FS_STORE_NAME = 'dir_handles';
const FS_HANDLE_KEY = 'downloads_root';

export interface FileExportResult {
  savedViaNativeBridge: boolean;
  createdSubfolder: boolean;
  isIframeFallback?: boolean;
  targetPath: string;
}

/**
 * Format current date/time as YYYYMMDD_HHmmss prefix
 */
export function getExportTimestampPrefix(date = new Date()): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(
    date.getHours()
  )}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

/**
 * Convert ArrayBuffer or Uint8Array to Base64 string safely without call stack overflow
 */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }
  return window.btoa(binary);
}

/**
 * Normalize filename to ensure no duplicate subfolder prefixes
 */
function normalizeCleanFilename(filename: string): string {
  return filename.replace(/^(\.?\/)?(Download\/)?(QLVB_PRO\/)+/i, '').trim();
}

function base64ToUint8Array(base64Data: string): Uint8Array {
  const binaryStr = window.atob(base64Data);
  const len = binaryStr.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  return bytes;
}

let inMemoryRootHandle: any | null = null;
let inMemoryInitDone = false;

/**
 * IndexedDB storage for PC FileSystemDirectoryHandle so user only selects Downloads once
 */
function openFsHandleDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB not supported'));
      return;
    }
    const req = indexedDB.open(FS_DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(FS_STORE_NAME)) {
        db.createObjectStore(FS_STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getSavedRootDirectoryHandle(): Promise<any | null> {
  if (inMemoryRootHandle) return inMemoryRootHandle;
  try {
    const db = await openFsHandleDb();
    const res = await new Promise<any | null>((resolve) => {
      const tx = db.transaction(FS_STORE_NAME, 'readonly');
      const req = tx.objectStore(FS_STORE_NAME).get(FS_HANDLE_KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
    if (res) inMemoryRootHandle = res;
    return res;
  } catch {
    return null;
  } finally {
    inMemoryInitDone = true;
  }
}

async function saveRootDirectoryHandle(handle: any): Promise<void> {
  inMemoryRootHandle = handle;
  try {
    const db = await openFsHandleDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(FS_STORE_NAME, 'readwrite');
      tx.objectStore(FS_STORE_NAME).put(handle, FS_HANDLE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // Ignore IDB storage errors
  }
}

// Preload cached handle into memory on module load so click handlers don't lose transient user activation awaiting IDB
if (typeof window !== 'undefined') {
  getSavedRootDirectoryHandle().catch(() => {});
}

export async function clearSavedPcExportDirectoryHandle(): Promise<void> {
  inMemoryRootHandle = null;
  try {
    const db = await openFsHandleDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(FS_STORE_NAME, 'readwrite');
      tx.objectStore(FS_STORE_NAME).delete(FS_HANDLE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // Ignore IDB delete error
  }
}

export async function getLinkedPcExportFolderName(): Promise<string | null> {
  const handle = inMemoryRootHandle || (await getSavedRootDirectoryHandle());
  if (!handle) return null;
  const rawName = String(handle.name || '').trim() || 'Downloads';
  return rawName.toUpperCase() === QLVB_EXPORT_FOLDER ? rawName : `${rawName}/${QLVB_EXPORT_FOLDER}`;
}

export function supportsDirectoryPicker(): boolean {
  return (
    typeof window !== 'undefined' &&
    !Boolean((window as any).AndroidBridge) &&
    typeof (window as any).showDirectoryPicker === 'function' &&
    window.self === window.top
  );
}

/**
 * Verify that a FileSystemDirectoryHandle not only has readwrite permission
 * but also still physically exists on the user's disk (wasn't deleted or moved).
 */
async function verifyHandleExistsAndWritable(handle: any): Promise<boolean> {
  if (!handle) return false;
  try {
    const opts = { mode: 'readwrite' };
    if (typeof handle.queryPermission === 'function') {
      const current = await handle.queryPermission(opts);
      if (current !== 'granted') {
        if (typeof handle.requestPermission === 'function') {
          const requested = await handle.requestPermission(opts);
          if (requested !== 'granted') return false;
        } else {
          return false;
        }
      }
    }

    // Probe physical existence on disk:
    // 1. If handle is QLVB_PRO itself, iterating 1 entry or probing a non-existent child throws NotFoundError if QLVB_PRO was deleted
    const name = String(handle.name || '').trim().toUpperCase();
    if (name === QLVB_EXPORT_FOLDER) {
      if (typeof handle.values === 'function') {
        const iterator = handle.values();
        await iterator.next();
      } else {
        await handle.getFileHandle('__k02_probe__', { create: false }).catch((err: any) => {
          if (err?.name === 'NotFoundError') return; // Parent directory exists, probe file doesn't -> OK
          throw err;
        });
      }
      return true;
    }

    // 2. If handle is a parent folder, ensure child QLVB_PRO exists or create it now
    await handle.getDirectoryHandle(QLVB_EXPORT_FOLDER, { create: true });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check whether a valid, existing QLVB_PRO directory is currently linked on PC without opening a picker.
 */
export async function checkPcQlvbFolderReady(): Promise<{
  isReady: boolean;
  folderLabel: string | null;
}> {
  if (typeof window === 'undefined' || Boolean((window as any).AndroidBridge)) {
    return { isReady: true, folderLabel: QLVB_EXPORT_PATH_LABEL };
  }
  const cached = inMemoryInitDone ? inMemoryRootHandle : await getSavedRootDirectoryHandle();
  if (!cached) return { isReady: false, folderLabel: null };

  const cachedName = String(cached.name || '').trim();
  if (/^new folder/i.test(cachedName)) {
    await clearSavedPcExportDirectoryHandle();
    return { isReady: false, folderLabel: null };
  }

  try {
    const opts = { mode: 'readwrite' };
    if (typeof cached.queryPermission === 'function') {
      const perm = await cached.queryPermission(opts);
      if (perm !== 'granted') return { isReady: false, folderLabel: null };
    }
    if (cachedName.toUpperCase() === QLVB_EXPORT_FOLDER) {
      if (typeof cached.values === 'function') {
        await cached.values().next();
      }
      return { isReady: true, folderLabel: QLVB_EXPORT_FOLDER };
    }
    await cached.getDirectoryHandle(QLVB_EXPORT_FOLDER, { create: true });
    return { isReady: true, folderLabel: `${cachedName}/${QLVB_EXPORT_FOLDER}` };
  } catch {
    // Directory was deleted on disk or permission revoked
    await clearSavedPcExportDirectoryHandle();
    return { isReady: false, folderLabel: null };
  }
}

/**
 * Interactive Pre-Export Modal when QLVB_PRO directory is missing or not yet linked on PC.
 * Gives the user a fresh click button so `showDirectoryPicker` always has valid transient user activation.
 */
function promptCreateMissingQlvbFolderModal(): Promise<any | null> {
  return new Promise((resolve, reject) => {
    if (typeof document === 'undefined') {
      resolve(null);
      return;
    }

    const modalId = 'k02-missing-qlvb-folder-modal';
    const existing = document.getElementById(modalId);
    if (existing) existing.remove();

    try {
      if (navigator?.clipboard?.writeText) {
        navigator.clipboard.writeText(QLVB_EXPORT_FOLDER).catch(() => {});
      }
    } catch {
      // Ignore clipboard error
    }

    const overlay = document.createElement('div');
    overlay.id = modalId;
    overlay.className =
      'fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-xs animate-fadeIn';
    overlay.innerHTML = `
      <div class="bg-white w-full max-w-md rounded-3xl shadow-2xl border-2 border-emerald-500 overflow-hidden text-slate-800">
        <div class="bg-gradient-to-r from-emerald-700 to-teal-700 text-white px-4 py-3.5 flex items-center justify-between">
          <div class="flex items-center gap-2.5">
            <span class="text-lg">📁</span>
            <div>
              <h3 class="text-xs font-black uppercase tracking-wide">Phát hiện chưa có thư mục QLVB_PRO</h3>
              <p class="text-[11px] text-emerald-100">Khởi tạo thư mục lưu trữ trước khi tải bản sao lưu</p>
            </div>
          </div>
          <button type="button" id="k02-folder-modal-close" class="w-7 h-7 rounded-full bg-white/15 hover:bg-white/25 text-white text-xs font-bold flex items-center justify-center">✕</button>
        </div>

        <div class="p-4 space-y-3 text-xs leading-relaxed">
          <div class="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-950 space-y-1.5">
            <div class="font-bold text-emerald-900">Đã tự động chép sẵn tên thư mục: <code class="px-1.5 py-0.5 rounded bg-emerald-600 text-white font-mono font-bold">QLVB_PRO</code></div>
            <ol class="list-decimal list-inside space-y-1 text-[11px] text-slate-700">
              <li>Bấm nút <strong>"Tạo & Chọn thư mục QLVB_PRO"</strong> bên dưới.</li>
              <li>Trong cửa sổ <strong>Downloads</strong> hiện ra: Bấm <strong>New folder</strong> &rarr; Nhấn <strong>Ctrl + V</strong> (để dán tên <code>QLVB_PRO</code>) &rarr; Nhấn <strong>Enter</strong>.</li>
              <li>Bấm <strong>Select Folder (Chọn thư mục)</strong> để lưu ngay bản sao lưu vào <code>QLVB_PRO</code>.</li>
            </ol>
          </div>

          <div id="k02-folder-modal-err" class="hidden p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-[11px] font-semibold"></div>

          <div class="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2 pt-1">
            <button type="button" id="k02-folder-modal-cancel" class="px-3.5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition">
              Hủy bỏ
            </button>
            <button type="button" id="k02-folder-modal-pick" class="flex-1 sm:flex-initial px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md transition active:scale-95">
              📁 Tạo & Chọn thư mục QLVB_PRO
            </button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const cleanup = () => {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    };

    const closeBtn = overlay.querySelector('#k02-folder-modal-close');
    const cancelBtn = overlay.querySelector('#k02-folder-modal-cancel');
    const pickBtn = overlay.querySelector('#k02-folder-modal-pick');
    const errBox = overlay.querySelector('#k02-folder-modal-err') as HTMLElement | null;

    const handleCancel = () => {
      cleanup();
      const cancelErr = new Error('Đã hủy tạo thư mục QLVB_PRO.');
      (cancelErr as any).isUserCancelled = true;
      reject(cancelErr);
    };

    closeBtn?.addEventListener('click', handleCancel);
    cancelBtn?.addEventListener('click', handleCancel);

    pickBtn?.addEventListener('click', async () => {
      try {
        if (navigator?.clipboard?.writeText) {
          navigator.clipboard.writeText(QLVB_EXPORT_FOLDER).catch(() => {});
        }
        const showDirPicker = (window as any).showDirectoryPicker;
        const pickedHandle = await showDirPicker({
          id: 'k02_qlvb_pro_folder',
          mode: 'readwrite',
          startIn: 'downloads',
        });
        if (!pickedHandle) return;

        const pickedName = String(pickedHandle.name || '').trim();
        if (/^new folder/i.test(pickedName)) {
          // User clicked New folder in Downloads but forgot to rename it to QLVB_PRO -> create QLVB_PRO inside or prompt
          if (errBox) {
            errBox.textContent =
              '⚠️ Bạn vừa chọn "New folder" chưa đổi tên. Vui lòng đổi tên thư mục thành "QLVB_PRO" (nhấn Ctrl + V) rồi bấm Select Folder!';
            errBox.classList.remove('hidden');
          }
          return;
        }

        await saveRootDirectoryHandle(pickedHandle);
        cleanup();

        if (pickedName.toUpperCase() === QLVB_EXPORT_FOLDER) {
          (pickedHandle as any).__displayPathPrefix = QLVB_EXPORT_FOLDER;
          resolve(pickedHandle);
          return;
        }

        const childQlvbHandle = await pickedHandle.getDirectoryHandle(QLVB_EXPORT_FOLDER, {
          create: true,
        });
        (childQlvbHandle as any).__displayPathPrefix = pickedName
          ? `${pickedName}/${QLVB_EXPORT_FOLDER}`
          : QLVB_EXPORT_PATH_LABEL;
        resolve(childQlvbHandle);
      } catch (err: any) {
        if (err?.name === 'AbortError') {
          if (errBox) {
            errBox.textContent =
              'Bạn vừa đóng cửa sổ chọn thư mục. Hãy bấm lại "📁 Tạo & Chọn thư mục QLVB_PRO" để chọn thư mục trước khi sao lưu.';
            errBox.classList.remove('hidden');
          }
          return;
        }
        if (errBox) {
          errBox.textContent =
            'Trình duyệt không cho phép chọn thẳng gốc Downloads. Hãy bấm "New folder" bên trong Downloads, nhấn Ctrl + V để đặt tên "QLVB_PRO", rồi chọn thư mục đó!';
          errBox.classList.remove('hidden');
        }
      }
    });
  });
}

/**
 * Obtain or create the "QLVB_PRO" subfolder on PC before downloading/saving backup.
 * - Detects if QLVB_PRO is missing or deleted on disk.
 * - If missing, prompts the user to create/select QLVB_PRO before proceeding with the backup.
 */
export async function ensurePcQlvbDirectoryHandle(forcePickNew = false): Promise<any | null> {
  if (typeof window === 'undefined') return null;
  const isApk = Boolean((window as any).AndroidBridge);
  if (isApk) return null;

  // Cross-origin iframes (like AI Studio preview pane) block showDirectoryPicker with SecurityError
  if (window.self !== window.top) return null;

  const showDirPicker = (window as any).showDirectoryPicker;
  if (typeof showDirPicker !== 'function') return null;

  let rootHandle: any = null;

  if (!forcePickNew) {
    const cached = inMemoryInitDone ? inMemoryRootHandle : await getSavedRootDirectoryHandle();
    if (cached) {
      const cachedName = String(cached.name || '').trim();
      if (/^new folder/i.test(cachedName)) {
        await clearSavedPcExportDirectoryHandle();
      } else if (await verifyHandleExistsAndWritable(cached)) {
        rootHandle = cached;
      } else {
        // Handle was deleted on disk or permission lost -> clear cache so we recreate QLVB_PRO
        await clearSavedPcExportDirectoryHandle();
      }
    }
  }

  if (!rootHandle) {
    // Missing QLVB_PRO directory -> open interactive pre-export modal to create/select QLVB_PRO first
    return await promptCreateMissingQlvbFolderModal();
  }

  const selectedFolderName = String(rootHandle.name || '').trim();
  // 1. User directly selected a folder named "QLVB_PRO" (e.g. Downloads/QLVB_PRO) -> save directly inside it
  if (selectedFolderName.toUpperCase() === QLVB_EXPORT_FOLDER) {
    (rootHandle as any).__displayPathPrefix = QLVB_EXPORT_FOLDER;
    return rootHandle;
  }

  // 2. User selected another parent folder -> automatically create "QLVB_PRO" inside it
  const childQlvbHandle = await rootHandle.getDirectoryHandle(QLVB_EXPORT_FOLDER, { create: true });
  (childQlvbHandle as any).__displayPathPrefix = selectedFolderName
    ? `${selectedFolderName}/${QLVB_EXPORT_FOLDER}`
    : QLVB_EXPORT_PATH_LABEL;
  return childQlvbHandle;
}

/**
 * Save a binary/base64/text file directly into QLVB_PRO on Android APK and PC
 */
export async function saveBase64ToQlvbFolder(
  base64Data: string,
  filename: string,
  mimeType: string,
  preAcquiredDirHandle?: any
): Promise<FileExportResult> {
  const cleanName = normalizeCleanFilename(filename);
  const relativePath = `${QLVB_EXPORT_FOLDER}/${cleanName}`;
  const bridge = typeof window !== 'undefined' ? (window as any).AndroidBridge : null;

  // 1. Android APK Native Bridge (MediaStore.Downloads + legacy Download/QLVB_PRO)
  if (bridge && typeof bridge.saveBase64File === 'function') {
    try {
      const ok = Boolean(bridge.saveBase64File(base64Data, relativePath));
      if (ok) {
        return {
          savedViaNativeBridge: true,
          createdSubfolder: true,
          targetPath: `${QLVB_EXPORT_PATH_LABEL}/${cleanName}`,
        };
      }
    } catch (err) {
      console.warn('AndroidBridge.saveBase64File failed, falling back:', err);
    }
  }

  // 2. Local PC Node Server (when running on localhost / 127.0.0.1)
  if (
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  ) {
    try {
      const resp = await fetch('/api/export-qlvb-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: cleanName, base64Data }),
      });
      if (resp.ok) {
        const data = await resp.json();
        if (data?.ok) {
          return {
            savedViaNativeBridge: true,
            createdSubfolder: true,
            targetPath: data.targetPath || `${QLVB_EXPORT_PATH_LABEL}/${cleanName}`,
          };
        }
      }
    } catch {
      // Proceed to File System Access API fallback
    }
  }

  const bytes = base64ToUint8Array(base64Data);

  // 3. PC Browser File System Access API (Detects missing QLVB_PRO -> prompts creation before saving)
  if (
    typeof window !== 'undefined' &&
    window.self === window.top &&
    typeof (window as any).showDirectoryPicker === 'function'
  ) {
    const qlvbDirHandle =
      preAcquiredDirHandle || (await ensurePcQlvbDirectoryHandle(false));
    if (qlvbDirHandle) {
      const fileHandle = await qlvbDirHandle.getFileHandle(cleanName, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(bytes);
      await writable.close();
      const folderPrefix =
        (qlvbDirHandle as any).__displayPathPrefix ||
        (await getLinkedPcExportFolderName()) ||
        QLVB_EXPORT_FOLDER;
      return {
        savedViaNativeBridge: false,
        createdSubfolder: true,
        targetPath: `${folderPrefix}/${cleanName}`,
      };
    }
  }

  // 4. Fallback for mobile browser PWA or cross-origin iframe
  const blob = new Blob([bytes as unknown as BlobPart], { type: mimeType });
  triggerBrowserDownload(blob, cleanName);

  const isIframe = typeof window !== 'undefined' && window.self !== window.top;
  return {
    savedViaNativeBridge: false,
    createdSubfolder: false,
    isIframeFallback: isIframe,
    targetPath: `Downloads/${cleanName}`,
  };
}

/**
 * Save an XLSX WorkBook directly into Download/QLVB_PRO/<filename>
 */
export async function saveWorkbookToQlvbFolder(
  wb: XLSX.WorkBook,
  filename: string,
  preAcquiredDirHandle?: any
): Promise<FileExportResult> {
  const cleanName = normalizeCleanFilename(filename);
  const base64Data = XLSX.write(wb, { bookType: 'xlsx', type: 'base64' });
  return saveBase64ToQlvbFolder(
    base64Data,
    cleanName,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    preAcquiredDirHandle
  );
}

/**
 * Save an ArrayBuffer directly into Download/QLVB_PRO/<filename>
 */
export async function saveArrayBufferToQlvbFolder(
  buffer: ArrayBuffer,
  filename: string,
  mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  preAcquiredDirHandle?: any
): Promise<FileExportResult> {
  const bytes = new Uint8Array(buffer);
  const base64Data = bytesToBase64(bytes);
  return saveBase64ToQlvbFolder(base64Data, filename, mimeType, preAcquiredDirHandle);
}

/**
 * Save a UTF-8 text/JSON string directly into Download/QLVB_PRO/<filename>
 */
export async function saveTextToQlvbFolder(
  textContent: string,
  filename: string,
  mimeType = 'application/json',
  preAcquiredDirHandle?: any
): Promise<FileExportResult> {
  const bytes = new TextEncoder().encode(textContent);
  const base64Data = bytesToBase64(bytes);
  return saveBase64ToQlvbFolder(base64Data, filename, mimeType, preAcquiredDirHandle);
}

function triggerBrowserDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    if (a.parentNode) a.parentNode.removeChild(a);
    URL.revokeObjectURL(url);
  }, 2500);
}

