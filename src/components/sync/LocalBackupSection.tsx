import React from 'react';
import {
  Upload,
  Download,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Database,
  FileDown,
  FileUp,
  RotateCcw,
} from 'lucide-react';

interface ImportStatusState {
  type: 'success' | 'error' | 'info' | null;
  message: string;
}

interface LocalBackupSectionProps {
  documentsCount: number;
  reportsCount: number;
  overwriteMode: boolean;
  isProcessing: boolean;
  qlvbFolderReady: boolean;
  importStatus: ImportStatusState;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  jsonInputRef: React.RefObject<HTMLInputElement | null>;
  onOverwriteModeChange: (value: boolean) => void;
  onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onExportExcel: () => void;
  onPickPcQlvbFolder: () => void;
  onExportJSON: () => void;
  onJSONUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onResetSampleData: () => void;
}

export const LocalBackupSection: React.FC<LocalBackupSectionProps> = ({
  documentsCount,
  reportsCount,
  overwriteMode,
  isProcessing,
  qlvbFolderReady,
  importStatus,
  fileInputRef,
  jsonInputRef,
  onOverwriteModeChange,
  onFileUpload,
  onExportExcel,
  onPickPcQlvbFolder,
  onExportJSON,
  onJSONUpload,
  onResetSampleData,
}) => {
  const showPcDirectoryButton =
    typeof window !== 'undefined' &&
    !Boolean((window as any).AndroidBridge) &&
    typeof (window as any).showDirectoryPicker === 'function' &&
    window.self === window.top;

  return (
    <>
      {/* Manual 2-Step Excel File Box */}
      <div className="bg-white rounded-3xl p-4 border border-slate-200/80 shadow-xs space-y-4">
        {/* Step 1: Import */}
        <div className="space-y-2.5">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-800 uppercase tracking-tight">
            <div className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px] shrink-0">
              1
            </div>
            <span>Nhập file khôi phục từ máy tính PC hoặc tệp nội bộ</span>
          </div>

          <div className="space-y-2.5">
            <label className="flex items-start gap-2 text-xs font-medium text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={overwriteMode}
                onChange={(e) => onOverwriteModeChange(e.target.checked)}
                className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4 mt-0.5 shrink-0"
              />
              <span className="leading-snug">
                Ghi đè toàn bộ dữ liệu (nếu không chọn, hệ thống sẽ nhập gộp và cập nhật)
              </span>
            </label>

            <input
              type="file"
              ref={fileInputRef}
              accept=".xlsx, .xls"
              onChange={onFileUpload}
              className="hidden"
            />

            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isProcessing}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs active:scale-95 transition disabled:opacity-50"
            >
              <Upload className="w-4 h-4 shrink-0" />
              <span>{isProcessing ? 'Đang đọc dữ liệu...' : 'Chọn file Excel từ thiết bị (.xlsx)'}</span>
            </button>
          </div>
        </div>

        <hr className="border-slate-100" />

        {/* Step 2: Export */}
        <div className="space-y-2.5">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-800 uppercase tracking-tight">
            <div className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px] shrink-0">
              2
            </div>
            <span>Xuất file Excel cho máy tính PC</span>
          </div>

          <div className="space-y-2.5">
            <p className="text-xs text-slate-500 leading-relaxed break-words">
              Xuất toàn bộ {documentsCount} văn bản và {reportsCount} kỳ báo cáo ra file Excel 9 sheet chuẩn (tự động gắn tiền tố thời gian{' '}
              <code>YYYYMMDD_HHmmss_documents.xlsx</code>) để lưu trữ hoặc nhập vào phần mềm PC.
            </p>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={onExportExcel}
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs active:scale-95 transition"
              >
                <Download className="w-4 h-4 shrink-0" />
                <span>Sao lưu file Excel (.xlsx)</span>
              </button>

              {showPcDirectoryButton && (
                <button
                  type="button"
                  onClick={onPickPcQlvbFolder}
                  className={`w-full sm:w-auto flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl border text-xs font-bold transition active:scale-95 ${
                    qlvbFolderReady
                      ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-300'
                      : 'bg-amber-50 hover:bg-amber-100 text-amber-900 border-amber-400 animate-pulse'
                  }`}
                >
                  <span>
                    {qlvbFolderReady
                      ? '📁 Đã có thư mục QLVB_PRO (Đổi)'
                      : '⚠️ Thiếu thư mục QLVB_PRO (Bấm tạo trước khi sao lưu)'}
                  </span>
                </button>
              )}
            </div>

            {importStatus.type && (
              <div
                className={`p-2.5 rounded-xl border text-xs flex items-start gap-2 animate-fadeIn overflow-hidden ${
                  importStatus.type === 'success'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : 'bg-rose-50 border-rose-200 text-rose-800'
                }`}
              >
                {importStatus.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                )}
                <span className="flex-1 min-w-0 font-semibold text-[11px] leading-snug break-words break-all [overflow-wrap:anywhere] whitespace-pre-line">
                  {importStatus.message}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Backup & Sample Data Card */}
      <div className="bg-white rounded-3xl p-4 border border-slate-200/80 shadow-xs space-y-3">
        <h3 className="text-xs font-bold text-slate-800 flex items-center gap-1.5 uppercase">
          <Database className="w-4 h-4 text-indigo-600" />
          <span>Sao lưu dự phòng & Khôi phục</span>
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {/* JSON Export */}
          <button
            onClick={onExportJSON}
            className="p-3 rounded-2xl bg-slate-50 border border-slate-200 hover:bg-slate-100 text-left space-y-1 transition active:scale-98"
          >
            <div className="flex items-center gap-1.5 font-bold text-slate-800 text-xs">
              <FileDown className="w-4 h-4 text-blue-600" />
              <span>Sao lưu toàn bộ</span>
            </div>
            <div className="text-[11px] text-slate-500">
              Tải file sao lưu .json về máy
            </div>
          </button>

          {/* JSON Import */}
          <input
            type="file"
            ref={jsonInputRef}
            accept=".json"
            onChange={onJSONUpload}
            className="hidden"
          />
          <button
            onClick={() => jsonInputRef.current?.click()}
            className="p-3 rounded-2xl bg-slate-50 border border-slate-200 hover:bg-slate-100 text-left space-y-1 transition active:scale-98"
          >
            <div className="flex items-center gap-1.5 font-bold text-slate-800 text-xs">
              <FileUp className="w-4 h-4 text-emerald-600" />
              <span>Khôi phục dữ liệu</span>
            </div>
            <div className="text-[11px] text-slate-500">
              Nạp lại từ file sao lưu .json
            </div>
          </button>

          {/* Reset to sample */}
          <button
            onClick={onResetSampleData}
            className="p-3 rounded-2xl bg-slate-50 border border-slate-200 hover:bg-slate-100 text-left space-y-1 transition active:scale-98"
          >
            <div className="flex items-center gap-1.5 font-bold text-slate-800 text-xs">
              <RotateCcw className="w-4 h-4 text-amber-600" />
              <span>Nạp dữ liệu mẫu</span>
            </div>
            <div className="text-[11px] text-slate-500">
              Mẫu TEST văn bản hành chính
            </div>
          </button>
        </div>

        {importStatus.type && (
          <div
            className={`p-2.5 rounded-xl border text-xs flex items-start gap-2 animate-fadeIn overflow-hidden ${
              importStatus.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-rose-50 border-rose-200 text-rose-800'
            }`}
          >
            {importStatus.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            )}
            <span className="flex-1 min-w-0 font-semibold text-[11px] leading-snug break-words break-all [overflow-wrap:anywhere] whitespace-pre-line">
              {importStatus.message}
            </span>
          </div>
        )}
      </div>

      {/* Guide Card */}
      <div className="bg-blue-50/70 rounded-3xl p-4 border border-blue-200 text-xs text-blue-900 space-y-1.5 leading-relaxed">
        <div className="flex items-center gap-1.5 font-bold">
          <HelpCircle className="w-4 h-4 text-blue-600" />
          <span>Hướng dẫn đồng bộ dữ liệu giữa Google Drive, PC và QLVB Mobile:</span>
        </div>
        <ul className="list-disc list-inside space-y-1 text-[11px] text-blue-800/90 pl-1">
          <li>
            <strong>Đồng bộ Google Drive:</strong> Khi bấm <em>"Sao lưu ngay lên Google Drive"</em>, hệ thống tự động tìm hoặc tạo thư mục{' '}
            <code>Backup_QLVB_Pro</code> trên Google Drive và lưu trữ file Excel với tên định dạng{' '}
            <code>YYYYMMDD_HHmmss_documents.xlsx</code>.
          </li>
          <li>
            <strong>Khôi phục từ Drive:</strong> Bạn có thể xem nhanh danh sách 5 bản sao lưu gần nhất, bấm{' '}
            <strong>"Khôi phục"</strong> và chọn Ghi đè hoặc Nhập gộp để đồng bộ dữ liệu ngược về điện thoại.
          </li>
          <li>
            <strong>Từ PC sang Android:</strong> Trên máy tính PC mở <em>Cài đặt ▾ &gt; Sao lưu Excel khôi phục...</em>. Gửi file đó sang điện thoại và chọn nhập ở{' '}
            <strong>Bước 1</strong>.
          </li>
          <li>
            <strong>Từ Android sang PC:</strong> Bấm <strong>Bước 2</strong> để tải file Excel, sau đó chuyển file vào máy tính PC và chọn{' '}
            <em>Cài đặt ▾ &gt; Nhập Excel khôi phục...</em>.
          </li>
        </ul>
      </div>
    </>
  );
};
