import { useState, useEffect, useCallback, useMemo } from 'react';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { EnrichedReport } from '../types';
import { playAlertChime, notifyAndroidNative } from '../utils/soundUtils';

const NATIVE = Capacitor.isNativePlatform();
const hasAndroidBridge = (): boolean =>
  typeof window !== 'undefined' &&
  Boolean(
    (window as unknown as { AndroidBridge?: { showNotification?: unknown } }).AndroidBridge
  );

const CHANNEL_ID = 'k02_urgent_alerts';
const SCHEDULE_IDS = Array.from({ length: 14 }, (_, i) => 920100 + i);
const dateLocal = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

let channelCreated = false;

/**
 * Ensure a high-importance notification channel exists on Android 8.0+ (API 26+)
 * so notifications appear in the status bar and pop up as heads-up banners.
 */
async function ensureAndroidChannel(): Promise<void> {
  if (!NATIVE || channelCreated) return;
  try {
    await LocalNotifications.createChannel({
      id: CHANNEL_ID,
      name: 'Cảnh báo hạn báo cáo K02',
      description: 'Thông báo nhắc hạn văn bản và kỳ báo cáo trên thanh trạng thái',
      importance: 5, // IMPORTANCE_HIGH -> shows on status bar + heads-up banner
      visibility: 1, // VISIBILITY_PUBLIC -> visible on lock screen & status bar
      vibration: true,
      lights: true,
      lightColor: '#EF4444',
    });
    channelCreated = true;
  } catch (error) {
    console.warn('K02 createChannel warning:', error);
  }
}

/**
 * Show a browser/PWA notification on the phone's status bar.
 * CRITICAL: On Android browsers (Chrome, Cốc Cốc, Samsung Internet, Edge, WebAPK),
 * `new Notification()` throws TypeError ("Illegal constructor. Use ServiceWorkerRegistration.showNotification() instead").
 * We MUST use ServiceWorkerRegistration.showNotification() first, and fall back to `new Notification()` on desktop.
 */
async function showWebOrPwaStatusNotification(title: string, body: string): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) return false;

  let currentPerm = Notification.permission;
  if (currentPerm === 'default') {
    try {
      currentPerm = await Notification.requestPermission();
    } catch (e) {
      console.warn('Notification.requestPermission error:', e);
    }
  }
  if (currentPerm !== 'granted') return false;

  const iconUrl = new URL('./pwa-192x192.png', window.location.href).href;

  // 1. Primary path for Android mobile browsers & installed PWA: ServiceWorkerRegistration.showNotification
  if ('serviceWorker' in navigator) {
    try {
      let reg = await navigator.serviceWorker.getRegistration();
      if (!reg) {
        reg = await navigator.serviceWorker.register('./sw.js').catch(() => undefined);
      }
      if (reg && 'showNotification' in reg) {
        await reg.showNotification(title, {
          body,
          icon: iconUrl,
          badge: iconUrl,
          tag: `k02-alert-${Date.now()}`,
          renotify: true,
          requireInteraction: false,
          vibrate: [200, 100, 200],
        } as NotificationOptions);
        return true;
      }
    } catch (swError) {
      console.warn('K02 ServiceWorker showNotification fallback:', swError);
    }
  }

  // 2. Fallback for desktop browsers without active SW
  try {
    new Notification(title, {
      body,
      icon: iconUrl,
      badge: iconUrl,
      tag: `k02-alert-${Date.now()}`,
    });
    return true;
  } catch (error) {
    console.warn('K02 direct Notification constructor failed:', error);
    return false;
  }
}

/**
 * Send a system notification to the phone's status bar:
 * 1. AndroidBridge (Native Android WebView APK `com.k02.qlvbpro.MainActivity`)
 * 2. Capacitor LocalNotifications (Capacitor Android build)
 * 3. ServiceWorkerRegistration.showNotification (Mobile Browser / PWA)
 */
