import { searchKey } from './dateUtils';
import { OAUTH_REDIRECT_ORIGIN } from '../services/googleDriveService';

export type ScanEngine = 'ai' | 'offline';
export type ScanMode = 'auto' | 'offline';

export interface SymbolAgencyHint {
  symbol: string;
  agency: string;
}

export interface ScannedDocumentResult {
  issued: string;
  number: string;
  symbol: string;
  agency: string;
  agencySuggestions: string[];
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
  knownAgencies?: string[];
  symbolAgencyHints?: SymbolAgencyHint[];
}

const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.86;

const DEFAULT_VERCEL_SCAN_ORIGIN = 'https://qlvb-pro-ai-studio.vercel.app';

/**
 * Resolves the AI scan endpoint URL:
 * 1) Uses VITE_SCAN_API_URL if configured.
 * 2) On static hosts (GitHub Pages PWA / Capacitor or WebView APK), defaults to the Vercel Serverless AI endpoint
 *    (https://qlvb-pro-ai-studio.vercel.app/api/scan-document) so AI Online works automatically without Cloud Run billing.
 * 3) On full-stack hosts (.vercel.app / .run.app / localhost), uses relative /api/scan-document.
 */
export function resolveAiScanEndpoint(): { url: string; isCrossOrigin: boolean } {
  const configured = String(import.meta.env.VITE_SCAN_API_URL || '').trim().replace(/\/+$/, '');
  if (configured) {
    const url = configured.endsWith('/api/scan-document')
      ? configured
      : `${configured}/api/scan-document`;
    const isCrossOrigin =
      typeof window !== 'undefined' ? !url.startsWith(window.location.origin) && url.startsWith('http') : false;
    return { url, isCrossOrigin };
  }

  if (typeof window !== 'undefined') {
    const { hostname, protocol } = window.location;
    const win = window as any;
    const isNativeBridgeApp =
      typeof win.AndroidBridge !== 'undefined' ||
      typeof win.Capacitor !== 'undefined';
    const isStaticOnlyHost =
      isNativeBridgeApp ||
      hostname.endsWith('github.io') ||
      hostname.endsWith('firebaseapp.com') ||
      hostname.endsWith('web.app') ||
      protocol === 'capacitor:' ||
      protocol === 'file:' ||
      (hostname === 'localhost' && !window.location.port);
    if (isStaticOnlyHost) {
      const base = (DEFAULT_VERCEL_SCAN_ORIGIN || OAUTH_REDIRECT_ORIGIN).replace(/\/+$/, '');
      return { url: `${base}/api/scan-document`, isCrossOrigin: true };
    }
  }

  return { url: '/api/scan-document', isCrossOrigin: false };
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
 * Strictly isolates the top header band (excluding body citations like "Căn cứ ... ngày 15/9/2025" and camera watermarks)
 * into clean Left (Agency, Số, V/v) and Right (Quốc hiệu, Địa danh ngày tháng năm) crops.
 */
async function preprocessRegionsForOfflineOcr(previewUrl: string): Promise<PreprocessedRegions> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
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
            val = Math.min(255, (gray / bgGray) * 246);
          }
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

        // Determine header crop height based on aspect ratio:
        // - Ultra-wide cropped header strip (aspect > 2.2): keep full height
        // - Landscape document photo (aspect 1.1..2.2, e.g. 16:9): top 56% covers Agency/Số/V/v/Date and cuts out "Căn cứ..." body & bottom timestamp!
        // - Portrait full A4 page (aspect < 1.1): top 46% covers the full header block
        const aspect = width / Math.max(1, height);
        const headerHeightRatio = aspect > 2.2 ? 1.0 : aspect >= 1.1 ? 0.56 : 0.46;
        const headerHeight = Math.round(height * headerHeightRatio);

        const cropRegion = (xRatio: number, wRatio: number, hPx: number): string => {
          const sx = Math.round(width * xRatio);
          const sw = Math.round(width * wRatio);
          const pad = 24;
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

        // Left header column (0% -> 55%): Agency, Số/Ký hiệu, V/v trích yếu
        const leftHeaderUrl = cropRegion(0, 0.55, headerHeight);
        // Right header column (45% -> 99%): Quốc hiệu, Địa danh ngày tháng năm (strictly top header band!)
        const rightHeaderUrl = cropRegion(0.45, 0.54, headerHeight);

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
      if (bare === 'CSCD') return word.replace(/CSCD/i, 'CSCĐ');
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

  // Fix common Vietnamese administrative capitalization & OCR typos (e.g., CSCD -> CSCĐ, Trung Đoàn -> Trung đoàn)
  const lowerKeepWords = new Set([
    'của', 'và', 'về', 'tại', 'số', 'tỉnh', 'thành', 'phố', 'huyện', 'quận', 'xã', 'phường',
    'khu', 'vực', 'đoàn', 'lệnh', 'sát', 'cơ', 'động', 'nhân', 'dân', 'ban', 'an',
  ]);

  const words = cleaned.split(' ');
  const normalized = words
    .map((word, idx) => {
      const bare = word.replace(/[^A-Za-zÀ-ỹ0-9]/g, '').toUpperCase();
      if (bare === 'CSCD') return 'CSCĐ';
      if (PRESERVED_ACRONYMS.has(bare) || /^[A-Z]{1,3}\d{2}$/.test(bare)) {
        return word.toUpperCase();
      }
      const lower = word.toLocaleLowerCase('vi-VN');
      if (idx === 0) {
        return lower.charAt(0).toLocaleUpperCase('vi-VN') + lower.slice(1);
      }
      if (lowerKeepWords.has(lower)) return lower;
      return lower.charAt(0).toLocaleUpperCase('vi-VN') + lower.slice(1);
    })
    .join(' ');

  return normalized
    .replace(/\bBộ Tư lệnh\b/gi, 'Bộ Tư lệnh')
    .replace(/\bBộ Công an\b/gi, 'Bộ Công an')
    .replace(/\bCảnh sát cơ động\b/gi, 'Cảnh sát cơ động')
    .replace(/\bTrung đoàn\b/gi, 'Trung đoàn')
    .replace(/\bTiểu đoàn\b/gi, 'Tiểu đoàn')
    .replace(/\bỦy ban nhân dân\b/gi, 'Ủy ban nhân dân')
    .replace(/\bCSCD\b/g, 'CSCĐ');
}

