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

interface PreprocessedRegions {
  fullUrl: string;
  leftHeaderUrl: string;
  rightHeaderUrl: string;
}

/**
 * Local adaptive shadow-removal + contrast normalization for phone camera photos of paper documents.
 * Splits the 2-column Vietnamese administrative header into clean left (Agency, Số, V/v) and right (Quốc hiệu, Ngày) crops
 * so Tesseract does not mix left and right columns together.
 */
async function preprocessRegionsForOfflineOcr(previewUrl: string): Promise<PreprocessedRegions> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        // Upscale small photos slightly so Vietnamese diacritics are sharp for Tesseract
        const minTargetWidth = 1400;
        const maxTargetWidth = 2000;
        let width = img.naturalWidth;
        let height = img.naturalHeight;
        if (width < minTargetWidth) {
          const scale = Math.min(2.2, minTargetWidth / width);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        } else if (width > maxTargetWidth) {
          const scale = maxTargetWidth / width;
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) {
          resolve({ fullUrl: previewUrl, leftHeaderUrl: previewUrl, rightHeaderUrl: previewUrl });
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        const srcData = ctx.getImageData(0, 0, width, height);

        // Estimate smooth local illumination/shadow background via low-res downsample + bilinear upsample
        const bgW = Math.max(16, Math.round(width / 32));
        const bgH = Math.max(8, Math.round(height / 32));
        const smallCanvas = document.createElement('canvas');
        smallCanvas.width = bgW;
        smallCanvas.height = bgH;
        const smallCtx = smallCanvas.getContext('2d');
        const bgCanvas = document.createElement('canvas');
        bgCanvas.width = width;
        bgCanvas.height = height;
        const bgCtx = bgCanvas.getContext('2d', { willReadFrequently: true });

        let bgPixels: Uint8ClampedArray | null = null;
        if (smallCtx && bgCtx) {
          smallCtx.imageSmoothingEnabled = true;
          smallCtx.drawImage(canvas, 0, 0, bgW, bgH);
          bgCtx.imageSmoothingEnabled = true;
          bgCtx.drawImage(smallCanvas, 0, 0, width, height);
          bgPixels = bgCtx.getImageData(0, 0, width, height).data;
        }

        const data = srcData.data;
        for (let i = 0; i < data.length; i += 4) {
          const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
          let val = gray;
          if (bgPixels) {
            const bgGray = Math.max(
              36,
              0.299 * bgPixels[i] + 0.587 * bgPixels[i + 1] + 0.114 * bgPixels[i + 2]
            );
            // Flatten uneven shadow illumination so shadowed paper becomes clean white
            val = Math.min(255, (gray / bgGray) * 246);
          }
          // Soft contrast stretch: whiten paper (>224) and sharpen dark ink (<170)
          let enhanced: number;
          if (val >= 224) {
            enhanced = 255;
          } else if (val <= 95) {
            enhanced = Math.max(0, val * 0.55);
          } else {
            enhanced = ((val - 95) / (224 - 95)) * 203 + 52;
          }
          data[i] = enhanced;
          data[i + 1] = enhanced;
          data[i + 2] = enhanced;
          data[i + 3] = 255;
        }
        ctx.putImageData(srcData, 0, 0);

        const fullUrl = canvas.toDataURL('image/png');

        // Crop header area (for wide header shots use full height; for full A4 portrait use top 55%)
        const isPortraitFullPage = height > width * 1.1;
        const headerHeight = isPortraitFullPage ? Math.round(height * 0.52) : height;

        const cropRegion = (xRatio: number, wRatio: number, hPx: number): string => {
          const sx = Math.round(width * xRatio);
          const sw = Math.round(width * wRatio);
          const pad = 20;
          const c = document.createElement('canvas');
          c.width = sw + pad * 2;
          c.height = hPx + pad * 2;
          const cCtx = c.getContext('2d');
          if (!cCtx) return fullUrl;
          cCtx.fillStyle = '#ffffff';
          cCtx.fillRect(0, 0, c.width, c.height);
          cCtx.drawImage(canvas, sx, 0, sw, hPx, pad, pad, sw, hPx);
          return c.toDataURL('image/png');
        };

        // Left column (0% -> 54%): Agency, Số/Ký hiệu, V/v trích yếu
        const leftHeaderUrl = cropRegion(0, 0.54, headerHeight);
        // Right column (46% -> 100%): Quốc hiệu, Địa danh ngày tháng năm
        const rightHeaderUrl = cropRegion(0.46, 0.54, headerHeight);

        resolve({ fullUrl, leftHeaderUrl, rightHeaderUrl });
      } catch {
        resolve({ fullUrl: previewUrl, leftHeaderUrl: previewUrl, rightHeaderUrl: previewUrl });
      }
    };
    img.onerror = () =>
      resolve({ fullUrl: previewUrl, leftHeaderUrl: previewUrl, rightHeaderUrl: previewUrl });
    img.src = previewUrl;
  });
}

