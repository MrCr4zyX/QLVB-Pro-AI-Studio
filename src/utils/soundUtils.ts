/**
 * Professional Notification Sound using Web Audio API
 * Synthesizes clear, resonant alert chimes that work offline on any Android / Web device
 */

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioContextClass =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return null;
  if (!audioCtx) {
    audioCtx = new AudioContextClass();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

/**
 * Play a high-priority administrative alert chime (D5 -> A5 -> D6 chime)
 */
export function playAlertChime(): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    // First chime (D5 - 587.33 Hz)
    playTone(ctx, 587.33, now, 0.28, 0.25);

    // Second chime (A5 - 880.00 Hz)
    playTone(ctx, 880.0, now + 0.12, 0.35, 0.3);

    // Third resonant chime (D6 - 1174.66 Hz)
    playTone(ctx, 1174.66, now + 0.26, 0.55, 0.35);
  } catch (e) {
    console.warn('Audio play failed:', e);
  }
}

/**
 * Play a subtle confirmation tone
 */
export function playSuccessChime(): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    playTone(ctx, 659.25, now, 0.2, 0.2); // E5
    playTone(ctx, 987.77, now + 0.1, 0.35, 0.25); // B5
  } catch (e) {
    console.warn('Audio play failed:', e);
  }
}

function playTone(
  ctx: AudioContext,
  freq: number,
  startTime: number,
  duration: number,
  maxVolume = 0.3
): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq, startTime);

  // Smooth attack & decay
  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.exponentialRampToValueAtTime(maxVolume, startTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(startTime);
  osc.stop(startTime + duration + 0.05);
}

/**
 * Trigger Android Native notification via MainActivity's @JavascriptInterface AndroidBridge
 */
export function notifyAndroidNative(title: string, message: string): boolean {
  try {
    if (typeof window !== 'undefined') {
      const bridge = (window as unknown as {
        AndroidBridge?: {
          showNotification?: (t: string, m: string) => void;
          triggerNativeNotification?: (t: string, m: string) => void;
        };
      }).AndroidBridge;
      if (bridge) {
        if (typeof bridge.showNotification === 'function') {
          bridge.showNotification(title, message);
          return true;
        }
        if (typeof bridge.triggerNativeNotification === 'function') {
          bridge.triggerNativeNotification(title, message);
          return true;
        }
      }
    }
  } catch (e) {
    console.warn('AndroidBridge notification error:', e);
  }
  return false;
}