export async function sendSystemPushNotification(
  title: string,
  body: string,
  autoRequestPermission = true
): Promise<boolean> {
  // 1. Check Native AndroidBridge first (present in packaged APK)
  if (notifyAndroidNative(title, body)) {
    return true;
  }

  // 2. Check Capacitor Native platform
  if (NATIVE) {
    try {
      await ensureAndroidChannel();
      let permission = await LocalNotifications.checkPermissions();
      if (permission.display !== 'granted' && autoRequestPermission) {
        permission = await LocalNotifications.requestPermissions();
      }
      if (permission.display !== 'granted') return false;

      // Safe positive 32-bit integer ID for Android NotificationManager
      const notificationId = Math.floor(Math.random() * 1000000) + 1000;

      await LocalNotifications.schedule({
        notifications: [
          {
            id: notificationId,
            title,
            body,
            channelId: CHANNEL_ID,
            smallIcon: 'ic_launcher_foreground',
            iconColor: '#1E40AF',
            schedule: {
              at: new Date(Date.now() + 250),
              allowWhileIdle: true,
            },
          },
        ],
      });
      return true;
    } catch (error) {
      console.warn('K02 Android LocalNotifications failed, trying fallback schedule:', error);
      try {
        const fallbackId = Math.floor(Math.random() * 1000000) + 1000;
        await LocalNotifications.schedule({
          notifications: [{ id: fallbackId, title, body }],
        });
        return true;
      } catch (err2) {
        console.warn('K02 Android fallback notification failed:', err2);
        return false;
      }
    }
  }

  // 3. Mobile Web / PWA fallback
  return showWebOrPwaStatusNotification(title, body);
}

async function updateNativeSchedules(reports: EnrichedReport[]): Promise<void> {
  if (!NATIVE) return;
  await ensureAndroidChannel();
  const permission = await LocalNotifications.checkPermissions();
  if (permission.display !== 'granted') return;

  // Cancel only K02's own scheduled reminders; leave immediate status bar notifications intact.
  const pending = await LocalNotifications.getPending();
  const owned = pending.notifications.filter((n) => SCHEDULE_IDS.includes(n.id));
  if (owned.length) {
    await LocalNotifications.cancel({ notifications: owned.map((n) => ({ id: n.id })) });
  }

  const now = new Date();
  const notifications: Array<{
    id: number;
    title: string;
    body: string;
    channelId: string;
    smallIcon: string;
    iconColor: string;
    schedule: { at: Date; allowWhileIdle: boolean };
  }> = [];
  let nextId = 0;

  // Schedule a rolling 7-day window at 09:00 and 14:00
  for (let day = 0; day < 7; day++) {
    for (const hour of [9, 14]) {
      const at = new Date(now.getFullYear(), now.getMonth(), now.getDate() + day, hour, 0, 0);
      if (at <= now) continue;
      const threshold = new Date(at.getFullYear(), at.getMonth(), at.getDate() + 30);
      const deadline = dateLocal(threshold);
      const count = reports.filter(
        (r) => !r.completed_date && r.precision === 'day' && r.due_date <= deadline
      ).length;
      if (count === 0) continue;
      notifications.push({
        id: SCHEDULE_IDS[nextId++],
        title: '🔔 K02 - Nhắc hạn báo cáo',
        body: `Có ${count} kỳ báo cáo cần theo dõi trong 30 ngày tới. Mở K02 để kiểm tra.`,
        channelId: CHANNEL_ID,
        smallIcon: 'ic_launcher_foreground',
        iconColor: '#1E40AF',
        schedule: { at, allowWhileIdle: true },
      });
    }
  }
  if (notifications.length) {
    await LocalNotifications.schedule({ notifications });
  }
}

