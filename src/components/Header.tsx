import React, { useState } from 'react';
import { Bell, Download, RefreshCw, ShieldAlert, Smartphone } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { sendSystemPushNotification } from '../hooks/useNotifications';
import appLogo from '../assets/app-logo.png';

interface HeaderProps {
  unreadAlertsCount: number;
  onOpenNotifications: () => void;
  onOpenSync: () => void;
  onOpenInstallGuide: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  unreadAlertsCount,
  onOpenNotifications,
  onOpenSync,
  onOpenInstallGuide,
}) => {
  const [imgError, setImgError] = useState(false);

  return (
    <header
      className="sticky top-0 z-30 bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white shadow-md border-b border-blue-800/60 shrink-0"
      style={{ paddingTop: 'max(0px, env(safe-area-inset-top, 0px))' }}
    >
      {/* Android-like Top Bar */}
      <div className="max-w-7xl mx-auto px-3.5 py-2 flex items-center justify-between">
        {/* Brand logo & title */}
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl overflow-hidden shadow-md shrink-0 border border-amber-400/50 bg-blue-950 flex items-center justify-center">
            {!imgError ? (
              <img
                src={appLogo}
                alt="K02 Mobile QLVB"
                className="w-full h-full object-cover"
                onError={() => setImgError(true)}
              />
            ) : (
              <span className="text-amber-400 font-black text-xs tracking-wider">K02</span>
            )}
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h1 className="text-sm sm:text-base font-bold text-white tracking-tight leading-none">
                K02 Mobile QLVB
              </h1>
              <span className="text-[9px] px-1 py-0.5 rounded font-bold bg-red-600/90 text-white tracking-wider">
              PRO
              </span>
            </div>
            <p className="text-[10px] text-blue-200/80 font-medium leading-tight mt-1">
              QUẢN LÝ VĂN BẢN & BÁO CÁO
            </p>
          </div>
        </div>

        {/* Action icons */}
        <div className="flex items-center gap-1.5">
          {/* Sync Excel shortcut button */}
          <button
            onClick={onOpenSync}
            className="flex items-center gap-1 text-xs font-medium bg-blue-800/70 hover:bg-blue-700/80 text-blue-100 px-2.5 py-1.5 rounded-lg border border-blue-700/50 transition active:scale-95"
            title="Đồng bộ file Excel với máy tính (PC)"
          >
            <RefreshCw className="w-3.5 h-3.5 text-blue-300" />
            <span className="hidden md:inline">Đồng bộ PC</span>
          </button>

          {/* Notification Bell with Badge */}
          <button
            onClick={() => {
              onOpenNotifications();
              sendSystemPushNotification(
                '🔔 Cảnh báo hạn báo cáo K02',
                unreadAlertsCount > 0
                  ? `Có ${unreadAlertsCount} kỳ báo cáo quá hạn hoặc đến hạn cần xử lý!`
                  : 'Hệ thống K02 Mobile: Đang theo dõi tiến độ báo cáo'
              );
            }}
            className="relative p-2 rounded-lg bg-blue-800/70 hover:bg-blue-700/80 text-blue-100 transition active:scale-95"
            aria-label="Thông báo hạn báo cáo"
            title="Mở danh sách cảnh báo & thử đẩy thông báo"
          >
            <Bell className="w-4 h-4" />
            {unreadAlertsCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[10px] font-black rounded-full flex items-center justify-center animate-pulse shadow-sm">
                {unreadAlertsCount > 99 ? '99+' : unreadAlertsCount}
              </span>
            )}
          </button>
        </div>
      </div>
    </header>
  );
};
