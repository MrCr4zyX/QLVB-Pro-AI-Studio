import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

interface ServerlessRequest {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
  on?: (event: string, listener: (chunk: Uint8Array | string) => void) => void;
}

interface ServerlessResponse {
  statusCode: number;
  setHeader: (name: string, value: string) => void;
  end: (chunk?: string) => void;
}

const ALLOWED_SCAN_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

function sendJson(res: ServerlessResponse, statusCode: number, payload: unknown): void {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

async function readRequestBody(req: ServerlessRequest): Promise<Record<string, any>> {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    return req.body as Record<string, any>;
  }
  if (typeof req.body === 'string' && req.body.trim()) {
    return JSON.parse(req.body);
  }
  if (Buffer.isBuffer(req.body) && req.body.length > 0) {
    return JSON.parse(req.body.toString('utf8'));
  }

  // Fallback raw stream read if body parser did not populate req.body
  if (typeof req.on === 'function') {
    const raw = await new Promise<string>((resolve, reject) => {
      const chunks: string[] = [];
      let totalBytes = 0;
      req.on?.('data', (chunk) => {
        const str = typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8');
        totalBytes += str.length;
        if (totalBytes > 20 * 1024 * 1024) {
          reject(new Error('PAYLOAD_TOO_LARGE'));
          return;
        }
        chunks.push(str);
      });
      req.on?.('end', () => resolve(chunks.join('')));
      req.on?.('error', (err) => reject(err));
    });
    if (raw.trim()) {
      return JSON.parse(raw);
    }
  }
  return {};
}

function extractErrorStatus(err: any): number | undefined {
  if (typeof err?.status === 'number') return err.status;
  if (typeof err?.code === 'number') return err.code;
  const msg = String(err?.message || '');
  try {
    const parsed = JSON.parse(msg);
    if (typeof parsed?.error?.code === 'number') return parsed.error.code;
  } catch {
    // Ignore JSON parse failure
  }
  if (/\b503\b|UNAVAILABLE|high demand/i.test(msg)) return 503;
  if (/\b429\b|RESOURCE_EXHAUSTED/i.test(msg)) return 429;
  if (/\b403\b|PERMISSION_DENIED/i.test(msg)) return 403;
  if (/\b400\b|API_KEY_INVALID/i.test(msg)) return 400;
  return undefined;
}

