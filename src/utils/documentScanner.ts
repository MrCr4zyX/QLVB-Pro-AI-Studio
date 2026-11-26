import { searchKey } from './dateUtils';

export type ScanEngine = 'ai' | 'offline';
export type ScanMode = 'auto' | 'offline';

export interface ScannedDocumentResult {
  issued: string;
  number: string;
  symbol: string;
  agency: string;
  documentType: string;
  summary: string;
  workFields: string[];
  engine: ScanEngine;
  fallbackNotice?: string;
}

export interface PreparedScanImage {
  base64: string;
  mimeType: string;
  previewUrl: string;
}

export interface ScanOptions {
  mode?: ScanMode;
  signal?: AbortSignal;
  onProgress?: (statusText: string) => void;
}

const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.86;

/**
 * Resolves the AI scan endpoint URL, supporting VITE_SCAN_API_URL for GitHub Pages PWA / APK.
 * Returns null when running on static-only hosts (GitHub Pages / Capacitor APK) without VITE_SCAN_API_URL.
 */
export function resolveAiScanEndpoint(): string | null {
  const configured = String(import.meta.env.VITE_SCAN_API_URL || '').trim().replace(/\/+$/, '');
  if (configured) {
    return configured.endsWith('/api/scan-document')
      ? configured
      : `${configured}/api/scan-document`;
  }

  if (typeof window !== 'undefined') {
    const { hostname, protocol } = window.location;
    const isStaticOnlyHost =
      hostname.endsWith('github.io') ||
      protocol === 'capacitor:' ||
      protocol === 'file:';
    if (isStaticOnlyHost) {
      return null;
    }
  }

  return '/api/scan-document';
}

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
 * Pre-processes image to crisp grayscale with gentle contrast boost for better Vietnamese OCR.
 */
async function preprocessForOfflineOcr(previewUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(previewUrl);
          return;
        }

        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        const contrast = 1.28;
        const intercept = 128 * (1 - contrast);

        for (let i = 0; i < data.length; i += 4) {
          const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
          const adjusted = Math.max(0, Math.min(255, gray * contrast + intercept));
          data[i] = adjusted;
          data[i + 1] = adjusted;
          data[i + 2] = adjusted;
        }
        ctx.putImageData(imageData, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      } catch {
        resolve(previewUrl);
      }
    };
    img.onerror = () => resolve(previewUrl);
    img.src = previewUrl;
  });
}

const PRESERVED_ACRONYMS = new Set([
  'BCA', 'UBND', 'HĐND', 'HDND', 'CSCĐ', 'CSCD', 'K02', 'CAT', 'CAH', 'CAP',
  'TW', 'CP', 'QH', 'TTg', 'BTL', 'CAND', 'VN', 'CNXH', 'XHCN', 'TAND', 'VKSND',
]);

function normalizeVietnameseTitle(raw: string): string {
  const cleaned = raw.replace(/\s+/g, ' ').trim();
  if (!cleaned) return '';
  const letters = cleaned.replace(/[^A-Za-zÀ-ỹ]/g, '');
  const upperLetters = cleaned.replace(/[^A-ZÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚĂĐĨŨƠƯẠẢẤẦẨẪẬẮẰẲẴẶẸẺẼẾỀỂỄỆỈỊỌỎỐỒỔỖỘỚỜỞỠỢỤỦỨỪỬỮỰỲỴÝỶỸ]/g, '');
  const isMostlyUpper = letters.length > 4 && upperLetters.length / letters.length > 0.75;
  if (!isMostlyUpper) return cleaned;

  const words = cleaned.split(' ');
  return words
    .map((word, idx) => {
      const bare = word.replace(/[^A-Za-zÀ-ỹ0-9]/g, '').toUpperCase();
      if (PRESERVED_ACRONYMS.has(bare) || /^[A-Z]\d{2}$/.test(bare) || /^[A-Z]{2}\d{2}$/.test(bare)) {
        return word.toUpperCase();
      }
      const lower = word.toLocaleLowerCase('vi-VN');
      if (idx === 0) {
        return lower.charAt(0).toLocaleUpperCase('vi-VN') + lower.slice(1);
      }
      return lower;
    })
    .join(' ');
}