export function useNotifications(reports: EnrichedReport[]) {
  const [permission, setPermission] = useState<NotificationPermission>(() => {
    if (hasAndroidBridge()) return 'granted';
    if (!NATIVE && typeof window !== 'undefined' && 'Notification' in window) {
      return Notification.permission;
    }
    return 'default';
  });
  const [hasPrompted, setHasPrompted] = useState(false);
  const [today, setToday] = useState(() => dateLocal(new Date()));

  const alertReports = useMemo(() => {
    const date = new Date(`${today}T12:00:00`);
    date.setDate(date.getDate() + 30);
    const end = dateLocal(date);
    return reports
      .filter((r) => !r.completed_date && r.precision === 'day' && r.due_date <= end)
      .sort((a, b) => a.due_date.localeCompare(b.due_date));
  }, [reports, today]);

  const overdueCount = useMemo(
    () => alertReports.filter((r) => r.due_date < today).length,
    [alertReports, today]
  );
  const urgentTodayCount = useMemo(
    () => alertReports.filter((r) => r.due_date === today).length,
    [alertReports, today]
  );

  const requestPermission = useCallback(async (): Promise<boolean> => {
    try {
      if (hasAndroidBridge()) {
        setPermission('granted');
        playAlertChime();
        notifyAndroidNative(
          '🔔 K02 - Đã bật thông báo Status Bar',
          alertReports.length > 0
            ? `Có ${alertReports.length} kỳ báo cáo cần xử lý (${overdueCount} quá hạn).`
            : 'Thông báo trên thanh trạng thái điện thoại đã được kích hoạt.'
        );
        return true;
      }

      if (NATIVE) {
        await ensureAndroidChannel();
        const result = await LocalNotifications.requestPermissions();
        const granted = result.display === 'granted';
        setPermission(granted ? 'granted' : 'denied');
        if (granted) {
          playAlertChime();
          await sendSystemPushNotification(
            '🔔 K02 - Đã bật thông báo Status Bar',
            alertReports.length > 0
              ? `Có ${alertReports.length} kỳ báo cáo cần xử lý (${overdueCount} quá hạn).`
              : 'Thông báo trên thanh trạng thái điện thoại đã được kích hoạt.',
            false
          );
          await updateNativeSchedules(reports);
        }
        return granted;
      }

      if (typeof window === 'undefined' || !('Notification' in window)) return false;
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result === 'granted') {
        playAlertChime();
        await sendSystemPushNotification(
          '🔔 K02 - Đã bật thông báo Status Bar',
          alertReports.length > 0
            ? `Có ${alertReports.length} kỳ báo cáo cần xử lý (${overdueCount} quá hạn).`
            : 'Đã bật thông báo trên thanh trạng thái trình duyệt.',
          false
        );
      }
      return result === 'granted';
    } catch (error) {
      console.warn('K02 notification permission error:', error);
      return false;
    }
  }, [reports, alertReports.length, overdueCount]);

  // Initialize channel & check permission on Android Native startup (auto-request if 'prompt')
  useEffect(() => {
    if (hasAndroidBridge()) {
      setPermission('granted');
      return;
    }
    if (!NATIVE) return;
    ensureAndroidChannel()
      .then(() => LocalNotifications.checkPermissions())
      .then(async (p) => {
        if (p.display === 'prompt' || p.display === 'prompt-with-rationale') {
          const req = await LocalNotifications.requestPermissions();
          setPermission(req.display === 'granted' ? 'granted' : 'denied');
        } else {
          setPermission(
            p.display === 'granted' ? 'granted' : p.display === 'denied' ? 'denied' : 'default'
          );
        }
      })
      .catch(console.warn);
  }, []);

  // Push startup notification to phone Status Bar once per session when alerts exist
  useEffect(() => {
    if (alertReports.length === 0) return;
    if (permission !== 'granted' && !hasAndroidBridge()) return;
    const startupPushKey = 'k02_startup_statusbar_pushed';
    if (sessionStorage.getItem(startupPushKey)) return;
    sessionStorage.setItem(startupPushKey, 'true');

    const msg =
      overdueCount > 0
        ? `Có ${overdueCount} báo cáo quá hạn và ${alertReports.length - overdueCount} báo cáo sắp đến hạn!`
        : `Có ${alertReports.length} kỳ báo cáo sắp đến hạn trong 30 ngày tới.`;

    void sendSystemPushNotification('🔔 Cảnh báo hạn báo cáo K02', msg, false);
  }, [alertReports.length, overdueCount, permission]);

  useEffect(() => {
    if (!NATIVE || permission !== 'granted') return;
    updateNativeSchedules(reports).catch((e) => console.warn('K02 schedule failed:', e));
  }, [reports, permission, today]);

  // Browser/PWA periodic check at 09:00 and 14:00
  useEffect(() => {
    const check = () => {
      const now = new Date();
      const currentDate = dateLocal(now);
      setToday((prev) => (prev === currentDate ? prev : currentDate));
      if (NATIVE) return;
      const slot = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      if (slot !== '09:00' && slot !== '14:00') return;
      const key = `k02_alert_slot_${currentDate}_${slot}`;
      if (localStorage.getItem(key) || alertReports.length === 0) return;
      void sendSystemPushNotification(
        '🔔 K02 - Cảnh báo hạn báo cáo',
        `Có ${alertReports.length} kỳ báo cáo cần theo dõi (${overdueCount} quá hạn).`,
        false
      ).then((sent) => {
        if (sent) localStorage.setItem(key, 'true');
      });
    };
    check();
    const interval = setInterval(check, 30000);
    return () => clearInterval(interval);
  }, [alertReports, overdueCount]);

  return {
    alertReports,
    overdueCount,
    urgentTodayCount,
    totalAlertsCount: alertReports.length,
    permission,
    requestPermission,
    sendSystemPushNotification,
    hasPrompted,
    setHasPrompted,
  };
}

