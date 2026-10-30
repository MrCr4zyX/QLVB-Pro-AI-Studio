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

  app.get('/k02_mobile_qlvb_19.8.apk', (req, res) => {
    const apkPath = path.resolve(process.cwd(), 'public/k02_mobile_qlvb_19.8.apk');
    if (fs.existsSync(apkPath)) {
      res.setHeader('Content-Type', 'application/vnd.android.package-archive');
      res.setHeader('Content-Disposition', 'attachment; filename="k02_mobile_qlvb_19.8.apk"');
      fs.createReadStream(apkPath).pipe(res);
    } else {
      res.status(404).send('APK file not found');
    }
  });

  app.get('/k02_mobile_qlvb.apk', (req, res) => {
    const apkPath = path.resolve(process.cwd(), 'public/k02_mobile_qlvb.apk');
    if (fs.existsSync(apkPath)) {
      res.setHeader('Content-Type', 'application/vnd.android.package-archive');
      res.setHeader('Content-Disposition', 'attachment; filename="k02_mobile_qlvb_19.8.apk"');
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