function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const dp = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) dp[j] = j;

  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const temp = dp[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + cost);
      prev = temp;
    }
  }
  return dp[b.length];
}

function computeAgencySimilarity(raw: string, candidate: string): number {
  const k1 = searchKey(raw).replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const k2 = searchKey(candidate).replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!k1 || !k2) return 0;
  if (k1 === k2) return 1.0;

  // Substring containment boost (e.g., "trung doan cscd so 7" inside candidate)
  const containsScore = k1.includes(k2) || k2.includes(k1)
    ? Math.min(k1.length, k2.length) / Math.max(k1.length, k2.length)
    : 0;

  // Token overlap (Dice coefficient with fuzzy token match for 1-char OCR typos)
  const t1 = k1.split(' ').filter(Boolean);
  const t2 = k2.split(' ').filter(Boolean);
  let matchedTokens = 0;
  for (const w1 of t1) {
    const hasMatch = t2.some((w2) => {
      if (w1 === w2) return true;
      if (w1.length >= 3 && w2.length >= 3 && levenshteinDistance(w1, w2) <= 1) return true;
      return false;
    });
    if (hasMatch) matchedTokens++;
  }
  const diceScore = (2 * matchedTokens) / Math.max(1, t1.length + t2.length);

  // Character-level normalized Levenshtein similarity
  const maxLen = Math.max(k1.length, k2.length);
  const charScore = 1 - levenshteinDistance(k1, k2) / maxLen;

  return Math.max(containsScore * 0.95, diceScore * 0.65 + charScore * 0.35);
}

