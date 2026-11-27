import React from 'react';
import { Camera, Sparkles, CheckCircle2, AlertTriangle, X } from 'lucide-react';
import type { ScanMode, ScanEngine } from '../../utils/documentScanner';

interface DocumentScanFeedbackProps {
  scanLoading: boolean;
  scanMode: ScanMode;
  scanStatusText: string;
  scanPreviewUrl: string | null;
  scanSuccessMsg: string | null;
  scanEngineUsed: ScanEngine | null;
  scanFallbackNotice: string | null;
  scanError: string | null;
  onCancelScan: () => void;
  onDismissSuccess: () => void;
  onDismissError: () => void;
}

export const DocumentScanFeedback: React.FC<DocumentScanFeedbackProps> = ({
  scanLoading,
  scanMode,
  scanStatusText,
  scanPreviewUrl,
  scanSuccessMsg,
  scanEngineUsed,
  scanFallbackNotice,
  scanError,
  onCancelScan,
  onDismissSuccess,
  onDismissError,
}) => {
  return (
    <>
      {scanLoading && (
        <div className="px-4 py-2.5 bg-indigo-50 border-b border-indigo-200 flex items-center gap-3 shrink-0">
          <div className="relative w-10 h-12 rounded-lg overflow-hidden bg-slate-900 border border-indigo-300 shrink-0 shadow-xs">
            {scanPreviewUrl ? (
              <img src={scanPreviewUrl} alt="Ảnh đang quét" className="w-full h-full object-cover opacity-85" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Camera className="w-4 h-4 text-indigo-300" />
              </div>
            )}
            <div className="animate-scan-laser absolute left-0 right-0 h-0.5 bg-amber-400 shadow-[0_0_8px_#fbbf24]" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-900">
              <Sparkles className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              <span>{scanMode === 'offline' ? 'Đang quét OCR trên máy...' : 'Đang nhận diện văn bản...'}</span>
            </div>
            <p className="text-[11px] text-indigo-700/90 truncate">
              {scanStatusText}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancelScan}
            className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-white border border-indigo-200 text-indigo-700 hover:bg-indigo-100 shrink-0"
          >
            Hủy
          </button>
        </div>
      )}

      {!scanLoading && scanSuccessMsg && (
        <div
          className={`px-4 py-2 border-b flex items-start gap-2 shrink-0 ${
            scanEngineUsed === 'offline'
              ? 'bg-amber-50 border-amber-200 text-amber-900'
              : 'bg-emerald-50 border-emerald-200 text-emerald-800'
          }`}
        >
          <CheckCircle2
            className={`w-4 h-4 shrink-0 mt-0.5 ${
              scanEngineUsed === 'offline' ? 'text-amber-600' : 'text-emerald-600'
            }`}
          />
          <div className="flex-1 min-w-0 space-y-0.5">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span
                className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${
                  scanEngineUsed === 'offline'
                    ? 'bg-amber-200/80 text-amber-900'
                    : 'bg-emerald-200/80 text-emerald-900'
                }`}
              >
                {scanEngineUsed === 'offline' ? 'OCR trên máy' : 'AI trực tuyến'}
              </span>
              <span className="text-[11px] font-medium leading-snug">{scanSuccessMsg}</span>
            </div>
            {scanFallbackNotice && (
              <p className="text-[10px] opacity-80 leading-snug">{scanFallbackNotice}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onDismissSuccess}
            className={`p-0.5 rounded ${
              scanEngineUsed === 'offline'
                ? 'hover:bg-amber-100 text-amber-700'
                : 'hover:bg-emerald-100 text-emerald-600'
            }`}
            aria-label="Đóng thông báo"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {!scanLoading && scanError && (
        <div className="px-4 py-2 bg-rose-50 border-b border-rose-200 flex items-center gap-2 text-rose-800 shrink-0">
          <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
          <span className="text-[11px] font-medium flex-1 leading-snug">{scanError}</span>
          <button
            type="button"
            onClick={onDismissError}
            className="p-0.5 rounded hover:bg-rose-100 text-rose-600"
            aria-label="Đóng cảnh báo"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </>
  );
};
