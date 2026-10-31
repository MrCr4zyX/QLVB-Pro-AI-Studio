import React, { useEffect, useState } from 'react';
import { AlertTriangle, X, Volume2, ArrowRight, ChevronRight, DatabaseBackup } from 'lucide-react';
import { playAlertChime } from '../utils/soundUtils';
import { sendSystemPushNotification } from '../hooks/useNotifications';
import appLogo from '../assets/app-logo.png';

interface FloatingNotificationProps {
  overdueCount: number;
  urgentCount: number;
  isBackupReminderDue: boolean;
  weeklyBackupCycleKey: string;
  onDismissBackupReminder?: () => void;
  onOpenDetails: () => void;
  onBackupNow: () => void;
}

export const FloatingNotification: React.FC<FloatingNotificationProps> = ({
  overdueCount,
  urgentCount,
  isBackupReminderDue,
  weeklyBackupCycleKey,
  onDismissBackupReminder,
  onOpenDetails,
  onBackupNow,
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [dismissedCycleKey, setDismissedCycleKey] = useState<string | null>(null);
  const [hasInteractedWithReports, setHasInteractedWithReports] = useState(false);

  const totalUrgent = overdueCount + urgentCount;
  const showBackupAlert = isBackupReminderDue && dismissedCycleKey !== weeklyBackupCycleKey;
  const showReportAlert = totalUrgent > 0 && !hasInteractedWithReports;
  const shouldShowBanner = showBackupAlert || showReportAlert;

  useEffect(() => {
    if (shouldShowBanner) {
      const timer = setTimeout(() => {
        setIsVisible(true);
        playAlertChime();
      }, 800);
      return () => clearTimeout(timer);
    } else {
      setIsVisible(false);
    }
  }, [shouldShowBanner, weeklyBackupCycleKey]);

  const handleDismiss = () => {
    setIsVisible(false);
    setHasInteractedWithReports(true);
    if (isBackupReminderDue) {
      setDismissedCycleKey(weeklyBackupCycleKey);
      onDismissBackupReminder?.();
    }
  };

  if (!isVisible || !shouldShowBanner) return null;

  return (
    <div
      className="fixed left-2 right-2 max-w-md mx-auto z-50 animate-bounce-in select-none"
      style={{ top: 'max(0.5rem, env(safe-area-inset-top, 0px))' }}
    >
      <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white rounded-2xl p-3 shadow-2xl border-2 border-amber-400/80 backdrop-blur-md flex flex-col gap-2.5">
        {/* Top row */}
        <div className="flex items-start justify-between gap-2.5">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl overflow-hidden shadow-md shrink-0 border border-amber-400/60 bg-blue-950 flex items-center justify-center relative">
              <img
                src={appLogo}
                alt="K02 Icon"
                className="w-full h-full object-cover"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
              <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-red-600 rounded-full border-2 border-slate-900 animate-ping" />
              <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-red-600 rounded-full border-2 border-slate-900" />
            </div>

            <div className="min-w-0">
              <div className="flex items-center flex-wrap gap-1.5">
                <span className="text-[10px] font-black uppercase px-1.5 py-0.5 rounded bg-red-600 text-white tracking-wider flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  <span>CẢNH BÁO!</span>
                </span>
                <span className="text-[11px] font-bold text-amber-300">
                  {showBackupAlert ? 'QUẢN LÝ VĂN BẢN & BÁO CÁO' : 'Hãy sao lưu dữ liệu định kỳ!'}
                </span>
              </div>

              {showBackupAlert && (
                <p className="text-xs font-extrabold text-amber-200 mt-1 leading-snug flex items-center gap-1">
                  <DatabaseBackup className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span>Hãy sao lưu dữ liệu định kỳ!</span>
                </p>
              )}

              {showReportAlert && (
                <p className="text-[11px] font-semibold text-slate-200 mt-0.5 leading-snug">
                  {overdueCount > 0 ? (
                    <span>
                      Có <strong className="text-red-400 font-black">{overdueCount}</strong> báo cáo quá hạn,{' '}
                      <strong className="text-amber-300 font-bold">{urgentCount}</strong> hạn gấp (≤ 7 ngày)!
                    </span>
                  ) : (
                    <span>
                      Có <strong className="text-amber-300 font-black">{urgentCount}</strong> báo cáo sắp đến hạn gấp (≤ 7 ngày)!
                    </span>
                  )}
                </p>
              )}
            </div>
          </div>

          <button
            onClick={handleDismiss}
            className="p-1.5 rounded-full hover:bg-white/20 text-slate-300 hover:text-white transition shrink-0"
            aria-label="Đóng thông báo nổi"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Action buttons */}
        <div className="flex items-center justify-between gap-2 pt-1 border-t border-white/10">
          <button
            onClick={() => {
              playAlertChime();
              if (showBackupAlert) {
                void sendSystemPushNotification(
                  '⚠️ CẢNH BÁO! Sao lưu dữ liệu K02',
                  'Hãy sao lưu dữ liệu định kỳ! (Nhắc lịch 10:00 & 15:00 Thứ 2 hàng tuần)'
                );
              } else {
                void sendSystemPushNotification(
                  '🔔 Cảnh báo hạn báo cáo K02',
                  overdueCount > 0
                    ? `Có ${overdueCount} báo cáo quá hạn và ${urgentCount} báo cáo sắp đến hạn!`
                    : `Có ${urgentCount} báo cáo sắp đến hạn gấp!`
                );
              }
            }}
            className="flex items-center gap-1 text-[11px] text-amber-300 hover:text-amber-200 py-1 px-2 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 transition font-medium shrink-0"
            title="Phát âm thanh và đẩy thông báo lên thanh trạng thái"
          >
            <Volume2 className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
            <span>Âm báo 🔔</span>
          </button>

          <div className="flex items-center gap-1.5">
            {/* Nút Để sau */}
            <button
              onClick={handleDismiss}
              className="text-[11px] text-slate-300 hover:text-white px-2 py-1 rounded-lg transition"
            >
              Để sau
            </button>

            {/* Nút Sao lưu ngay nằm bên trái nút Xem ngay */}
            <button
              onClick={() => {
                handleDismiss();
                onBackupNow();
              }}
              className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs px-2.5 py-1 rounded-xl shadow-xs transition active:scale-95"
              title="Mở bảng sao lưu & xuất dữ liệu ngay"
            >
              <DatabaseBackup className="w-3.5 h-3.5" />
              <span>Sao lưu</span>
            </button>

            {/* Nút Xem ngay mở chi tiết văn bản/báo cáo */}
            <button
              onClick={() => {
                handleDismiss();
                onOpenDetails();
              }}
              className="flex items-center gap-1 bg-gradient-to-r from-red-600 to-amber-600 hover:from-red-500 hover:to-amber-500 text-white font-bold text-xs px-3 py-1 rounded-xl shadow-xs transition active:scale-95"
            >
              <span>Xem ngay</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