function extractUnitTokensFromSymbol(symbol: string): string[] {
  if (!symbol) return [];
  const docTypePrefixes = new Set(['KH', 'QD', 'QDI', 'HD', 'CT', 'CV', 'TT', 'TTLT', 'NQ', 'ND', 'PL', 'BC', 'TB', 'GM', 'TTR']);
  return searchKey(symbol)
    .toUpperCase()
    .split(/[-\/\s]+/)
    .map((p) => p.trim())
    .filter((p) => p.length >= 2 && !docTypePrefixes.has(p));
}

/**
 * Matches an extracted agency string against the user's known agency catalog to eliminate OCR spelling mistakes,
 * and produces a ranked list of quick-pick suggestions.
 */
function resolveAgencyWithCatalog(
  rawAgency: string,
  symbol: string,
  knownAgencies: string[] = [],
  symbolAgencyHints: SymbolAgencyHint[] = []
): { agency: string; suggestions: string[] } {
  const cleanedRaw = normalizeAgencyName(rawAgency);
  const uniqueCatalog = Array.from(
    new Set(knownAgencies.map((a) => a.trim()).filter(Boolean))
  );

  // Build frequency bonus map from previous documents sharing the same unit code in symbol (e.g., E07 -> Trung đoàn CSCĐ số 7)
  const symbolUnitTokens = extractUnitTokensFromSymbol(symbol);
  const symbolHintBoost = new Map<string, number>();
  if (symbolUnitTokens.length > 0 && symbolAgencyHints.length > 0) {
    for (const pair of symbolAgencyHints) {
      const pairTokens = extractUnitTokensFromSymbol(pair.symbol);
      const primaryUnit = symbolUnitTokens[0];
      if (pairTokens.includes(primaryUnit) && pair.agency.trim()) {
        const key = pair.agency.trim();
        symbolHintBoost.set(key, Math.min(0.32, (symbolHintBoost.get(key) || 0) + 0.18));
      }
    }
  }

  if (uniqueCatalog.length === 0) {
    return { agency: cleanedRaw, suggestions: [] };
  }

  const scored = uniqueCatalog
    .map((candidate) => {
      const textSim = cleanedRaw ? computeAgencySimilarity(cleanedRaw, candidate) : 0;
      const hintBonus = symbolHintBoost.get(candidate) || 0;
      const totalScore = Math.min(1, textSim + (textSim >= 0.35 || !cleanedRaw ? hintBonus : hintBonus * 0.5));
      return { candidate, textSim, hintBonus, totalScore };
    })
    .sort((a, b) => b.totalScore - a.totalScore || b.textSim - a.textSim);

  const best = scored[0];
  let chosenAgency = cleanedRaw;

  // Snap to exact known catalog entry when similarity is strong (eliminates OCR typos like "Trung Đoàn CSCD số 7" -> "Trung đoàn CSCĐ số 7")
  if (best && (best.textSim >= 0.72 || best.totalScore >= 0.78)) {
    chosenAgency = best.candidate;
  } else if (!chosenAgency && best && best.hintBonus >= 0.18) {
    // If OCR completely missed the agency text but symbol unit code strongly matches an existing unit, use it!
    chosenAgency = best.candidate;
  }

  // Build up to 4 clean suggestions for 1-tap verification/switching
  const suggestions: string[] = [];
  const pushUnique = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (!suggestions.some((s) => searchKey(s) === searchKey(trimmed))) {
      suggestions.push(trimmed);
    }
  };

  for (const item of scored) {
    if (suggestions.length >= 4) break;
    if (item.totalScore >= 0.38 || item.hintBonus >= 0.18) {
      pushUnique(item.candidate);
    }
  }

  // If raw OCR text was genuinely different from catalog entries, include it as an option too
  if (cleanedRaw && suggestions.length < 4) {
    pushUnique(cleanedRaw);
  }

  return {
    agency: chosenAgency,
    suggestions,
  };
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

