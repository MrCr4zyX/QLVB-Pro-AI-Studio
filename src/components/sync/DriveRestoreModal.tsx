import React from 'react';
import { AlertTriangle, RefreshCw, Check } from 'lucide-react';
import type { DriveBackupFile } from '../../services/googleDriveService';

interface DriveRestoreModalProps {
  file: DriveBackupFile | null;
  overwrite: boolean;
  isRestoring: boolean;
  onOverwriteChange: (value: boolean) => void;
  onClose: () => void;
  onConfirm: () => void;
  formatDateTime: (dateStr: string) => string;
  formatFileSize: (bytesStr?: string) => string;
}

export const DriveRestoreModal: React.FC<DriveRestoreModalProps> = ({
  file,
  overwrite,
  isRestoring,
  onOverwriteChange,
  onClose,
  onConfirm,
  formatDateTime,
  formatFileSize,
}) => {
  if (!file) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
      <div className="bg-white rounded-3xl p-5 max-w-md w-full shadow-2xl border border-slate-200 space-y-4">
        <div className="flex items-center gap-3 text-amber-600">
          <div className="w-10 h-10 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-800">Xác nhận khôi phục dữ liệu</h3>
            <p className="text-[11px] text-slate-500">Khôi phục cơ sở dữ liệu từ Google Drive</p>
          </div>
        </div>

        <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 text-xs space-y-1">
          <div className="font-bold text-slate-800 truncate">
            Tệp: {file.name}
          </div>
          <div className="text-slate-500 text-[11px]">
            Thời gian sao lưu: {formatDateTime(file.createdTime)} {file.size && `(${formatFileSize(file.size)})`}
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-semibold text-slate-700 block">
            Phương thức khôi phục:
          </label>
          <div className="space-y-2">
            <label className="flex items-start gap-2.5 p-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 cursor-pointer">
              <input
                type="radio"
                name="restoreMode"
                checked={!overwrite}
                onChange={() => onOverwriteChange(false)}
                className="mt-0.5 text-blue-600 focus:ring-blue-500"
              />
              <div className="text-xs">
                <span className="font-bold text-slate-800 block">Nhập gộp & Cập nhật (Khuyên dùng)</span>
                <span className="text-[11px] text-slate-500 leading-tight block">
                  Giữ lại các văn bản mới trên máy chưa có trong bản sao lưu, cập nhật các văn bản trùng khớp.
                </span>
              </div>
            </label>

            <label className="flex items-start gap-2.5 p-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 cursor-pointer">
              <input
                type="radio"
                name="restoreMode"
                checked={overwrite}
                onChange={() => onOverwriteChange(true)}
                className="mt-0.5 text-rose-600 focus:ring-rose-500"
              />
              <div className="text-xs">
                <span className="font-bold text-rose-800 block">Ghi đè toàn bộ dữ liệu</span>
                <span className="text-[11px] text-slate-500 leading-tight block">
                  Thay thế hoàn toàn dữ liệu hiện tại trên ứng dụng bằng nội dung của bản sao lưu này.
                </span>
              </div>
            </label>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
          <button
            onClick={onClose}
            disabled={isRestoring}
            className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition"
          >
            Hủy bỏ
          </button>
          <button
            onClick={onConfirm}
            disabled={isRestoring}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs transition active:scale-95 disabled:opacity-50"
          >
            {isRestoring ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Đang nạp dữ liệu...</span>
              </>
            ) : (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>Đồng ý khôi phục</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
