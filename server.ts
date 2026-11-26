import 'dotenv/config';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import path from 'path';
import fs from 'fs';
import os from 'os';

const ALLOWED_SCAN_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));

  // Local PC direct file export endpoint: creates ~/Downloads/QLVB_PRO/<filename> when running locally
  app.post('/api/export-qlvb-file', (req, res) => {
    try {
      const { filename, base64Data } = req.body || {};
      if (!filename || !base64Data) {
        res.status(400).json({ ok: false, error: 'Missing filename or base64Data' });
        return;
      }
      const cleanName = path.basename(String(filename).trim());
      const downloadsDir = path.join(os.homedir(), 'Downloads', 'QLVB_PRO');
      fs.mkdirSync(downloadsDir, { recursive: true });
      const targetFile = path.join(downloadsDir, cleanName);
      const buffer = Buffer.from(String(base64Data), 'base64');
      fs.writeFileSync(targetFile, buffer);
      res.json({
        ok: true,
        targetPath: `Download/QLVB_PRO/${cleanName}`,
        fullPath: targetFile,
      });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err?.message || 'Cannot write local file' });
    }
  });

  // AI Document OCR Scanner endpoint (server-side Gemini API)
  app.post('/api/scan-document', async (req, res) => {
    try {
      const { imageBase64, mimeType, documentTypes, workFields } = req.body || {};

      if (typeof imageBase64 !== 'string' || !imageBase64.trim()) {
        res.status(400).json({ ok: false, error: 'Thiếu dữ liệu hình ảnh để quét.' });
        return;
      }

      // Strip optional data URL prefix if present
      const cleanBase64 = imageBase64.replace(/^data:[^;]+;base64,/, '').trim();
      if (cleanBase64.length > 15 * 1024 * 1024) {
        res.status(413).json({ ok: false, error: 'Ảnh quá lớn. Vui lòng chọn ảnh nhỏ hơn.' });
        return;
      }

      const normalizedMime =
        typeof mimeType === 'string' && ALLOWED_SCAN_MIME_TYPES.has(mimeType.toLowerCase())
          ? mimeType.toLowerCase() === 'image/jpg'
            ? 'image/jpeg'
            : mimeType.toLowerCase()
          : 'image/jpeg';

      const ai = getGeminiClient();
      if (!ai) {
        res.status(500).json({
          ok: false,
          error: 'Chưa cấu hình GEMINI_API_KEY trên máy chủ. Vui lòng kiểm tra mục Settings > Secrets.',
        });
        return;
      }

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

      const prompt = [
        'Bạn là chuyên gia số hóa văn bản hành chính Việt Nam (đặc biệt là văn bản khối Công an nhân dân, cơ quan nhà nước theo Nghị định 30/2020/NĐ-CP).',
        'Hãy đọc thật chính xác hình ảnh trang văn bản đính kèm và trích xuất các thông tin sang JSON theo đúng schema yêu cầu:',
        '1. issued: Ngày ban hành ở góc trên bên phải (ví dụ "Hà Nội, ngày 15 tháng 3 năm 2026") -> chuẩn hóa thành chuỗi DD/MM/YYYY (ví dụ "15/03/2026"). Nếu không thấy ngày rõ ràng, để chuỗi rỗng "".',
        '2. number: Phần SỐ văn bản đứng trước dấu gạch chéo "/" trong dòng "Số: ...". Ví dụ "Số: 123/KH-BCA" -> "123"; "Số: 08/HD-CAT-PX01" -> "08". Không gồm chữ "Số:".',
        '3. symbol: Phần KÝ HIỆU văn bản đứng sau dấu gạch chéo "/". Ví dụ "Số: 123/KH-BCA" -> "KH-BCA"; "Số: 1910/KH-E07-CT" -> "KH-E07-CT".',
        '4. agency: Cơ quan ban hành văn bản ở góc trên bên trái. Nếu có 2 dòng (cơ quan chủ quản ở trên, cơ quan trực tiếp ban hành in đậm ở dưới), ưu tiên lấy cơ quan trực tiếp ban hành. Viết chuẩn chữ hoa chữ thường tiếng Việt tự nhiên (ví dụ "Bộ Công an", "Bộ Tư lệnh Cảnh sát cơ động", "Trung đoàn CSCĐ số 7"), không viết IN HOA toàn bộ trừ từ viết tắt.',
        `5. documentType: Chọn ĐÚNG 1 tên loại văn bản khớp nhất trong danh sách sau: [${validTypes.join(', ')}]. Suy luận từ tiêu đề văn bản (KẾ HOẠCH, QUYẾT ĐỊNH, QUY ĐỊNH, HƯỚNG DẪN, CHỈ THỊ, THÔNG TƯ...) hoặc chữ viết tắt trong ký hiệu (KH -> Kế hoạch, QĐ -> Quyết định, QĐi -> Quy định, HD -> Hướng dẫn, CV -> Công văn, CT -> Chỉ thị, TT -> Thông tư, NQ -> Nghị quyết, NĐ -> Nghị định).`,
        '6. summary: Trích yếu nội dung văn bản đầy đủ, chính xác dấu tiếng Việt. Với Công văn lấy phần "V/v ..." (có thể giữ gọn, bỏ chữ "V/v" ở đầu hoặc giữ tự nhiên); với Kế hoạch/Quyết định/Hướng dẫn/Chỉ thị/Quy định lấy tên loại văn bản + nội dung trích yếu ngay bên dưới tiêu đề (ví dụ "Kế hoạch về việc tổ chức..."). Viết chữ hoa đầu câu tự nhiên, không viết IN HOA toàn bộ.',
        validFields.length > 0
          ? `7. workFields: Chọn tối đa 2 lĩnh vực công tác phù hợp nhất với trích yếu từ danh sách sau: [${validFields.join(', ')}]. Nếu không rõ thì trả mảng rỗng [].`
          : '7. workFields: Trả về mảng rỗng [].',
        'Lưu ý: Chỉ trích xuất đúng thông tin nhìn thấy trong ảnh, không bịa đặt. Nếu một trường không thấy hoặc bị mờ không đọc được thì để chuỗi rỗng "".',
      ].join('\n');

      const imagePart = {
        inlineData: {
          mimeType: normalizedMime,
          data: cleanBase64,
        },
      };

      let responseText: string | undefined;
      let lastError: any = null;

      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const response = await ai.models.generateContent({
            model: 'gemini-4-hydrogen',
            contents: { parts: [imagePart, { text: prompt }] },
            config: {
              thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
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
            },
          });
          responseText = response.text;
          break;
        } catch (err: any) {
          lastError = err;
          const status = err?.status || err?.code;
          const isRetryable = status === 500 || status === 503 || status === 504 || !status;
          if (!isRetryable || attempt === 1) {
            throw err;
          }
          await new Promise((resolve) => setTimeout(resolve, 600));
        }
      }

      if (!responseText) {
        throw lastError || new Error('Không nhận được phản hồi từ AI.');
      }

      const parsed = JSON.parse(responseText.trim());
      res.json({
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
      console.error('Document scan error:', err);
      const status = err?.status || err?.code;
      const msg = String(err?.message || '');
      if (status === 403 || status === 400 && msg.includes('API_KEY')) {
        res.status(403).json({
          ok: false,
          error: 'API key không hợp lệ hoặc bị từ chối. Vui lòng kiểm tra trong mục Settings > Secrets.',
        });
        return;
      }
      if (status === 429) {
        res.status(429).json({
          ok: false,
          error: 'Hệ thống AI đang vượt hạn mức lượt gọi. Vui lòng thử lại sau ít phút.',
        });
        return;
      }
      res.status(500).json({
        ok: false,
        error: msg || 'Không thể nhận diện ảnh văn bản. Vui lòng chụp rõ hơn và thử lại.',
      });
    }
  });

  // First-party OAuth2 callback handler (/__/auth/handler) — eliminates 3rd-party cookie partitioning
  app.get('/__/auth/handler', (_req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.send(`<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Đang kết nối Google Drive - K02 QLVB PRO</title>
  <style>
    body { margin: 0; font-family: system-ui, -apple-system, sans-serif; background: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 20px; box-sizing: border-box; }
    .card { max-width: 420px; width: 100%; background: #1e293b; border: 1px solid #334155; border-radius: 20px; padding: 24px; text-align: center; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.5); }
    .spinner { width: 38px; height: 38px; border: 3px solid #334155; border-top-color: #3b82f6; border-radius: 50%; animation: spin 0.8s linear infinite; margin: 0 auto 16px; }
    @keyframes spin { to { transform: rotate(360deg); } }
    h2 { font-size: 16px; margin: 0 0 8px; color: #fff; }
    p { font-size: 13px; color: #94a3b8; margin: 0 0 16px; line-height: 1.5; }
    .btn { display: inline-block; background: #2563eb; color: #fff; text-decoration: none; font-weight: 700; font-size: 13px; padding: 11px 18px; border-radius: 12px; margin-top: 8px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="spinner" id="sp"></div>
    <h2 id="title">Đang hoàn tất đăng nhập Google Drive...</h2>
    <p id="desc">Vui lòng đợi trong giây lát, đang tự động chuyển về ứng dụng K02 QLVB PRO.</p>
    <div id="actions"></div>
  </div>
  <script>
    (async function() {
      try {
        var rawHash = window.location.hash ? window.location.hash.substring(1) : '';
        var hashParams = new URLSearchParams(rawHash);
        var searchParams = new URLSearchParams(window.location.search);
        var accessToken = hashParams.get('access_token') || searchParams.get('access_token');
        var expiresIn = parseInt(hashParams.get('expires_in') || '3500', 10) || 3500;
        var stateRaw = hashParams.get('state') || searchParams.get('state') || '';
        var state = {};
        if (stateRaw) {
          try {
            state = JSON.parse(decodeURIComponent(escape(window.atob(stateRaw))));
          } catch (e) {
            try { state = JSON.parse(decodeURIComponent(stateRaw)); } catch (e2) {}
          }
        }

        if (!accessToken) {
          window.location.replace('/?tab=sync');
          return;
        }

        var email = '';
        var name = '';
        var picture = '';
        try {
          var resp = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { Authorization: 'Bearer ' + accessToken }
          });
          if (resp.ok) {
            var info = await resp.json();
            email = info.email || '';
            name = info.name || '';
            picture = info.picture || '';
          }
        } catch (err) {}

        var expiryMs = Date.now() + expiresIn * 1000;
        localStorage.setItem('k02_gdrive_access_token', accessToken);
        sessionStorage.setItem('k02_gdrive_access_token', accessToken);
        localStorage.setItem('k02_gdrive_token_expiry', String(expiryMs));
        localStorage.setItem('k02_gdrive_scope_v2', 'true');
        localStorage.setItem('k02_gdrive_user_profile', JSON.stringify({
          email: email || 'Đã kết nối Google Drive',
          displayName: name || email || 'Tài khoản Google Drive',
          photoURL: picture || null
        }));

        var bridgePayload = {
          a: accessToken,
          i: '',
          e: email || 'Đã kết nối Google Drive',
          n: name || email || 'Tài khoản Google Drive',
          p: picture || ''
        };
        var bridgeCode = window.btoa(unescape(encodeURIComponent(JSON.stringify(bridgePayload))));

        try {
          if (window.opener && !window.opener.closed) {
            window.opener.postMessage({ type: 'K02_AUTH_BRIDGE_CODE', code: bridgeCode }, '*');
          }
        } catch (e) {}

        try {
          if (typeof BroadcastChannel !== 'undefined') {
            var bc = new BroadcastChannel('k02_gdrive_auth_channel');
            bc.postMessage({ type: 'K02_AUTH_BRIDGE_CODE', code: bridgeCode });
            setTimeout(function() { bc.close(); }, 400);
          }
        } catch (e) {}

        if (state && state.pwaOrigin) {
          var sep = state.pwaOrigin.indexOf('?') !== -1 ? '&' : '?';
          var returnUrl = state.pwaOrigin + sep + 'code=' + encodeURIComponent(bridgeCode) + '&tab=sync';
          document.getElementById('actions').innerHTML = '<a class="btn" href="' + returnUrl + '">Quay về ứng dụng PWA ngay</a>';
          window.location.replace(returnUrl);
          return;
        }

        if (state && state.apkAuth) {
          var deepLink = 'k02qlvb://auth?code=' + encodeURIComponent(bridgeCode);
          document.getElementById('title').textContent = '✓ Đã xác thực Google Drive thành công!';
          document.getElementById('desc').textContent = 'Đang mở lại ứng dụng K02 QLVB PRO...';
          document.getElementById('actions').innerHTML = '<a class="btn" href="' + deepLink + '">Mở Ứng Dụng K02 QLVB PRO</a>';
          window.location.href = deepLink;
          return;
        }

        if (window.opener && !window.opener.closed) {
          setTimeout(function() {
            try { window.close(); } catch (e) {}
          }, 150);
          document.getElementById('title').textContent = '✓ Đã đăng nhập thành công!';
          document.getElementById('desc').textContent = 'Bạn có thể đóng cửa sổ này.';
          return;
        }

        window.location.replace('/?tab=sync&code=' + encodeURIComponent(bridgeCode));
      } catch (e) {
        window.location.replace('/?tab=sync');
      }
    })();
  </script>
</body>
</html>`);
  });

  app.get('/k02_mobile_qlvb_20.2.apk', (req, res) => {
    const apkPath = path.resolve(process.cwd(), 'public/k02_mobile_qlvb_20.2.apk');
    if (fs.existsSync(apkPath)) {
      res.setHeader('Content-Type', 'application/vnd.android.package-archive');
      res.setHeader('Content-Disposition', 'attachment; filename="k02_mobile_qlvb_20.2.apk"');
      fs.createReadStream(apkPath).pipe(res);
    } else {
      res.status(404).send('APK file not found');
    }
  });

  app.get('/k02_mobile_qlvb.apk', (req, res) => {
    const apkPath = path.resolve(process.cwd(), 'public/k02_mobile_qlvb.apk');
    if (fs.existsSync(apkPath)) {
      res.setHeader('Content-Type', 'application/vnd.android.package-archive');
      res.setHeader('Content-Disposition', 'attachment; filename="k02_mobile_qlvb_20.2.apk"');
      fs.createReadStream(apkPath).pipe(res);
    } else {
      res.status(404).send('APK file not found');
    }
  });

  app.get('/k02_web_html.zip', (req, res) => {
    const zipPath = path.resolve(process.cwd(), 'public/k02_web_html.zip');
    if (fs.existsSync(zipPath)) {
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', 'attachment; filename="k02_web_html.zip"');
      fs.createReadStream(zipPath).pipe(res);
    } else {
      res.status(404).send('ZIP file not found');
    }
  });

  // Create Vite server in middleware mode with HMR disabled
  const vite = await createViteServer({
    server: { middlewareMode: true, hmr: false },
    appType: 'spa',
  });

  app.use(vite.middlewares);

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