const BODY_START_REGEX =
  /^(?:k[íi]nh\s*g[ửu]i|c[ăa]n\s*c[ứu]|th[ựư]c\s*hi[ệe]n|theo\s*đ[ềe]\s*ngh[ịi]|đ[ểe]\s*đ[ảa]m\s*b[ảa]o|x[ée]t\s*đ[ềe]\s*ngh[ịi]|n[ơo]i\s*nh[ậa]n|[I1]\.\s|[ĐD]i[ềe]u\s*1\b)/i;

const CITATION_OR_TIMESTAMP_LINE_REGEX =
  /(?:c[ăa]n\s*c[ứu]|th[ôo]ng\s*t[ưư]\s*s[ốô]|ngh[ịi]\s*đ[ịi]nh\s*s[ốô]|quy[ếe]t\s*đ[ịi]nh\s*s[ốô]|k[ếe]\s*ho[ạa]ch\s*s[ốô]|c[ôo]ng\s*v[ăa]n\s*s[ốô]|tr[ưư][ớo]c\s*ng[aà]y|t[ừu]\s*ng[aà]y|đ[ếe]n\s*ng[aà]y|\b\d{1,2}:\d{2}\b)/i;

/**
 * Fixes common italic OCR digit mistakes inside date fragments (e.g. "ngàyl7", "tháng ll", "tháng 1l").
 */
function normalizeItalicOcrDateLine(line: string): string {
  return line
    .replace(/([a-zà-ỹ])([lI|])(\d)/gi, '$1 1$3')
    .replace(/(\d)([lI|])(\s|$)/g, '$11$3')
    .replace(/([lI|])(\d)/g, '1$2')
    .replace(/\b[lI|]{2}\b/g, '11')
    .replace(/(th[aàáảãạăằắẳẵặâầấẩẫậoô]{1,3}n?g?)\s*([lI|])(?=\s|$)/gi, '$1 1')
    .replace(/(ng[aàáảãạăằắẳẵặâầấẩẫậeêoôơuưyý]{1,4}y?)(\d)/gi, '$1 $2');
}

/**
 * Strictly extracts the document's issuing date from the HEADER section only.
 * Never picks citation dates from "Căn cứ Thông tư số ... ngày 15/9/2025" or camera timestamps ("26/11/2026 20:15").
 */
function extractIssuedDateFromHeader(lines: string[]): string {
  const headerLines: string[] = [];
  for (const rawLine of lines) {
    if (BODY_START_REGEX.test(rawLine)) break;
    if (CITATION_OR_TIMESTAMP_LINE_REGEX.test(rawLine)) continue;
    headerLines.push(normalizeItalicOcrDateLine(rawLine));
  }

  const headerText = headerLines.join('\n');
  if (!headerText) return '';

  // Priority 1: Full Vietnamese header date format ("Đắk Lắk, ngày 17 tháng 11 năm 2026" / "ngày17 tháng 11 năm 2026")
  const vnHeaderPatterns = [
    /ng[aàáảãạăằắẳẵặâầấẩẫậeêoôơuưyýìí]{0,4}y?\s*[:.,]?\s*(\d{1,2})\s*[,.;]?\s*th[aàáảãạăằắẳẵặâầấẩẫậoôơuư]{1,4}n?g?\s*(\d{1,2})\s*[,.;]?\s*n[aăâàáảãạằắẳẵặầấẩẫậoô]{1,4}m?\s*((?:19|20)\d{2})/i,
    /\b(\d{1,2})\s*th[aàáảãạăằắẳẵặâầấẩẫậoô]{1,3}n?g?\s*(\d{1,2})\s*n[aăâàáảãạằắẳẵặầấẩẫậoô]{1,3}m?\s*((?:19|20)\d{2})\b/i,
    /,\s*[a-zà-ỹ]{2,7}\s*(\d{1,2})\s+[a-zà-ỹ]{3,8}\s+(\d{1,2})\s+[a-zà-ỹ]{2,6}\s+((?:19|20)\d{2})/i,
  ];

  for (const pattern of vnHeaderPatterns) {
    const m = headerText.match(pattern);
    if (m) {
      const dd = Number(m[1]);
      const mm = Number(m[2]);
      const yyyy = Number(m[3]);
      if (dd >= 1 && dd <= 31 && mm >= 1 && mm <= 12 && yyyy >= 1990 && yyyy <= 2099) {
        return `${String(dd).padStart(2, '0')}/${String(mm).padStart(2, '0')}/${yyyy}`;
      }
    }
  }

  // Priority 2: Slash/dash date ONLY if it appears on a clean header line (not inside a document code like 86/2025/TT-BCA)
  for (const line of headerLines) {
    if (/\/\s*[A-ZĐ]{2,}/i.test(line)) continue;
    const m = line.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-]((?:19|20)\d{2})\b/);
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
 * (Left Header column + Right Header column + Full image) and snaps Agency against known catalog.
 */