export default async function handler(req: ServerlessRequest, res: ServerlessResponse): Promise<void> {
  const originHeader = req.headers.origin;
  const origin = Array.isArray(originHeader) ? originHeader[0] : originHeader;

  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    sendJson(res, 405, { ok: false, error: 'Chỉ hỗ trợ phương thức POST.' });
    return;
  }

  try {
    let bodyObj: Record<string, any>;
    try {
      bodyObj = await readRequestBody(req);
    } catch (parseErr: any) {
      if (parseErr?.message === 'PAYLOAD_TOO_LARGE') {
        sendJson(res, 413, { ok: false, error: 'Ảnh quá lớn. Vui lòng chọn ảnh nhỏ hơn.' });
        return;
      }
      sendJson(res, 400, { ok: false, error: 'Dữ liệu JSON gửi lên không hợp lệ.' });
      return;
    }

    const { imageBase64, mimeType, documentTypes, workFields, knownAgencies } = bodyObj;

    if (typeof imageBase64 !== 'string' || !imageBase64.trim()) {
      sendJson(res, 400, { ok: false, error: 'Thiếu dữ liệu hình ảnh để quét.' });
      return;
    }

    const cleanBase64 = imageBase64.replace(/^data:[^;]+;base64,/, '').trim();
    if (cleanBase64.length > 15 * 1024 * 1024) {
      sendJson(res, 413, { ok: false, error: 'Ảnh quá lớn. Vui lòng chọn ảnh nhỏ hơn.' });
      return;
    }

    const normalizedMime =
      typeof mimeType === 'string' && ALLOWED_SCAN_MIME_TYPES.has(mimeType.toLowerCase())
        ? mimeType.toLowerCase() === 'image/jpg'
          ? 'image/jpeg'
          : mimeType.toLowerCase()
        : 'image/jpeg';

    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) {
      sendJson(res, 500, {
        ok: false,
        error: 'Chưa cấu hình biến môi trường GEMINI_API_KEY trên máy chủ Vercel.',
      });
      return;
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const validTypes = Array.isArray(documentTypes)
      ? documentTypes.map((t) => String(t).trim()).filter(Boolean)
      : [
          'Luật',
          'Pháp lệnh',
          'Nghị quyết',
          'Nghị định',
          'Quyết định',
          'Thông tư',
          'Thông tư liên tịch',
          'Chỉ thị',
          'Công văn',
          'Kế hoạch',
          'Hướng dẫn',
          'Quy định',
          'Khác',
        ];

    const validFields = Array.isArray(workFields)
      ? workFields.map((f) => String(f).trim()).filter(Boolean)
      : [];

    const validAgencies = Array.isArray(knownAgencies)
      ? knownAgencies.map((a) => String(a).trim()).filter(Boolean).slice(0, 80)
      : [];

    const prompt = [
      'Bạn là chuyên gia số hóa văn bản hành chính Việt Nam (đặc biệt là văn bản khối Công an nhân dân, cơ quan nhà nước theo Nghị định 30/2020/NĐ-CP).',
      'Hãy đọc thật chính xác hình ảnh trang văn bản đính kèm (bố cục 2 cột đầu trang: trái là cơ quan ban hành, số/ký hiệu và trích yếu V/v; phải là Quốc hiệu và địa danh, ngày tháng năm) và trích xuất sang JSON:',
      '1. issued: CHỈ lấy ngày ban hành của CHÍNH VĂN BẢN NÀY nằm ở góc trên bên phải ngay dưới dòng "Độc lập - Tự do - Hạnh phúc" (ví dụ "Đắk Lắk, ngày17 tháng 11 năm 2026" -> "17/11/2026", kể cả khi viết dính "ngày17"). TUYỆT ĐỐI KHÔNG lấy ngày trích dẫn trong đoạn "Căn cứ Thông tư/Nghị định... ngày ..." ở thân văn bản, KHÔNG lấy ngày hạn báo cáo ("trước ngày...") và KHÔNG lấy dấu giờ chụp ảnh ở góc ảnh. Nếu không thấy rõ ngày ở góc trên bên phải để chuỗi rỗng "".',
      '2. number: Phần SỐ văn bản đứng trước dấu gạch chéo "/" trong dòng "Số: ...". Ví dụ "Số:2797 /E07-CT" -> "2797"; "Số: 08/HD-CAT-PX01" -> "08". Không gồm chữ "Số:" và không có khoảng trắng thừa.',
      '3. symbol: Phần KÝ HIỆU văn bản đứng sau dấu gạch chéo "/". Ví dụ "Số:2797 /E07-CT" -> "E07-CT"; "Số: 1910/KH-E07-CT" -> "KH-E07-CT".',
      validAgencies.length > 0
        ? `4. agency: Cơ quan ban hành văn bản ở góc trên bên trái (nếu có 2 dòng thì ưu tiên dòng dưới in đậm trực tiếp ban hành). Ưu tiên khớp CHÍNH XÁC tên trong danh sách cơ quan có sẵn sau nếu cùng đơn vị: [${validAgencies.join(', ')}]. Nếu là cơ quan mới chưa có trong danh sách thì viết chuẩn tiếng Việt tự nhiên (ví dụ "Trung đoàn CSCĐ số 7", "Bộ Công an").`
        : '4. agency: Cơ quan ban hành văn bản ở góc trên bên trái. Nếu có 2 dòng (dòng trên là cơ quan chủ quản như "BỘ TƯ LỆNH CẢNH SÁT CƠ ĐỘNG", dòng dưới in đậm có gạch chân là cơ quan trực tiếp ban hành như "TRUNG ĐOÀN CSCĐ SỐ 7"), ưu tiên lấy cơ quan trực tiếp ban hành (dòng dưới). Viết chuẩn chữ hoa chữ thường tiếng Việt tự nhiên (ví dụ "Trung đoàn CSCĐ số 7", "Bộ Công an"), giữ nguyên viết tắt như CSCĐ, K02, BCA, UBND.',
      `5. documentType: Chọn ĐÚNG 1 tên loại văn bản khớp nhất trong danh sách sau: [${validTypes.join(', ')}]. LƯU Ý QUAN TRỌNG: Công văn theo Nghị định 30 KHÔNG có tiêu đề tên loại ở giữa và ký hiệu thường KHÔNG có chữ "CV-" (ví dụ "Số: 2797/E07-CT" kèm dòng "V/v ..." ngay bên dưới và "Kính gửi:") -> loại văn bản là "Công văn". Các loại khác suy luận từ tiêu đề (KẾ HOẠCH, QUYẾT ĐỊNH, QUY ĐỊNH, HƯỚNG DẪN, CHỈ THỊ, THÔNG TƯ...) hoặc ký hiệu (KH -> Kế hoạch, QĐ -> Quyết định, QĐi -> Quy định, HD -> Hướng dẫn, CT -> Chỉ thị, TT -> Thông tư, NQ -> Nghị quyết, NĐ -> Nghị định).`,
      '6. summary: Trích yếu nội dung văn bản đầy đủ, chính xác dấu tiếng Việt. Với Công văn lấy đầy đủ nội dung sau "V/v" ở ngay bên dưới dòng "Số:" cho đến trước "Kính gửi:" (ví dụ "V/v cấp thẻ BHYT đối với Lao động hợp đồng và thân nhân cán bộ, chiến sĩ năm 2027"). Với Kế hoạch/Quyết định/Hướng dẫn/Chỉ thị/Quy định lấy tên loại văn bản + nội dung trích yếu ngay bên dưới tiêu đề. Viết chữ hoa đầu câu tự nhiên.',
      validFields.length > 0
        ? `7. workFields: Chọn tối đa 2 lĩnh vực công tác phù hợp nhất với trích yếu từ danh sách sau: [${validFields.join(', ')}]. Ví dụ BHYT, bảo hiểm, chế độ, thân nhân CBCS -> "Chế độ chính sách". Nếu không rõ thì trả mảng rỗng [].`
        : '7. workFields: Trả về mảng rỗng [].',
      'Lưu ý: Chỉ trích xuất đúng thông tin nhìn thấy trong ảnh, không bịa đặt. Nếu một trường không thấy hoặc bị mờ không đọc được thì để chuỗi rỗng "".',
    ].join('\n');

    const imagePart = {
      inlineData: {
        mimeType: normalizedMime,
        data: cleanBase64,
      },
    };

    const schemaConfig = {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          issued: {
            type: Type.STRING,
            description: 'Ngày ban hành theo định dạng DD/MM/YYYY hoặc rỗng nếu không rõ.',
          },
          number: {
            type: Type.STRING,
            description: 'Phần số văn bản trước dấu gạch chéo /.',
          },
          symbol: {
            type: Type.STRING,
            description: 'Phần ký hiệu văn bản sau dấu gạch chéo /.',
          },
          agency: {
            type: Type.STRING,
            description: 'Tên cơ quan ban hành văn bản.',
          },
          documentType: {
            type: Type.STRING,
            description: 'Tên loại văn bản khớp với danh mục.',
          },
          summary: {
            type: Type.STRING,
            description: 'Trích yếu nội dung văn bản đầy đủ tiếng Việt có dấu.',
          },
          workFields: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: 'Danh sách lĩnh vực công tác phù hợp.',
          },
        },
        required: ['issued', 'number', 'symbol', 'agency', 'documentType', 'summary', 'workFields'],
      },
    };

    const attempts: Array<{ model: string; useThinkingLow: boolean; delayMs: number }> = [
      { model: 'gemini-4-hydrogen', useThinkingLow: true, delayMs: 0 },
      { model: 'gemini-4-hydrogen', useThinkingLow: true, delayMs: 700 },
      { model: 'gemini-3.1-flash-lite', useThinkingLow: false, delayMs: 300 },
    ];

    let responseText: string | undefined;
    let lastError: any = null;

    for (let i = 0; i < attempts.length; i++) {
      const { model, useThinkingLow, delayMs } = attempts[i];
      if (delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
      try {
        const response = await ai.models.generateContent({
          model,
          contents: { parts: [imagePart, { text: prompt }] },
          config: useThinkingLow
            ? {
                ...schemaConfig,
                thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
              }
            : schemaConfig,
        });
        responseText = response.text;
        break;
      } catch (err: any) {
        lastError = err;
        const status = extractErrorStatus(err);
        const canRetryOrFailover =
          status === 404 || status === 429 || status === 500 || status === 503 || status === 504 || !status;
        if (!canRetryOrFailover) {
          throw err;
        }
        // If quota/model-unavailable on primary model, skip duplicate retry and jump straight to fallback model
        if ((status === 404 || status === 429) && i === 0 && attempts[1]?.model === model) {
          i++;
        }
      }
    }

    if (!responseText) {
      throw lastError || new Error('Không nhận được phản hồi từ AI.');
    }

    const parsed = JSON.parse(responseText.trim());
    sendJson(res, 200, {
      ok: true,
      data: {
        issued: typeof parsed.issued === 'string' ? parsed.issued.trim() : '',
        number: typeof parsed.number === 'string' ? parsed.number.trim() : '',
        symbol: typeof parsed.symbol === 'string' ? parsed.symbol.trim() : '',
        agency: typeof parsed.agency === 'string' ? parsed.agency.trim() : '',
        documentType: typeof parsed.documentType === 'string' ? parsed.documentType.trim() : '',
        summary: typeof parsed.summary === 'string' ? parsed.summary.trim() : '',
        workFields: Array.isArray(parsed.workFields)
          ? parsed.workFields.map((x: unknown) => String(x).trim()).filter(Boolean)
          : [],
      },
    });
  } catch (err: any) {
    console.error('Vercel scan-document error:', err);
    const status = extractErrorStatus(err);
    const msg = String(err?.message || '');
    if (status === 403 || (status === 400 && /API_KEY/i.test(msg))) {
      sendJson(res, 403, {
        ok: false,
        error: 'GEMINI_API_KEY không hợp lệ hoặc bị từ chối. Vui lòng kiểm tra cấu hình trên Vercel.',
      });
      return;
    }
    if (status === 429) {
      sendJson(res, 429, {
        ok: false,
        error: 'Hệ thống AI đang vượt hạn mức lượt gọi. Vui lòng thử lại sau ít phút.',
      });
      return;
    }
    if (status === 503 || status === 504) {
      sendJson(res, 503, {
        ok: false,
        error: 'Máy chủ AI đang quá tải tạm thời. Hệ thống sẽ tự chuyển sang OCR trên máy.',
      });
      return;
    }
    sendJson(res, 500, {
      ok: false,
      error: 'Không thể nhận diện ảnh văn bản bằng AI lúc này. Vui lòng thử lại hoặc chọn chế độ OCR trên máy.',
    });
  }
}
