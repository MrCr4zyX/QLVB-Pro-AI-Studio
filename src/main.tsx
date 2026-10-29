import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { registerSW } from 'virtual:pwa-register';

// Register service worker immediately for PWA / WebAPK installability
registerSW({
  immediate: true,
  onNeedRefresh() {
    console.log('K02 Mobile update available');
  },
  onOfflineReady() {
    console.log('K02 Mobile ready to work offline');
  },
});

createRoot(document.getElementById('root')!).render(<App />);

// Keep the HTML splash on Android and web. Only one visible logo.
const splash = document.getElementById('k02-startup-splash');
if (splash) {
  const HOLD_MS = 500;
  const FADE_MS = 300;
  window.setTimeout(() => {
    splash.style.transition = `opacity ${FADE_MS}ms ease`;
    splash.style.opacity = '0';
    window.setTimeout(() => splash.remove(), FADE_MS);
  }, HOLD_MS);
}