function parseVietnameseDocumentText(
  fullRawText: string,
  leftRawText: string,
  rightRawText: string,
  documentTypes: string[],
  workFields: string[],
  knownAgencies: string[] = [],
  symbolAgencyHints: SymbolAgencyHint[] = []
): Omit<ScannedDocumentResult, 'engine' | 'fallbackNotice'> {
  const fullLines = toCleanLines(fullRawText);
  const leftLines = toCleanLines(leftRawText);
  const rightLines = toCleanLines(rightRawText);

  const fullText = fullLines.join('\n');
  const leftText = leftLines.join('\n');

  // 1. Ngày ban hành: STRICTLY from header zone only (Right Header crop first, then top header lines of Full text)
  const issued =
    extractIssuedDateFromHeader(rightLines) ||
    extractIssuedDateFromHeader(fullLines.slice(0, 12));

  // 2. Số văn bản & Ký hiệu: prioritize Left Header column, then top header lines of Full text
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
      if (BODY_START_REGEX.test(line)) break;
      if (CITATION_OR_TIMESTAMP_LINE_REGEX.test(line)) continue;
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

  // 3. Cơ quan ký: extract cleanly from Left Header column strictly above "Số:", then match against knownAgencies catalog!
  let rawAgency = '';
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
    const chosen =
      keywordMatchedAgencies.length >= 2
        ? keywordMatchedAgencies[keywordMatchedAgencies.length - 1]
        : keywordMatchedAgencies[0];
    rawAgency = normalizeAgencyName(chosen);
  } else if (leftAgencyRaw.length > 0) {
    const cleanWordLines = leftAgencyRaw.filter((l) => (l.match(/[A-Za-zÀ-ỹ]{2,}/g) || []).length >= 2);
    if (cleanWordLines.length > 0) {
      const chosen = cleanWordLines.length >= 2 ? cleanWordLines[cleanWordLines.length - 1] : cleanWordLines[0];
      rawAgency = normalizeAgencyName(chosen);
    }
  }

  const resolvedAgency = resolveAgencyWithCatalog(
    rawAgency,
    symbol,
    knownAgencies,
    symbolAgencyHints
  );

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
    if (BODY_START_REGEX.test(fullLines[i])) break;
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
  const vvMarkerRegex = /^(?:V\s*[\/\\.,|]\s*[vVyY]|V[i1l][vV]|Về\s*việc)\b/i;

  const extractVvFromLines = (linesToScan: string[], startAfterIdx: number): { text: string; isCongVan: boolean } => {
    const vvIdx = linesToScan.findIndex(
      (l, idx) => idx >= Math.max(0, startAfterIdx) && idx < 20 && vvMarkerRegex.test(l)
    );
    if (vvIdx !== -1) {
      const parts: string[] = [];
      for (let i = vvIdx; i < Math.min(linesToScan.length, vvIdx + 5); i++) {
        const l = linesToScan[i]
          .replace(/K[íi]nh\s*g[ửu]i.*$/i, '')
          .replace(/Đắk\s*Lắk.*$/i, '')
          .replace(/Hà\s*Nội\s*,?\s*ng[aà]y.*$/i, '')
          .replace(/ng[aàá]y\s*\d{1,2}\s*th[aá]ng.*$/i, '')
          .trim();
        if (i > vvIdx && (BODY_START_REGEX.test(l) || /^[_\-=*]{3,}$/.test(l) || l.length < 3)) break;
        if (l) parts.push(l);
      }
      const joined = parts
        .join(' ')
        .replace(/^(?:V\s*[\/\\.,|]\s*[vVyY]|V[i1l][vV])\s*[:.]?\s*/i, 'V/v ')
        .trim();
      return { text: normalizeVietnameseTitle(joined), isCongVan: true };
    }

    if (startAfterIdx >= 0 && headingLineIdx === -1) {
      const parts: string[] = [];
      for (let i = startAfterIdx + 1; i < Math.min(linesToScan.length, startAfterIdx + 5); i++) {
        const l = linesToScan[i].replace(/K[íi]nh\s*g[ửu]i.*$/i, '').trim();
        if (BODY_START_REGEX.test(l) || /^[_\-=*]{3,}$/.test(l)) break;
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
      if (BODY_START_REGEX.test(l) || /^[_\-=*]{3,}$/.test(l) || l.length < 4) break;
      subParts.push(l);
    }

    summary = normalizeVietnameseTitle(subParts.join(' '));
  }

  if (!summary) {
    const inlineMatch = `${leftText}\n${fullText}`.match(/((?:V\s*\/\s*v|Về\s+việc)[^\n]{8,220})/i);
    if (inlineMatch) {
      summary = normalizeVietnameseTitle(inlineMatch[1]);
      if (/^V\s*\/\s*v/i.test(inlineMatch[1])) detectedCongVanLayout = true;
    }
  }

  if (
    !documentType &&
    (detectedCongVanLayout ||
      /(?:V\s*\/\s*v|V\.v|Viv)\b/i.test(`${leftText}\n${fullText}`) ||
      (headingLineIdx === -1 && /k[íi]nh\s*g[ửu]i/i.test(fullText)))
  ) {
    documentType = 'Công văn';
  }

  if (documentType && documentTypes.length > 0) {
    const target = searchKey(documentType);
    const exact =
      documentTypes.find((t) => searchKey(t) === target) ||
      documentTypes.find((t) => searchKey(t).includes(target) || target.includes(searchKey(t)));
    if (exact) documentType = exact;
  }

  // 6. Lĩnh vực công tác
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
    agency: resolvedAgency.agency,
    agencySuggestions: resolvedAgency.suggestions,
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

  const { createWorker } = await import('tesseract.js');

  let currentPhaseLabel = 'OCR máy [1/3]: Đọc Cơ quan, Số VB & Trích yếu';
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
    currentPhaseLabel = 'OCR máy [1/3]: Đọc Cơ quan, Số VB & Trích yếu';
    const leftRes = await worker.recognize(regions.leftHeaderUrl);
    if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    currentPhaseLabel = 'OCR máy [2/3]: Đọc Ngày ban hành (góc phải đầu trang)';
    const rightRes = await worker.recognize(regions.rightHeaderUrl);
    if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    currentPhaseLabel = 'OCR máy [3/3]: Tổng hợp toàn trang';
    const fullRes = await worker.recognize(regions.fullUrl);
    if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    const parsed = parseVietnameseDocumentText(
      fullRes.data.text || '',
      leftRes.data.text || '',
      rightRes.data.text || '',
      documentTypes,
      workFields,
      options.knownAgencies,
      options.symbolAgencyHints
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
  const { url: endpointUrl, isCrossOrigin } = resolveAiScanEndpoint();
  const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;

  if (mode === 'offline') {
    return scanWithOfflineTesseract(
      prepared,
      documentTypes,
      workFields,
      options,
      'Chế độ OCR trực tiếp trên máy (không gửi ảnh lên mạng).'
    );
  }

  if (isOffline) {
    return scanWithOfflineTesseract(
      prepared,
      documentTypes,
      workFields,
      options,
      'Thiết bị đang ngoại tuyến — đã tự động chuyển sang OCR trên máy.'
    );
  }

  options.onProgress?.('AI trực tuyến đang phân tích số văn bản, ngày ban hành, trích yếu...');

  const requestBody = JSON.stringify({
    imageBase64: prepared.base64,
    mimeType: prepared.mimeType,
    documentTypes,
    workFields,
    knownAgencies: options.knownAgencies || [],
  });

  const postToAiEndpoint = async (url: string, crossOrigin: boolean) => {
    const response = await fetch(url, {
      method: 'POST',
      mode: crossOrigin ? 'cors' : 'same-origin',
      headers: {
        // Use text/plain for cross-origin calls to avoid CORS OPTIONS preflight blocking
        'Content-Type': crossOrigin ? 'text/plain;charset=UTF-8' : 'application/json',
      },
      body: requestBody,
      signal: options.signal,
    });
    const contentType = response.headers.get('content-type') || '';
    const isJsonResponse = contentType.includes('application/json');
    const payload = isJsonResponse ? await response.json().catch(() => null) : null;
    return { response, isJsonResponse, payload, crossOrigin };
  };

  try {
    let attempt = await postToAiEndpoint(endpointUrl, isCrossOrigin);

    // Safety net: if a relative same-origin host returned non-JSON (e.g. SPA HTML 200 on a static/WebView host),
    // automatically retry once against the Vercel serverless AI endpoint before falling back to offline OCR.
    if (!attempt.isJsonResponse && !attempt.crossOrigin) {
      const vercelFallbackUrl = `${DEFAULT_VERCEL_SCAN_ORIGIN.replace(/\/+$/, '')}/api/scan-document`;
      attempt = await postToAiEndpoint(vercelFallbackUrl, true);
    }

    const { response, isJsonResponse, payload, crossOrigin } = attempt;

    if (response.ok && payload?.ok && payload.data) {
      const aiData = payload.data as Omit<ScannedDocumentResult, 'engine' | 'agencySuggestions'>;
      const resolvedAgency = resolveAgencyWithCatalog(
        aiData.agency || '',
        aiData.symbol || '',
        options.knownAgencies,
        options.symbolAgencyHints
      );
      return {
        ...aiData,
        agency: resolvedAgency.agency,
        agencySuggestions: resolvedAgency.suggestions,
        engine: 'ai',
      };
    }

    const rawErrMsg = String(payload?.error || '');
    const isAuthGateOrNonJsonCrossOrigin = crossOrigin && (!isJsonResponse || response.status === 401);
    const isTransientUnavailable =
      isAuthGateOrNonJsonCrossOrigin ||
      !isJsonResponse ||
      [404, 405, 502, 503, 504].includes(response.status) ||
      /\b503\b|UNAVAILABLE|high demand/i.test(rawErrMsg);

    if (isTransientUnavailable) {
      let reason: string;
      if (isAuthGateOrNonJsonCrossOrigin) {
        reason =
          'Máy chủ AI trực tuyến đang yêu cầu đăng nhập/chưa bật công khai — đã tự động chuyển sang OCR trên máy.';
      } else if (response.status === 503 || /\b503\b|UNAVAILABLE|high demand/i.test(rawErrMsg)) {
        reason = 'Máy chủ AI đang quá tải tạm thời (503) — đã tự động chuyển sang OCR trên máy.';
      } else {
        reason = `Máy chủ AI không khả dụng (mã ${response.status}) — đã tự động chuyển sang OCR trên máy.`;
      }
      return scanWithOfflineTesseract(prepared, documentTypes, workFields, options, reason);
    }

    throw new Error(
      rawErrMsg || `Lỗi máy chủ AI (${response.status}). Vui lòng thử lại hoặc chọn chế độ OCR trên máy.`
    );
  } catch (err: any) {
    if (err?.name === 'AbortError' || options.signal?.aborted) {
      throw err;
    }

    if (
      err instanceof TypeError ||
      /failed to fetch|networkerror|load failed/i.test(String(err?.message || ''))
    ) {
      return scanWithOfflineTesseract(
        prepared,
        documentTypes,
        workFields,
        options,
        'Không kết nối được máy chủ AI trực tuyến từ PWA — đã tự động chuyển sang OCR trên máy.'
      );
    }

    throw err;
  }
}
