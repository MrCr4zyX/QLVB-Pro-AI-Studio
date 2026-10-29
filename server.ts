import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.get('/k02_mobile_qlvb_1.9.apk', (req, res) => {
    const apkPath = path.resolve(process.cwd(), 'public/k02_mobile_qlvb_1.9.apk');
    if (fs.existsSync(apkPath)) {
      res.setHeader('Content-Type', 'application/vnd.android.package-archive');
      res.setHeader('Content-Disposition', 'attachment; filename="k02_mobile_qlvb_1.9.apk"');
      fs.createReadStream(apkPath).pipe(res);
    } else {
      res.status(404).send('APK file not found');
    }
  });

  app.get('/k02_mobile_qlvb_1.8.apk', (req, res) => {
    const apkPath = path.resolve(process.cwd(), 'public/k02_mobile_qlvb_1.9.apk');
    if (fs.existsSync(apkPath)) {
      res.setHeader('Content-Type', 'application/vnd.android.package-archive');
      res.setHeader('Content-Disposition', 'attachment; filename="k02_mobile_qlvb_1.9.apk"');
      fs.createReadStream(apkPath).pipe(res);
    } else {
      res.status(404).send('APK file not found');
    }
  });

  app.get('/k02_mobile_qlvb_1.7.apk', (req, res) => {
    const apkPath = path.resolve(process.cwd(), 'public/k02_mobile_qlvb_1.7.apk');
    if (fs.existsSync(apkPath)) {
      res.setHeader('Content-Type', 'application/vnd.android.package-archive');
      res.setHeader('Content-Disposition', 'attachment; filename="k02_mobile_qlvb_1.7.apk"');
      fs.createReadStream(apkPath).pipe(res);
    } else {
      res.status(404).send('APK file not found');
    }
  });

  app.get('/k02_mobile_qlvb.apk', (req, res) => {
    const apkPath = path.resolve(process.cwd(), 'public/k02_mobile_qlvb.apk');
    if (fs.existsSync(apkPath)) {
      res.setHeader('Content-Type', 'application/vnd.android.package-archive');
      res.setHeader('Content-Disposition', 'attachment; filename="k02_mobile_qlvb.apk"');
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