function normalizeAgencyName(raw: string): string {
  const cleaned = raw.replace(/[|_~*]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!cleaned) return '';
  const words = cleaned.split(' ');
  const minorWords = new Set(['của', 'và', 'về', 'tại', 'số', 'tỉnh', 'thành', 'phố', 'huyện', 'quận', 'xã', 'phường']);
  return words
    .map((word, idx) => {
      const bare = word.replace(/[^A-Za-zÀ-ỹ0-9]/g, '').toUpperCase();
      if (PRESERVED_ACRONYMS.has(bare) || /^[A-Z]{1,3}\d{2}$/.test(bare)) {
        return word.toUpperCase();
      }
      const lower = word.toLocaleLowerCase('vi-VN');
      if (idx > 0 && minorWords.has(lower)) return lower;
      return lower.charAt(0).toLocaleUpperCase('vi-VN') + lower.slice(1);
    })
    .join(' ');
}

const SYMBOL_TYPE_MAP: Array<[RegExp, string]> = [
  [/^TTLT\b/i, 'Thông tư liên tịch'],
  [/^TT\b/i, 'Thông tư'],
  [/^QĐ[Ii]\b|^QDI\b/i, 'Quy định'],
  [/^QĐ\b|^QD\b/i, 'Quyết định'],
  [/^KH\b/i, 'Kế hoạch'],
  [/^HD\b/i, 'Hướng dẫn'],
  [/^CT\b/i, 'Chỉ thị'],
  [/^CV\b/i, 'Công văn'],
  [/^NQ\b/i, 'Nghị quyết'],
  [/^NĐ\b|^ND\b/i, 'Nghị định'],
  [/^PL\b/i, 'Pháp lệnh'],
];

const WORK_FIELD_KEYWORDS: Array<{ field: string; patterns: RegExp[] }> = [
  { field: 'Thi đua - Khen thưởng', patterns: [/thi đua/i, /khen thưởng/i, /bình xét/i, /phong trào/i] },
  { field: 'Tổ chức cán bộ', patterns: [/cán bộ/i, /biên chế/i, /bổ nhiệm/i, /điều động/i, /quy hoạch/i, /px01/i] },
  { field: 'Chính trị tư tưởng', patterns: [/chính trị/i, /tư tưởng/i, /tuyên truyền/i, /đảng ủy/i, /học tập/i, /px03/i] },
  { field: 'Tham mưu - Tổng hợp', patterns: [/tham mưu/i, /tổng hợp/i, /báo cáo định kỳ/i, /trực ban/i, /chương trình công tác/i, /giao ban/i] },
  { field: 'Huấn luyện', patterns: [/huấn luyện/i, /diễn tập/i, /quân sự/i, /võ thuật/i, /bắn súng/i, /điều lệnh/i] },
  { field: 'Hậu cần - Tài chính', patterns: [/hậu cần/i, /tài chính/i, /ngân sách/i, /kinh phí/i, /trang cấp/i, /quân trang/i, /doanh trại/i, /phương tiện/i] },
  { field: 'Tuyển sinh - Đào tạo', patterns: [/tuyển sinh/i, /đào tạo/i, /bồi dưỡng/i, /tập huấn/i, /chiêu sinh/i] },
  { field: 'Công tác quần chúng', patterns: [/đoàn thanh niên/i, /phụ nữ/i, /công đoàn/i, /quần chúng/i, /hiến máu/i, /thiện nguyện/i] },
  { field: 'Chế độ chính sách', patterns: [/chế độ/i, /chính sách/i, /bảo hiểm/i, /phụ cấp/i, /nghỉ phép/i, /thương binh/i, /liệt sĩ/i] },
  { field: 'Bảo vệ nội bộ', patterns: [/bảo vệ nội bộ/i, /bảo mật/i, /bí mật nhà nước/i, /kiểm tra nội bộ/i, /kỷ luật/i, /thanh tra/i] },
];

/**
 * Extracts Vietnamese administrative document metadata from raw OCR text.
 */