const PRESERVED_ACRONYMS = new Set([
  'BCA', 'UBND', 'HĐND', 'HDND', 'CSCĐ', 'CSCD', 'K02', 'CAT', 'CAH', 'CAP',
  'TW', 'CP', 'QH', 'TTg', 'BTL', 'CAND', 'VN', 'CNXH', 'XHCN', 'TAND', 'VKSND',
  'BHYT', 'BHXH', 'CBCS', 'ANTT', 'ATGT', 'PCCC', 'CNCH',
]);

function normalizeVietnameseTitle(raw: string): string {
  const cleaned = raw.replace(/\s+/g, ' ').trim();
  if (!cleaned) return '';
  const letters = cleaned.replace(/[^A-Za-zÀ-ỹ]/g, '');
  const upperLetters = cleaned.replace(
    /[^A-ZÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚĂĐĨŨƠƯẠẢẤẦẨẪẬẮẰẲẴẶẸẺẼẾỀỂỄỆỈỊỌỎỐỒỔỖỘỚỜỞỠỢỤỦỨỪỬỮỰỲỴÝỶỸ]/g,
    ''
  );
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
  const cleaned = raw
    .replace(/^[^A-Za-zÀ-ỹ]+/, '')
    .replace(/[|_~*=`]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return '';
  const words = cleaned.split(' ');
  const minorWords = new Set([
    'của', 'và', 'về', 'tại', 'số', 'tỉnh', 'thành', 'phố', 'huyện', 'quận', 'xã', 'phường', 'khu', 'vực',
  ]);
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

const AGENCY_KEYWORD_PATTERNS = [
  /bộ\s*tư\s*lệnh/i,
  /bộ\s*công\s*an/i,
  /trung\s*đoàn/i,
  /tiểu\s*đoàn/i,
  /cảnh\s*sát/i,
  /cscđ|cscd/i,
  /công\s*an/i,
  /ủy\s*ban|uỷ\s*ban|ubnd/i,
  /tỉnh\s*ủy|thành\s*ủy|đảng\s*ủy|huyện\s*ủy/i,
  /cục\s+|phòng\s+|ban\s+|sở\s+|viện\s+|học\s*viện|trường\s+/i,
  /chính\s*phủ|quốc\s*hội|bộ\s+[a-zà-ỹ]{2,}/i,
];

function isCleanAgencyLine(line: string): boolean {
  const trimmed = line.replace(/^[^A-Za-zÀ-ỹ]+/, '').trim();
  if (trimmed.length < 5) return false;
  if (/^(s[ốôoổộ]|v\s*[\/\\.,]\s*v|k[íi]nh\s*g[ửu]i|c[ộo]ng\s*h[òo]a|[đd][ộo]c\s*l[ậa]p)/i.test(trimmed)) {
    return false;
  }
  const letterCount = (trimmed.match(/[A-Za-zÀ-ỹ]/g) || []).length;
  const nonSpaceCount = trimmed.replace(/\s+/g, '').length;
  if (letterCount < 4 || letterCount / Math.max(1, nonSpaceCount) < 0.65) {
    return false;
  }
  return true;
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
  { field: 'Tổ chức cán bộ', patterns: [/tổ chức cán bộ/i, /biên chế/i, /bổ nhiệm/i, /điều động/i, /quy hoạch/i, /px01/i] },
  { field: 'Chính trị tư tưởng', patterns: [/chính trị/i, /tư tưởng/i, /tuyên truyền/i, /đảng ủy/i, /học tập/i, /px03/i] },
  { field: 'Tham mưu - Tổng hợp', patterns: [/tham mưu/i, /tổng hợp/i, /báo cáo định kỳ/i, /trực ban/i, /chương trình công tác/i, /giao ban/i] },
  { field: 'Huấn luyện', patterns: [/huấn luyện/i, /diễn tập/i, /quân sự/i, /võ thuật/i, /bắn súng/i, /điều lệnh/i] },
  { field: 'Hậu cần - Tài chính', patterns: [/hậu cần/i, /tài chính/i, /ngân sách/i, /kinh phí/i, /trang cấp/i, /quân trang/i, /doanh trại/i, /phương tiện/i] },
  { field: 'Tuyển sinh - Đào tạo', patterns: [/tuyển sinh/i, /đào tạo/i, /bồi dưỡng/i, /tập huấn/i, /chiêu sinh/i] },
  { field: 'Công tác quần chúng', patterns: [/đoàn thanh niên/i, /phụ nữ/i, /công đoàn/i, /quần chúng/i, /hiến máu/i, /thiện nguyện/i] },
  { field: 'Chế độ chính sách', patterns: [/chế độ/i, /chính sách/i, /bảo hiểm/i, /bhyt/i, /bhxh/i, /thẻ bhyt/i, /lao động hợp đồng/i, /thân nhân/i, /phụ cấp/i, /nghỉ phép/i, /thương binh/i, /liệt sĩ/i] },
  { field: 'Bảo vệ nội bộ', patterns: [/bảo vệ nội bộ/i, /bảo mật/i, /bí mật nhà nước/i, /kiểm tra nội bộ/i, /kỷ luật/i, /thanh tra/i] },
];

function extractIssuedDateFromText(text: string): string {
  // Primary: Vietnamese administrative format (tolerant of italic OCR glitches & missing spaces like "ngày17 tháng 11 năm 2026")
  const vnPatterns = [
    /ng[aàáảãạăằắẳẵặâầấẩẫậeêệoôơuưyý]{1,3}y?\s*[:.,]?\s*(\d{1,2})\s*th[aàáảãạăằắẳẵặâầấẩẫậoô]{1,3}n?g?\s*(\d{1,2})\s*n[aăâàáảãạằắẳẵặầấẩẫậo]{1,3}m?\s*((?:19|20)\d{2})/i,
    /(\d{1,2})\s*th[aàáảãạăằắẳẵặâầấẩẫậ]ng\s*(\d{1,2})\s*n[aăâàáảãạằắẳẵặầấẩẫậ]m\s*((?:19|20)\d{2})/i,
    /,\s*ng\S{0,4}\s*(\d{1,2})\s+\S{2,6}\s+(\d{1,2})\s+\S{2,5}\s+((?:19|20)\d{2})/i,
    /\b(\d{1,2})[\/\-](\d{1,2})[\/\-]((?:19|20)\d{2})\b/,
  ];

  for (const pattern of vnPatterns) {
    const m = text.match(pattern);
    if (m) {
      const dd = Number(m[1]);
      const mm = Number(m[2]);
      const yyyy = Number(m[3]);
      if (dd >= 1 && dd <= 31 && mm >= 1 && mm <= 12 && yyyy >= 1990 && yyyy <= 2099) {
        return `${String(dd).padStart(2, '0')}/${String(mm).padStart(2, '0')}/${yyyy}`;
      }
    }
  }
  return '';
}

function toCleanLines(raw: string): string[] {
  return raw
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => l.length > 0);
}

/**
 * Extracts Vietnamese administrative document metadata from multi-region OCR text
 * (Left Header column + Right Header column + Full image).
 */
function parseVietnameseDocumentText(
  fullRawText: string,
  leftRawText: string,
  rightRawText: string,
  documentTypes: string[],
  workFields: string[]
): Omit<ScannedDocumentResult, 'engine' | 'fallbackNotice'> {
  const fullLines = toCleanLines(fullRawText);
  const leftLines = toCleanLines(leftRawText);
  const rightLines = toCleanLines(rightRawText);

  const fullText = fullLines.join('\n');
  const leftText = leftLines.join('\n');
  const rightText = rightLines.join('\n');

  // 1. Ngày ban hành: prioritize Right Header column (isolated from left column), then Full text
  const issued =
    extractIssuedDateFromText(rightText) ||
    extractIssuedDateFromText(fullLines.slice(0, 12).join('\n')) ||
    extractIssuedDateFromText(fullText);

  // 2. Số văn bản & Ký hiệu: prioritize Left Header column, then Full text
  let number = '';
  let symbol = '';
  let leftNumberLineIdx = -1;

  const soLinePatterns = [
    /[S5][ốôoổộơớ]\s*[:.;,]?\s*([0-9A-Za-zÀ-ỹ\-\.]+)\s*\/\s*([A-Za-zĐđ0-9\-\.\/]+)/i,
    /\b(\d{1,5})\s*\/\s*([A-ZĐ][A-ZĐ0-9]{0,5}(?:-[A-ZĐ0-9]{1,10}){1,4})\b/,
  ];

  const extractNumberSymbolFromLines = (linesToScan: string[]) => {
    for (let i = 0; i < Math.min(linesToScan.length, 15); i++) {
      const line = linesToScan[i];
      for (const pattern of soLinePatterns) {
        const m = line.match(pattern);
        if (m) {
          return {
            num: m[1].replace(/^[:.;,\s]+/, '').trim(),
            sym: m[2].replace(/[.,;:\s]+$/, '').trim().toUpperCase(),
            idx: i,
          };
        }
      }
    }
    return null;
  };

  const leftNumMatch = extractNumberSymbolFromLines(leftLines);
  if (leftNumMatch) {
    number = leftNumMatch.num;
    symbol = leftNumMatch.sym;
    leftNumberLineIdx = leftNumMatch.idx;
  } else {
    const fullNumMatch = extractNumberSymbolFromLines(fullLines);
    if (fullNumMatch) {
      number = fullNumMatch.num;
      symbol = fullNumMatch.sym;
    }
  }

  // 3. Cơ quan ký: extract cleanly from Left Header column strictly above "Số:"
  let agency = '';
  const agencyStopIdx = leftNumberLineIdx > 0 ? leftNumberLineIdx : Math.min(leftLines.length, 5);
  const leftAgencyRaw = leftLines
    .slice(0, agencyStopIdx)
    .map((l) =>
      l
        .replace(/C[ỘO]NG\s*H[ÒO]A.*$/i, '')
        .replace(/[ĐD][ỘO]C\s*L[ẬA]P.*$/i, '')
        .replace(/[_\-=*]{3,}/g, '')
        .trim()
    )
    .filter(isCleanAgencyLine);

  const keywordMatchedAgencies = leftAgencyRaw.filter((l) =>
    AGENCY_KEYWORD_PATTERNS.some((p) => p.test(l))
  );

  if (keywordMatchedAgencies.length > 0) {
    // Prefer the direct issuing unit (2nd line if parent agency + direct unit both matched, e.g., BTL CSCĐ -> Trung đoàn CSCĐ số 7)
    const chosen =
      keywordMatchedAgencies.length >= 2
        ? keywordMatchedAgencies[keywordMatchedAgencies.length - 1]
        : keywordMatchedAgencies[0];
    agency = normalizeAgencyName(chosen);
  } else if (leftAgencyRaw.length > 0) {
    // Only accept fallback agency line if it looks genuinely clean (at least 2 real words)
    const cleanWordLines = leftAgencyRaw.filter((l) => (l.match(/[A-Za-zÀ-ỹ]{2,}/g) || []).length >= 2);
    if (cleanWordLines.length > 0) {
      const chosen = cleanWordLines.length >= 2 ? cleanWordLines[cleanWordLines.length - 1] : cleanWordLines[0];
      agency = normalizeAgencyName(chosen);
    }
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

  for (let i = 0; i < Math.min(fullLines.length, 22); i++) {
    const key = searchKey(fullLines[i]);
    for (const heading of knownTypeHeadings) {
      const hKey = searchKey(heading);
      if (key === hKey || (key.startsWith(hKey + ' ') && fullLines[i].length < 85)) {
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

  // 5. Trích yếu nội dung
  let summary = '';
  const bodyStopRegex = /^(k[íi]nh\s*g[ửu]i|c[ăa]n\s*c[ứu]|th[ựư]c\s*hi[ệe]n|n[ơo]i\s*nh[ậa]n|[I1]\.\s|[ĐD]i[ềe]u\s*1\b|th[ờo]i\s*gian)/i;
  const vvMarkerRegex = /^(?:V\s*[\/\\.,|]\s*[vVyY]|V[i1l][vV]|Về\s*việc)\b/i;

  // Case A (Công văn): Check Left Header column right below "Số:" for "V/v ..." (or continuation lines before "Kính gửi:")
  const extractVvFromLines = (linesToScan: string[], startAfterIdx: number): { text: string; isCongVan: boolean } => {
    const vvIdx = linesToScan.findIndex((l, idx) => idx >= Math.max(0, startAfterIdx) && idx < 20 && vvMarkerRegex.test(l));
    if (vvIdx !== -1) {
      const parts: string[] = [];
      for (let i = vvIdx; i < Math.min(linesToScan.length, vvIdx + 5); i++) {
        const l = linesToScan[i]
          .replace(/K[íi]nh\s*g[ửu]i.*$/i, '')
          .replace(/Đắk\s*Lắk.*$/i, '')
          .replace(/Hà\s*Nội\s*,?\s*ng[aà]y.*$/i, '')
          .replace(/ng[aàá]y\s*\d{1,2}\s*th[aá]ng.*$/i, '')
          .trim();
        if (i > vvIdx && (bodyStopRegex.test(l) || /^[_\-=*]{3,}$/.test(l) || l.length < 3)) break;
        if (l) parts.push(l);
      }
      const joined = parts.join(' ').replace(/^(?:V\s*[\/\\.,|]\s*[vVyY]|V[i1l][vV])\s*[:.]?\s*/i, 'V/v ').trim();
      return { text: normalizeVietnameseTitle(joined), isCongVan: true };
    }

    // Even if OCR slightly garbled "V/v", in a Công văn the lines immediately beneath "Số:..." in the left column are the summary!
    if (startAfterIdx >= 0 && headingLineIdx === -1) {
      const parts: string[] = [];
      for (let i = startAfterIdx + 1; i < Math.min(linesToScan.length, startAfterIdx + 5); i++) {
        const l = linesToScan[i].replace(/K[íi]nh\s*g[ửu]i.*$/i, '').trim();
        if (bodyStopRegex.test(l) || /^[_\-=*]{3,}$/.test(l)) break;
        if (l.length >= 6 && (l.match(/[A-Za-zÀ-ỹ]/g) || []).length >= 5) {
          parts.push(l);
        }
      }
      if (parts.length > 0) {
        return { text: normalizeVietnameseTitle(parts.join(' ')), isCongVan: true };
      }
    }

    return { text: '', isCongVan: false };
  };

  let detectedCongVanLayout = false;

  // Prefer Left Column for Công văn "V/v..." since right column date won't pollute it
  const leftVv = extractVvFromLines(leftLines, leftNumberLineIdx);
  if (leftVv.text) {
    summary = leftVv.text;
    detectedCongVanLayout = leftVv.isCongVan;
  } else {
    const fullVv = extractVvFromLines(fullLines, 0);
    if (fullVv.text) {
      summary = fullVv.text;
      detectedCongVanLayout = fullVv.isCongVan;
    }
  }

  // Case B: Centered document title heading (KẾ HOẠCH / QUYẾT ĐỊNH / HƯỚNG DẪN / QUY ĐỊNH / CHỈ THỊ...)
  if (!summary && headingLineIdx !== -1) {
    const headingLine = fullLines[headingLineIdx];
    const hKey = searchKey(matchedHeadingName);
    const subParts: string[] = [];

    if (searchKey(headingLine).length > hKey.length + 3) {
      subParts.push(headingLine);
    } else {
      subParts.push(documentType || normalizeVietnameseTitle(matchedHeadingName));
    }

    for (let i = headingLineIdx + 1; i < Math.min(fullLines.length, headingLineIdx + 5); i++) {
      const l = fullLines[i];
      if (bodyStopRegex.test(l) || /^[_\-=*]{3,}$/.test(l) || l.length < 4) break;
      subParts.push(l);
    }

    summary = normalizeVietnameseTitle(subParts.join(' '));
  }

  // Case C: Inline "V/v ..." or "về việc ..." anywhere in top half
  if (!summary) {
    const inlineMatch = `${leftText}\n${fullText}`.match(/((?:V\s*\/\s*v|Về\s+việc)[^\n]{8,220})/i);
    if (inlineMatch) {
      summary = normalizeVietnameseTitle(inlineMatch[1]);
      if (/^V\s*\/\s*v/i.test(inlineMatch[1])) detectedCongVanLayout = true;
    }
  }

  // Công văn rule (Nghị định 30): no type prefix in symbol (like E07-CT) + V/v block or Kính gửi without centered heading -> Công văn
  if (
    !documentType &&
    (detectedCongVanLayout ||
      /(?:V\s*\/\s*v|V\.v|Viv)\b/i.test(`${leftText}\n${fullText}`) ||
      (headingLineIdx === -1 && /k[íi]nh\s*g[ửu]i/i.test(fullText)))
  ) {
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

  // 6. Lĩnh vực công tác (keyword inference)
  const matchedWorkFields: string[] = [];
  const searchPool = `${summary} ${leftText} ${fullText.slice(0, 600)}`;
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
 * Runs on-device Vietnamese OCR via lazy-loaded Tesseract.js with shadow removal & 2-column header splitting.
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

  options.onProgress?.('Đang khử bóng mờ & tách bố cục 2 cột đầu trang...');
  const regions = await preprocessRegionsForOfflineOcr(prepared.previewUrl);

  if (options.signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }

  // Dynamic import keeps tesseract.js out of the initial JS bundle
  const { createWorker } = await import('tesseract.js');

  let currentPhaseLabel = 'Đang đọc cột trái (Cơ quan, Số VB, Trích yếu)';
  const worker = await createWorker('vie', 1, {
    logger: (m: { status?: string; progress?: number }) => {
      if (options.signal?.aborted) return;
      const pct = typeof m.progress === 'number' ? Math.round(m.progress * 100) : 0;
      if (m.status === 'loading language traineddata') {
        options.onProgress?.(`Đang tải gói tiếng Việt cho OCR máy (${pct}%)...`);
      } else if (m.status === 'recognizing text') {
        options.onProgress?.(`${currentPhaseLabel} (${pct}%)...`);
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
    // Pass 1: Left Header column (Agency, Số/Ký hiệu, V/v trích yếu) — isolated from right column
    currentPhaseLabel = 'OCR máy [1/3]: Đọc Cơ quan, Số VB & Trích yếu';
    const leftRes = await worker.recognize(regions.leftHeaderUrl);
    if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    // Pass 2: Right Header column (Quốc hiệu & Ngày ban hành)
    currentPhaseLabel = 'OCR máy [2/3]: Đọc Ngày ban hành';
    const rightRes = await worker.recognize(regions.rightHeaderUrl);
    if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    // Pass 3: Full image (for centered titles like KẾ HOẠCH/QUYẾT ĐỊNH & Kính gửi)
    currentPhaseLabel = 'OCR máy [3/3]: Tổng hợp toàn trang';
    const fullRes = await worker.recognize(regions.fullUrl);
    if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    const parsed = parseVietnameseDocumentText(
      fullRes.data.text || '',
      leftRes.data.text || '',
      rightRes.data.text || '',
      documentTypes,
      workFields
    );

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
 *    on static PWA (GitHub Pages) / APK without a backend URL, or when AI backend is unavailable/overloaded (404/405/502/503/504).
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

    const rawErrMsg = String(payload?.error || '');
    const isTransientUnavailable =
      [404, 405, 502, 503, 504].includes(response.status) ||
      /\b503\b|UNAVAILABLE|high demand/i.test(rawErrMsg);

    // Static host / missing backend route / temporary AI 503 high-demand -> seamless fallback to Tesseract.js
    if (isTransientUnavailable) {
      const reason =
        response.status === 503 || /\b503\b|UNAVAILABLE|high demand/i.test(rawErrMsg)
          ? 'Máy chủ AI đang quá tải tạm thời (503) — đã tự động chuyển sang OCR trên máy.'
          : `Máy chủ AI không khả dụng (mã ${response.status}) — đã tự động chuyển sang OCR trên máy.`;
      return scanWithOfflineTesseract(prepared, documentTypes, workFields, options, reason);
    }

    // Genuine AI API error (e.g., 403 invalid key, 429 quota exceeded, 400/500) -> surface clearly
    throw new Error(
      rawErrMsg || `Lỗi máy chủ AI (${response.status}). Vui lòng thử lại hoặc chọn chế độ OCR trên máy.`
    );
  } catch (err: any) {
    if (err?.name === 'AbortError' || options.signal?.aborted) {
      throw err;
    }

    // Network/CORS failure when reaching AI backend -> automatic fallback to on-device OCR
    if (
      err instanceof TypeError ||
      /failed to fetch|networkerror|load failed/i.test(String(err?.message || ''))
    ) {
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
