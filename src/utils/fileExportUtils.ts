import * as XLSX from 'xlsx';

export const QLVB_EXPORT_FOLDER = 'QLVB_PRO';
export const QLVB_EXPORT_PATH_LABEL = `Download/${QLVB_EXPORT_FOLDER}`;

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

/**
 * Save a binary/base64/text file directly into Download/QLVB_PRO on Android APK,
 * or trigger browser download on Web/PWA/PC.
 */
export function saveBase64ToQlvbFolder(
  base64Data: string,
  filename: string,
  mimeType: string
): { savedViaNativeBridge: boolean; targetPath: string } {
  const cleanName = normalizeCleanFilename(filename);
  const relativePath = `${QLVB_EXPORT_FOLDER}/${cleanName}`;
  const bridge = typeof window !== 'undefined' ? (window as any).AndroidBridge : null;

  if (bridge && typeof bridge.saveBase64File === 'function') {
    try {
      const ok = Boolean(bridge.saveBase64File(base64Data, relativePath));
      if (ok) {
        return {
          savedViaNativeBridge: true,
          targetPath: `${QLVB_EXPORT_PATH_LABEL}/${cleanName}`,
        };
      }
    } catch (err) {
      console.warn('AndroidBridge.saveBase64File failed, falling back to browser download:', err);
    }
  }

  // Fallback for Web / PWA / PC browsers
  const binaryStr = window.atob(base64Data);
  const len = binaryStr.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  const blob = new Blob([bytes], { type: mimeType });
  triggerBrowserDownload(blob, cleanName);

  return {
    savedViaNativeBridge: false,
    targetPath: `${QLVB_EXPORT_PATH_LABEL}/${cleanName}`,
  };
}

/**
 * Save an XLSX WorkBook directly into Download/QLVB_PRO/<filename>
 */
export function saveWorkbookToQlvbFolder(
  wb: XLSX.WorkBook,
  filename: string
): { savedViaNativeBridge: boolean; targetPath: string } {
  const cleanName = normalizeCleanFilename(filename);
  const base64Data = XLSX.write(wb, { bookType: 'xlsx', type: 'base64' });
  return saveBase64ToQlvbFolder(
    base64Data,
    cleanName,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
}

/**
 * Save an ArrayBuffer directly into Download/QLVB_PRO/<filename>
 */
export function saveArrayBufferToQlvbFolder(
  buffer: ArrayBuffer,
  filename: string,
  mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
): { savedViaNativeBridge: boolean; targetPath: string } {
  const bytes = new Uint8Array(buffer);
  const base64Data = bytesToBase64(bytes);
  return saveBase64ToQlvbFolder(base64Data, filename, mimeType);
}

/**
 * Save a UTF-8 text/JSON string directly into Download/QLVB_PRO/<filename>
 */
export function saveTextToQlvbFolder(
  textContent: string,
  filename: string,
  mimeType = 'application/json'
): { savedViaNativeBridge: boolean; targetPath: string } {
  const bytes = new TextEncoder().encode(textContent);
  const base64Data = bytesToBase64(bytes);
  return saveBase64ToQlvbFolder(base64Data, filename, mimeType);
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