function parseVietnameseDocumentText(
  rawText: string,
  documentTypes: string[],
  workFields: string[]
): Omit<ScannedDocumentResult, 'engine' | 'fallbackNotice'> {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => l.length > 0);

  const fullText = lines.join('\n');

  // 1. Ngày ban hành (DD/MM/YYYY)
  let issued = '';
  const vnDateMatch = fullText.match(
    /ng[aàáảãạăằắẳẵặâầấẩẫậ]y\s*(\d{1,2})\s*th[aàáảãạăằắẳẵặâầấẩẫậ]ng\s*(\d{1,2})\s*n[aăâàáảãạằắẳẵặầấẩẫậ]m\s*((?:19|20)\d{2})/i
  );
  if (vnDateMatch) {
    const dd = Number(vnDateMatch[1]);
    const mm = Number(vnDateMatch[2]);
    const yyyy = Number(vnDateMatch[3]);
    if (dd >= 1 && dd <= 31 && mm >= 1 && mm <= 12) {
      issued = `${String(dd).padStart(2, '0')}/${String(mm).padStart(2, '0')}/${yyyy}`;
    }
  } else {
    const topBlock = lines.slice(0, 10).join(' ');
    const slashDateMatch = topBlock.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-]((?:19|20)\d{2})\b/);
    if (slashDateMatch) {
      const dd = Number(slashDateMatch[1]);
      const mm = Number(slashDateMatch[2]);
      const yyyy = Number(slashDateMatch[3]);
      if (dd >= 1 && dd <= 31 && mm >= 1 && mm <= 12) {
        issued = `${String(dd).padStart(2, '0')}/${String(mm).padStart(2, '0')}/${yyyy}`;
      }
    }
  }

  // 2. Số văn bản & Ký hiệu
  let number = '';
  let symbol = '';
  let numberLineIdx = -1;

  const soLinePatterns = [
    /S[ốôoổộ]\s*[:.;]?\s*([0-9A-Za-zÀ-ỹ\-\.]+)\s*\/\s*([A-Za-zĐđ0-9\-\.\/]+)/i,
    /\b(\d{1,5})\s*\/\s*([A-ZĐ]{1,5}(?:-[A-ZĐ0-9]{1,10}){1,4})\b/,
  ];

  for (let i = 0; i < Math.min(lines.length, 15); i++) {
    const line = lines[i];
    for (const pattern of soLinePatterns) {
      const m = line.match(pattern);
      if (m) {
        number = m[1].trim();
        symbol = m[2].replace(/[.,;:\s]+$/, '').trim().toUpperCase();
        numberLineIdx = i;
        break;
      }
    }
    if (number) break;
  }

  // 3. Cơ quan ký (góc trên bên trái, phía trên dòng Số:)
  let agency = '';
  const agencyCandidates: string[] = [];
  const stopIdx = numberLineIdx > 0 ? numberLineIdx : Math.min(lines.length, 6);
  for (let i = 0; i < stopIdx; i++) {
    let cleaned = lines[i]
      .replace(/C[ỘO]NG\s*H[ÒO]A.*$/i, '')
      .replace(/[ĐD][ỘO]C\s*L[ẬA]P.*$/i, '')
      .replace(/H[ÀA]\s*N[ỘO]I\s*,?\s*ng[aà]y.*$/i, '')
      .replace(/ng[aà]y\s*\d{1,2}\s*th[aá]ng.*$/i, '')
      .replace(/[_\-=*]{3,}/g, '')
      .trim();

    if (cleaned.length >= 4 && !/^(s[ốôo]|v\/v)/i.test(cleaned)) {
      agencyCandidates.push(cleaned);
    }
  }
  if (agencyCandidates.length > 0) {
    // Prefer the direct issuing unit (second line if two lines exist)
    const chosen = agencyCandidates.length >= 2 ? agencyCandidates[1] : agencyCandidates[0];
    agency = normalizeAgencyName(chosen);
  }

  // 4. Loại văn bản
  let documentType = '';
  if (symbol) {
    for (const [regex, typeName] of SYMBOL_TYPE_MAP) {
      if (regex.test(symbol)) {
        documentType = typeName;
        break;
      }
    }
  }

  const knownTypeHeadings = [
    'THÔNG TƯ LIÊN TỊCH',
    'QUYẾT ĐỊNH',
    'QUY ĐỊNH',
    'NGHỊ QUYẾT',
    'NGHỊ ĐỊNH',
    'PHÁP LỆNH',
    'KẾ HOẠCH',
    'HƯỚNG DẪN',
    'THÔNG TƯ',
    'CHỈ THỊ',
    'CÔNG VĂN',
    'LUẬT',
  ];

  let headingLineIdx = -1;
  let matchedHeadingName = '';

  for (let i = 0; i < Math.min(lines.length, 22); i++) {
    const key = searchKey(lines[i]);
    for (const heading of knownTypeHeadings) {
      const hKey = searchKey(heading);
      if (key === hKey || (key.startsWith(hKey + ' ') && lines[i].length < 85)) {
        headingLineIdx = i;
        matchedHeadingName = heading;
        if (!documentType) {
          documentType =
            documentTypes.find((t) => searchKey(t) === hKey) ||
            normalizeVietnameseTitle(heading);
        }
        break;
      }
    }
    if (headingLineIdx !== -1) break;
  }

  if (!documentType && /\bV\/v\b/i.test(fullText)) {
    documentType = 'Công văn';
  }

  // Map documentType cleanly to provided documentTypes
  if (documentType && documentTypes.length > 0) {
    const target = searchKey(documentType);
    const exact =
      documentTypes.find((t) => searchKey(t) === target) ||
      documentTypes.find((t) => searchKey(t).includes(target) || target.includes(searchKey(t)));
    if (exact) documentType = exact;
  }

  // 5. Trích yếu nội dung
  let summary = '';
  const bodyStopRegex = /^(k[íi]nh\s*g[ửu]i|c[ăa]n\s*c[ứu]|th[ựư]c\s*hi[ệe]n|n[ơo]i\s*nh[ậa]n|[I1]\.\s|[ĐD]i[ềe]u\s*1\b|th[ờo]i\s*gian)/i;

  // Case A: "V/v ..." (Công văn)
  const vvIdx = lines.findIndex((l, idx) => idx < 20 && /^(V\/v|V\.v|Về\s*việc)\b/i.test(l));
  if (vvIdx !== -1) {
    const parts: string[] = [];
    for (let i = vvIdx; i < Math.min(lines.length, vvIdx + 4); i++) {
      const l = lines[i].replace(/K[íi]nh\s*g[ửu]i.*$/i, '').trim();
      if (i > vvIdx && (bodyStopRegex.test(l) || /^[_\-=*]{3,}$/.test(l) || l.length < 3)) break;
      if (l) parts.push(l);
    }
    summary = normalizeVietnameseTitle(
      parts
        .join(' ')
        .replace(/^(V\/v|V\.v)\s*[:.]?\s*/i, '')
        .trim()
    );
  }

  // Case B: Centered document title heading (KẾ HOẠCH / QUYẾT ĐỊNH / HƯỚNG DẪN / QUY ĐỊNH / CHỈ THỊ...)
  if (!summary && headingLineIdx !== -1) {
    const headingLine = lines[headingLineIdx];
    const hKey = searchKey(matchedHeadingName);
    const subParts: string[] = [];

    // If heading line itself already contains more text after the type name
    if (searchKey(headingLine).length > hKey.length + 3) {
      subParts.push(headingLine);
    } else {
      subParts.push(documentType || normalizeVietnameseTitle(matchedHeadingName));
    }

    for (let i = headingLineIdx + 1; i < Math.min(lines.length, headingLineIdx + 5); i++) {
      const l = lines[i];
      if (bodyStopRegex.test(l) || /^[_\-=*]{3,}$/.test(l) || l.length < 4) break;
      subParts.push(l);
    }

    summary = normalizeVietnameseTitle(subParts.join(' '));
  }

  // Case C: Fallback — look for inline "về việc ..."
  if (!summary) {
    const inlineMatch = fullText.match(/(về\s+việc[^\n]{10,220})/i);
    if (inlineMatch) {
      summary = normalizeVietnameseTitle(inlineMatch[1]);
    }
  }

  // 6. Lĩnh vực công tác (keyword inference)
  const matchedWorkFields: string[] = [];
  const searchPool = `${summary} ${fullText.slice(0, 600)}`;
  for (const item of WORK_FIELD_KEYWORDS) {
    if (item.patterns.some((p) => p.test(searchPool))) {
      const validField = workFields.find((f) => searchKey(f) === searchKey(item.field));
      if (validField && !matchedWorkFields.includes(validField)) {
        matchedWorkFields.push(validField);
      }
    }
    if (matchedWorkFields.length >= 2) break;
  }

  return {
    issued,
    number,
    symbol,
    agency,
    documentType,
    summary,
    workFields: matchedWorkFields,
  };
}

