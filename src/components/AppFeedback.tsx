import React, { useEffect, useState } from 'react';
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from 'lucide-react';

export type ToastTone = 'success' | 'error' | 'warning' | 'info';

export interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
}

export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
}

interface PendingConfirm extends ConfirmOptions {
  resolve: (accepted: boolean) => void;
}

type ToastListener = (toast: ToastItem) => void;
type ConfirmListener = (req: PendingConfirm) => void;

const toastListeners = new Set<ToastListener>();
const confirmListeners = new Set<ConfirmListener>();
let nextToastId = 1;

export function showToast(message: string, tone: ToastTone = 'info'): void {
  const item: ToastItem = { id: nextToastId++, message, tone };
  toastListeners.forEach((fn) => fn(item));
}

export function showConfirm(options: ConfirmOptions | string): Promise<boolean> {
  const normalized: ConfirmOptions =
    typeof options === 'string' ? { message: options } : options;

  if (confirmListeners.size === 0) {
    return Promise.resolve(false);
  }

  return new Promise<boolean>((resolve) => {
    const req: PendingConfirm = { ...normalized, resolve };
    confirmListeners.forEach((fn) => fn(req));
  });
}

export const AppFeedbackHost: React.FC = () => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [confirmQueue, setConfirmQueue] = useState<PendingConfirm[]>([]);

  useEffect(() => {
    const onToast: ToastListener = (item) => {
      setToasts((prev) => [...prev.slice(-2), item]);
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== item.id));
      }, 3000);
    };

    const onConfirm: ConfirmListener = (req) => {
      setConfirmQueue((prev) => [...prev, req]);
    };

    toastListeners.add(onToast);
    confirmListeners.add(onConfirm);
    return () => {
      toastListeners.delete(onToast);
      confirmListeners.delete(onConfirm);
    };
  }, []);

  const activeConfirm = confirmQueue[0] || null;

  const resolveActiveConfirm = (accepted: boolean) => {
    if (!activeConfirm) return;
    activeConfirm.resolve(accepted);
    setConfirmQueue((prev) => prev.slice(1));
  };

  useEffect(() => {
    if (!activeConfirm) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') resolveActiveConfirm(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeConfirm]);

  const dismissToast = (id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <>
      {/* Auto-dismissing Toast Stack */}
      {toasts.length > 0 && (
        <div
          className="fixed left-3 right-3 sm:left-auto sm:right-4 sm:w-96 z-[90] flex flex-col gap-2 pointer-events-none"
          style={{ bottom: 'calc(5rem + env(safe-area-inset-bottom, 0px))' }}
          role="status"
          aria-live="polite"
        >
          {toasts.map((t) => {
            const styles = {
              success: 'bg-emerald-950/95 text-emerald-50 border-emerald-700/80',
              error: 'bg-rose-950/95 text-rose-50 border-rose-700/80',
              warning: 'bg-amber-950/95 text-amber-50 border-amber-700/80',
              info: 'bg-slate-900/95 text-slate-50 border-slate-700/80',
            }[t.tone];

            const Icon = {
              success: CheckCircle2,
              error: XCircle,
              warning: AlertTriangle,
              info: Info,
            }[t.tone];

            const iconColor = {
              success: 'text-emerald-400',
              error: 'text-rose-400',
              warning: 'text-amber-400',
              info: 'text-blue-400',
            }[t.tone];

            return (
              <div
                key={t.id}
                className={`pointer-events-auto flex items-start gap-2.5 px-3.5 py-2.5 rounded-xl border shadow-xl backdrop-blur-md text-xs font-medium leading-snug animate-fadeIn ${styles}`}
              >
                <Icon className={`w-4 h-4 shrink-0 mt-0.5 ${iconColor}`} />
                <span className="flex-1 break-words">{t.message}</span>
                <button
                  type="button"
                  onClick={() => dismissToast(t.id)}
                  className="p-0.5 rounded-md opacity-70 hover:opacity-100 transition shrink-0"
                  aria-label="Đóng thông báo"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* In-App Confirm Dialog */}
      {activeConfirm && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/55 backdrop-blur-xs animate-fadeIn"
          onClick={() => resolveActiveConfirm(false)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="w-full max-w-sm bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 sm:p-5 space-y-2.5">
              <div className="flex items-start gap-3">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                    activeConfirm.danger
                      ? 'bg-rose-100 text-rose-600'
                      : 'bg-blue-100 text-blue-700'
                  }`}
                >
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-bold text-slate-900 leading-snug">
                    {activeConfirm.title || 'Xác nhận thao tác'}
                  </h3>
                  <p className="text-xs text-slate-600 leading-relaxed mt-1 break-words">
                    {activeConfirm.message}
                  </p>
                </div>
              </div>
            </div>

            <div className="px-4 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => resolveActiveConfirm(false)}
                className="min-h-[40px] px-4 py-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-semibold transition active:scale-98 whitespace-nowrap"
              >
                {activeConfirm.cancelText || 'Hủy'}
              </button>
              <button
                type="button"
                onClick={() => resolveActiveConfirm(true)}
                className={`min-h-[40px] px-4 py-2 rounded-xl text-white text-xs font-bold shadow-xs transition active:scale-98 whitespace-nowrap ${
                  activeConfirm.danger
                    ? 'bg-rose-600 hover:bg-rose-700'
                    : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {activeConfirm.confirmText || 'Xác nhận'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
