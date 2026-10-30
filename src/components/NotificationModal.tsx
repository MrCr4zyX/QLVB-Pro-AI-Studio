import React, { useState, useEffect } from 'react';
import { X, Bell, ArrowRight, ShieldCheck, Volume2 } from 'lucide-react';
import { EnrichedReport } from '../types';
import { playAlertChime } from '../utils/soundUtils';
import { sendSystemPushNotification } from '../hooks/useNotifications';

interface NotificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  alertReports: EnrichedReport[];
  permission: NotificationPermission;
  onRequestPermission: () => Promise<boolean>;
  onGoToDashboard: () => void;
  onOpenReportResult: (reportId: string) => void;
}

export const NotificationModal: React.FC<NotificationModalProps> = ({
  isOpen,
  onClose,
  alertReports,
  permission,
  onRequestPermission,
  onGoToDashboard,
  onOpenReportResult,
}) => {
  const [hasRung, setHasRung] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && alertReports.length > 0) {
      playAlertChime();
    }
  }, [isOpen, alertReports.length]);

  const handleRingAndPushNotification = async () => {
    setPushError(null);
    playAlertChime();

    if (permission !== 'granted') {
      const granted = await onRequestPermission();
      if (granted) {
        setHasRung(true);
        setTimeout(() => setHasRung(false), 2500);
      } else {
        setPushError('Chưa cấp quyền thông báo trên điện thoại. Vui lòng bật quyền Thông báo trong Cài đặt ứng dụng.');
      }
      return;
    }

    const ok = await sendSystemPushNotification(
      '🔔 Cảnh báo hạn báo cáo K02',
      alertReports.length > 0
        ? `Có ${alertReports.length} kỳ báo cáo quá hạn hoặc đến hạn cần xử lý!`
        : 'Hệ thống K02 Mobile hoạt động bình thường, tất cả báo cáo đúng tiến độ.'
    );

    if (ok) {
      setHasRung(true);
      setTimeout(() => setHasRung(false), 2500);
    } else {
      setPushError('Không thể hiển thị trên thanh trạng thái. Hãy kiểm tra quyền Thông báo của ứng dụng.');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/65 backdrop-blur-xs">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header matching PC alert style */}
        <div className="bg-gradient-to-r from-red-600 to-rose-700 px-4 py-3.5 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-amber-300 animate-bounce" />
            <div>
              <h3 className="font-black text-sm tracking-tight">
                🔔 {alertReports.length} KỲ BÁO CÁO CẦN CHÚ Ý !!
              </h3>
              <p className="text-[11px] text-red-100 font-medium">
                Các kỳ quá hạn và sắp đến hạn trong 30 ngày
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-red-200 hover:text-white hover:bg-white/10"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Permission Banner if not yet granted */}
        {permission !== 'granted' ? (
          <div className="bg-amber-50 px-3.5 py-2.5 border-b border-amber-200 flex items-center justify-between gap-2 text-xs text-amber-900">
            <span className="text-[11px] font-medium">
              Bật hiển thị thông báo trên thanh trạng thái (Status Bar) điện thoại?
            </span>
            <button
              onClick={onRequestPermission}
              className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-[10px] shrink-0 active:scale-95 transition"
            >
              Bật thông báo
            </button>
          </div>
        ) : (
          <div className="bg-emerald-50/80 px-3.5 py-1.5 border-b border-emerald-200 flex items-center justify-between text-[11px] text-emerald-800 font-medium">
            <span>✓ Đã bật thông báo (Báo cáo 09:00, 14:00 • Sao lưu 10:00, 15:00 Thứ 2)</span>
          </div>
        )}

        {pushError && (
          <div className="bg-red-50 px-3.5 py-2 border-b border-red-200 text-[11px] text-red-700 font-medium">
            ⚠️ {pushError}
          </div>
        )}

        {/* Alerts List */}
        <div className="p-3.5 space-y-2 overflow-y-auto flex-1">
          {alertReports.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-xs">
              <ShieldCheck className="w-10 h-10 mx-auto text-emerald-500 mb-2" />
              <p className="font-semibold text-slate-700">Không có kỳ báo cáo nào quá hạn hoặc cần nhắc nhở.</p>
              <p className="text-[11px] text-slate-400 mt-0.5">Tất cả công việc đều đang đúng tiến độ.</p>
            </div>
          ) : (
            alertReports.map((report) => {
              const isOverdue = report.tag === 'overdue';
              const isUrgent = report.tag === 'urgent';

              return (
                <div
                  key={report.id}
                  onClick={() => {
                    onOpenReportResult(report.id);
                    onClose();
                  }}
                  className={`p-3 rounded-xl border transition cursor-pointer active:scale-98 ${
                    isOverdue
                      ? 'bg-red-50/90 border-red-200 hover:bg-red-100/70'
                      : isUrgent
                      ? 'bg-amber-50/90 border-amber-200 hover:bg-amber-100/70'
                      : 'bg-yellow-50/80 border-yellow-200 hover:bg-yellow-100/70'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900 font-mono">
                      {report.number}/{report.symbol}
                    </span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                        isOverdue
                          ? 'bg-red-600 text-white'
                          : isUrgent
                          ? 'bg-amber-500 text-white'
                          : 'bg-yellow-200 text-yellow-900'
                      }`}
                    >
                      {report.countLabel}
                    </span>
                  </div>

                  <div className="text-[11px] font-semibold text-slate-600 mt-0.5">
                    {report.kind} • Hạn: <span className="font-bold">{report.displayDue}</span>
                  </div>

                  <div className="text-xs text-slate-800 line-clamp-1 mt-1 font-medium">
                    {report.summary}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                onGoToDashboard();
                onClose();
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs active:scale-95 transition"
            >
              <span>Tổng quan</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={handleRingAndPushNotification}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold text-xs transition active:scale-95 shadow-xs ${
                hasRung
                  ? 'bg-emerald-600 text-white'
                  : 'bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300'
              }`}
              title="Bấm chuông để phát âm thanh và đẩy thử thông báo lên thanh trạng thái điện thoại"
            >
              <Volume2 className={`w-3.5 h-3.5 ${hasRung ? 'text-white' : 'text-amber-700'}`} />
              <span>{hasRung ? 'Đã đẩy chuông! ✓' : 'Chuông 🔔'}</span>
            </button>
          </div>

          <button
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-xl bg-white border border-slate-300 text-slate-700 font-semibold text-xs hover:bg-slate-100"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