/**
 * Runs on-device Vietnamese OCR via lazy-loaded Tesseract.js (zero impact on initial bundle).
 */
async function scanWithOfflineTesseract(
  prepared: PreparedScanImage,
  documentTypes: string[],
  workFields: string[],
  options: ScanOptions,
  fallbackNotice?: string
): Promise<ScannedDocumentResult> {
  if (options.signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }

  options.onProgress?.('Đang khởi động bộ nhận diện OCR trên máy...');
  const processedUrl = await preprocessForOfflineOcr(prepared.previewUrl);

  if (options.signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }

  // Dynamic import keeps tesseract.js out of the initial JS bundle
  const { createWorker } = await import('tesseract.js');

  const worker = await createWorker('vie', 1, {
    logger: (m: { status?: string; progress?: number }) => {
      if (options.signal?.aborted) return;
      const pct = typeof m.progress === 'number' ? Math.round(m.progress * 100) : 0;
      if (m.status === 'loading language traineddata') {
        options.onProgress?.(`Đang tải gói tiếng Việt cho OCR máy (${pct}%)...`);
      } else if (m.status === 'recognizing text') {
        options.onProgress?.(`OCR trên máy đang đọc chữ tiếng Việt (${pct}%)...`);
      } else if (m.status === 'initializing api' || m.status === 'loading tesseract core') {
        options.onProgress?.('Đang chuẩn bị bộ máy OCR offline...');
      }
    },
  });

  const abortHandler = () => {
    worker.terminate().catch(() => {});
  };
  options.signal?.addEventListener('abort', abortHandler, { once: true });

  try {
    const {
      data: { text },
    } = await worker.recognize(processedUrl);

    if (options.signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }

    const parsed = parseVietnameseDocumentText(text || '', documentTypes, workFields);
    return {
      ...parsed,
      engine: 'offline',
      fallbackNotice,
    };
  } finally {
    options.signal?.removeEventListener('abort', abortHandler);
    await worker.terminate().catch(() => {});
  }
}

