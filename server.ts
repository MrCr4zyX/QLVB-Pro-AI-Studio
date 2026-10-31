import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import os from 'os';

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
