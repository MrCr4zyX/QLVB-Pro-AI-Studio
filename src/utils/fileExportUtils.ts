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

export async function getLinkedPcExportFolderName(): Promise<string | null> {
  const handle = inMemoryRootHandle || (await getSavedRootDirectoryHandle());
  if (!handle) return null;
  const name = String(handle.name || 'Downloads');
  return name.toUpperCase() === QLVB_EXPORT_FOLDER ? name : `${name}/${QLVB_EXPORT_FOLDER}`;
}

export function supportsDirectoryPicker(): boolean {
  return (
    typeof window !== 'undefined' &&
    !Boolean((window as any).AndroidBridge) &&
    typeof (window as any).showDirectoryPicker === 'function' &&
    window.self === window.top
  );
}

async function verifyHandleReadWritePermission(handle: any): Promise<boolean> {
  if (!handle) return false;
  try {
    const opts = { mode: 'readwrite' };
    if (typeof handle.queryPermission === 'function') {
      const current = await handle.queryPermission(opts);
      if (current === 'granted') return true;
    }
    if (typeof handle.requestPermission === 'function') {
      const requested = await handle.requestPermission(opts);
      return requested === 'granted';
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Obtain or create the "QLVB_PRO" subfolder inside the user's chosen Downloads directory on PC.
 * Call this synchronously at the very start of a user click handler so transient user activation is preserved.
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
    // Use in-memory handle first to avoid IndexedDB async delay consuming user activation
    const cached = inMemoryInitDone ? inMemoryRootHandle : await getSavedRootDirectoryHandle();
    if (cached && (await verifyHandleReadWritePermission(cached))) {
      rootHandle = cached;
    }
  }

  if (!rootHandle) {
    rootHandle = await showDirPicker({
      id: 'k02_qlvb_downloads',
      mode: 'readwrite',
      startIn: 'downloads',
    });
    if (rootHandle) {
      await saveRootDirectoryHandle(rootHandle);
    }
  }

  if (!rootHandle) return null;

  // Automatically create child folder QLVB_PRO unless the user already selected QLVB_PRO itself
  if (String(rootHandle.name || '').toUpperCase() === QLVB_EXPORT_FOLDER) {
    return rootHandle;
  }
  return await rootHandle.getDirectoryHandle(QLVB_EXPORT_FOLDER, { create: true });
}

/**
 * Save a binary/base64/text file directly into Download/QLVB_PRO on Android APK and PC
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

  // 3. PC Browser File System Access API (creates real Download/QLVB_PRO subfolder)
  if (typeof window !== 'undefined' && typeof (window as any).showDirectoryPicker === 'function') {
    try {
      const qlvbDirHandle = preAcquiredDirHandle || (await ensurePcQlvbDirectoryHandle(false));
      if (qlvbDirHandle) {
        const fileHandle = await qlvbDirHandle.getFileHandle(cleanName, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(bytes);
        await writable.close();
        return {
          savedViaNativeBridge: false,
          createdSubfolder: true,
          targetPath: `${QLVB_EXPORT_PATH_LABEL}/${cleanName}`,
        };
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        const cancelErr = new Error('Đã hủy chọn thư mục lưu tệp.');
        (cancelErr as any).isUserCancelled = true;
        throw cancelErr;
      }
      console.warn('showDirectoryPicker failed or blocked by iframe, falling back to browser download:', err);
    }
  }

  // 4. Fallback for cross-origin iframe or mobile browsers without File System Access API
  const blob = new Blob([bytes as unknown as BlobPart], { type: mimeType });
  triggerBrowserDownload(blob, cleanName);

  const isIframe = typeof window !== 'undefined' && window.self !== window.top;
  return {
    savedViaNativeBridge: false,
    createdSubfolder: false,
    isIframeFallback: isIframe,
    targetPath: isIframe ? `Downloads/${cleanName}` : `${QLVB_EXPORT_PATH_LABEL}/${cleanName}`,
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

