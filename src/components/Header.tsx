import React, { useState, useRef, useEffect } from 'react';
import { Bell, RefreshCw } from 'lucide-react';
import { sendSystemPushNotification } from '../hooks/useNotifications';
import appLogo from '../assets/app-logo.png';

interface HeaderProps {
  unreadAlertsCount: number;
  isSyncActive?: boolean;
  onOpenNotifications: () => void;
  onOpenSync: () => void;
  onOpenInstallGuide: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  unreadAlertsCount,
  isSyncActive = false,
  onOpenNotifications,
  onOpenSync,
}) => {
  const [imgError, setImgError] = useState(false);
  const subtitleBoxRef = useRef<HTMLDivElement>(null);
  const subtitleTextRef = useRef<HTMLSpanElement>(null);
  const [marqueeOverflow, setMarqueeOverflow] = useState(0);

  useEffect(() => {
    const box = subtitleBoxRef.current;
    const text = subtitleTextRef.current;
    if (!box || !text) return;

    const measure = () => {
      const diff = Math.ceil(text.scrollWidth - box.clientWidth);
      setMarqueeOverflow(diff > 1 ? diff + 6 : 0);
    };

    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(box);
    ro?.observe(text);
    window.addEventListener('resize', measure);
    if (document.fonts?.ready) {
      document.fonts.ready.then(measure).catch(() => {});
    }

    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  const marqueeDuration = marqueeOverflow > 0
    ? `${Math.max(5.5, Math.min(11, 4.5 + marqueeOverflow / 18)).toFixed(2)}s`
    : undefined;

  return (
    <header
      className="sticky top-0 z-30 bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white shadow-md border-b border-blue-800/60 shrink-0"
      style={{ paddingTop: 'max(0px, env(safe-area-inset-top, 0px))' }}
    >
      {/* Android-like Top Bar */}
      <div className="max-w-7xl mx-auto px-3.5 py-2 flex items-center justify-between gap-2">
        {/* Brand logo & title */}
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl overflow-hidden shadow-md shrink-0 border border-amber-400/50 bg-blue-950 flex items-center justify-center">
            {!imgError ? (
              <img
                src={appLogo}
                alt="QLVB Mobile"
                className="w-full h-full object-cover"
                onError={() => setImgError(true)}
              />
            ) : (
              <span className="text-amber-400 font-black text-xs tracking-wider">CAND</span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <h1 className="text-sm sm:text-base font-bold text-white tracking-tight leading-none whitespace-nowrap">
                QLVB Mobile
              </h1>
              <span className="text-[9px] px-1 py-0.5 rounded font-bold bg-red-600/90 text-white tracking-wider shrink-0">
                PRO
              </span>
            </div>
            <div
              ref={subtitleBoxRef}
              className="overflow-hidden whitespace-nowrap mt-0.5 leading-tight"
            >
              <span
                ref={subtitleTextRef}
                className={`text-[10px] text-blue-200/80 font-medium inline-block whitespace-nowrap ${
                  marqueeOverflow > 0 ? 'animate-marquee-bounce' : ''
                }`}
                style={
                  marqueeOverflow > 0
                    ? ({
                        '--marquee-offset': `-${marqueeOverflow}px`,
                        '--marquee-duration': marqueeDuration,
                      } as React.CSSProperties)
                    : undefined
                }
              >
                QUẢN LÝ VĂN BẢN & BÁO CÁO
              </span>
            </div>
          </div>
        </div>

        {/* Action icons */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Sync shortcut button (visible on both mobile and desktop) */}
          <button
            type="button"
            onClick={onOpenSync}
            className={`min-h-[38px] flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg border transition active:scale-95 whitespace-nowrap ${
              isSyncActive
                ? 'bg-white text-blue-900 border-white shadow-xs'
                : 'bg-blue-800/70 hover:bg-blue-700/80 text-blue-100 border-blue-700/50'
            }`}
            title="Đồng bộ dữ liệu Excel / Google Drive"
          >
            <RefreshCw className={`w-3.5 h-3.5 shrink-0 ${isSyncActive ? 'text-blue-700' : 'text-blue-300'}`} />
            <span>Đồng bộ</span>
          </button>

          {/* Notification Bell with Badge */}
          <button
            type="button"
            onClick={() => {
              onOpenNotifications();
              sendSystemPushNotification(
                '🔔 Cảnh báo hạn báo cáo!',
                unreadAlertsCount > 0
                  ? `Có ${unreadAlertsCount} kỳ báo cáo quá hạn hoặc đến hạn cần xử lý!`
                  : 'Hệ thống QLVB Mobile: Đang theo dõi tiến độ báo cáo'
              );
            }}
            className="relative min-w-[38px] min-h-[38px] p-2 rounded-lg bg-blue-800/70 hover:bg-blue-700/80 text-blue-100 transition active:scale-95 flex items-center justify-center"
            aria-label="Thông báo hạn báo cáo"
            title="Mở danh sách cảnh báo hạn báo cáo"
          >
            <Bell className="w-4 h-4" />
            {unreadAlertsCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[10px] font-black tabular-nums rounded-full flex items-center justify-center shadow-sm">
                {unreadAlertsCount > 99 ? '99+' : unreadAlertsCount}
              </span>
            )}
          </button>
        </div>
      </div>
    </header>
  );
};