/**
 * Hybrid document scanner:
 * 1) Uses server-side Gemini AI when online and an AI backend endpoint is available.
 * 2) Automatically falls back to lazy-loaded on-device Tesseract.js OCR when offline,
 *    on static PWA (GitHub Pages) / APK without a backend URL, or when the server is unreachable.
 */
export async function scanDocumentImage(
  prepared: PreparedScanImage,
  documentTypes: string[],
  workFields: string[],
  options: ScanOptions = {}
): Promise<ScannedDocumentResult> {
  const mode: ScanMode = options.mode || 'auto';
  const endpoint = resolveAiScanEndpoint();
  const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;

  // User explicitly selected offline on-device OCR
  if (mode === 'offline') {
    return scanWithOfflineTesseract(
      prepared,
      documentTypes,
      workFields,
      options,
      'Chế độ OCR trực tiếp trên máy (không gửi ảnh lên mạng).'
    );
  }

  // Automatically use offline OCR if browser is offline or running on static PWA/APK without VITE_SCAN_API_URL
  if (isOffline) {
    return scanWithOfflineTesseract(
      prepared,
      documentTypes,
      workFields,
      options,
      'Thiết bị đang ngoại tuyến — đã tự động chuyển sang OCR trên máy.'
    );
  }

  if (!endpoint) {
    return scanWithOfflineTesseract(
      prepared,
      documentTypes,
      workFields,
      options,
      'Đang chạy bản PWA/APK độc lập — đã tự động quét bằng OCR trên máy.'
    );
  }

  // Try online AI backend first
  options.onProgress?.('AI đang phân tích số văn bản, ngày ban hành, trích yếu...');

  try {
    const response = await fetch(endpoint, {
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
      signal: options.signal,
    });

    const contentType = response.headers.get('content-type') || '';
    const payload = contentType.includes('application/json')
      ? await response.json().catch(() => null)
      : null;

    if (response.ok && payload?.ok && payload.data) {
      return {
        ...(payload.data as Omit<ScannedDocumentResult, 'engine'>),
        engine: 'ai',
      };
    }

    // Static host / missing backend route (404/405/502/503/504) -> seamless fallback to Tesseract.js
    if ([404, 405, 502, 503, 504].includes(response.status)) {
      return scanWithOfflineTesseract(
        prepared,
        documentTypes,
        workFields,
        options,
        `Máy chủ AI không khả dụng (mã ${response.status}) — đã tự động chuyển sang OCR trên máy.`
      );
    }

    // Genuine AI API error (e.g., 403 invalid key, 429 quota exceeded, 400/500) -> surface clearly
    throw new Error(
      payload?.error || `Lỗi máy chủ AI (${response.status}). Vui lòng thử lại hoặc chọn chế độ OCR trên máy.`
    );
  } catch (err: any) {
    if (err?.name === 'AbortError' || options.signal?.aborted) {
      throw err;
    }

    // Network/CORS failure when reaching AI backend -> automatic fallback to on-device OCR
    if (err instanceof TypeError || /failed to fetch|networkerror|load failed/i.test(String(err?.message || ''))) {
      return scanWithOfflineTesseract(
        prepared,
        documentTypes,
        workFields,
        options,
        'Không kết nối được máy chủ AI — đã tự động chuyển sang OCR trên máy.'
      );
    }

    throw err;
  }
}
