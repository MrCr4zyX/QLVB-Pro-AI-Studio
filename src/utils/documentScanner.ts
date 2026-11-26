export interface ScannedDocumentResult {
  issued: string;
  number: string;
  symbol: string;
  agency: string;
  documentType: string;
  summary: string;
  workFields: string[];
}

export interface PreparedScanImage {
  base64: string;
  mimeType: string;
  previewUrl: string;
}

const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.86;

/**
 * Resizes and compresses an uploaded/captured image in-browser for fast, crisp OCR upload.
 */
export async function prepareImageForScan(file: File | Blob): Promise<PreparedScanImage> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      try {
        let { naturalWidth: width, naturalHeight: height } = img;
        if (!width || !height) {
          URL.revokeObjectURL(objectUrl);
          reject(new Error('Không thể đọc kích thước hình ảnh.'));
          return;
        }

        if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
          const ratio = Math.min(MAX_DIMENSION / width, MAX_DIMENSION / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          URL.revokeObjectURL(objectUrl);
          reject(new Error('Trình duyệt không hỗ trợ xử lý hình ảnh.'));
          return;
        }

        // White background in case of transparent PNG
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
        const base64 = dataUrl.split(',')[1] || '';
        URL.revokeObjectURL(objectUrl);

        if (!base64) {
          reject(new Error('Không thể chuyển đổi hình ảnh.'));
          return;
        }

        resolve({
          base64,
          mimeType: 'image/jpeg',
          previewUrl: dataUrl,
        });
      } catch (err) {
        URL.revokeObjectURL(objectUrl);
        reject(err instanceof Error ? err : new Error('Lỗi khi nén hình ảnh.'));
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Tệp không phải là hình ảnh hợp lệ hoặc không thể mở.'));
    };

    img.src = objectUrl;
  });
}

/**
 * Sends a compressed document image to the server-side Gemini OCR endpoint.
 */
export async function scanDocumentImage(
  prepared: PreparedScanImage,
  documentTypes: string[],
  workFields: string[],
  signal?: AbortSignal
): Promise<ScannedDocumentResult> {
  const response = await fetch('/api/scan-document', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      imageBase64: prepared.base64,
      mimeType: prepared.mimeType,
      documentTypes,
      workFields,
    }),
    signal,
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) {
    throw new Error(
      payload?.error || `Lỗi máy chủ (${response.status}). Vui lòng kiểm tra kết nối mạng và thử lại.`
    );
  }

  return payload.data as ScannedDocumentResult;
}
