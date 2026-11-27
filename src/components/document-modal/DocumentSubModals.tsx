import React from 'react';
import { AlertTriangle, Camera, ImagePlus, X } from 'lucide-react';
import type { Document } from '../../types';
import { displayDate } from '../../utils/dateUtils';

interface DuplicateWarningModalProps {
  isOpen: boolean;
  number: string;
  symbol: string;
  duplicateList: Document[];
  onCancel: () => void;
  onConfirm: () => void;
}

export const DuplicateWarningModal: React.FC<DuplicateWarningModalProps> = ({
  isOpen,
  number,
  symbol,
  duplicateList,
  onCancel,
  onConfirm,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/70">
      <div className="bg-white rounded-2xl max-w-md w-full p-4 space-y-3 shadow-2xl border-2 border-amber-500">
        <div className="flex items-center gap-2 text-amber-600 font-bold text-sm">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <span>CẢNH BÁO: TRÙNG SỐ VÀ KÝ HIỆU VĂN BẢN!</span>
        </div>
        <p className="text-xs text-slate-600 leading-relaxed">
          Hệ thống phát hiện văn bản có số <strong>{number}/{symbol}</strong> đã tồn tại trong cơ sở dữ liệu:
        </p>
        <div className="max-h-36 overflow-y-auto space-y-1.5 bg-slate-50 p-2 rounded-xl border border-slate-200 text-xs">
          {duplicateList.map((d) => (
            <div key={d.id} className="p-1.5 bg-white rounded-lg border border-slate-200">
              <div className="font-bold text-slate-800">
                {d.number}/{d.symbol} • Ngày {displayDate(d.issued)}
              </div>
              <div className="text-slate-500 text-[11px]">{d.agency}</div>
              <div className="text-slate-700 text-[11px] truncate">{d.summary}</div>
            </div>
          ))}
        </div>
        <p className="text-xs font-medium text-slate-700">
          Bạn có chắc chắn vẫn muốn lưu văn bản này không?
        </p>
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700"
          >
            Quay lại sửa
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white shadow-xs"
          >
            Vẫn tiếp tục lưu
          </button>
        </div>
      </div>
    </div>
  );
};

interface WebcamCaptureModalProps {
  isOpen: boolean;
  webcamError: string | null;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  onClose: () => void;
  onCapture: () => void;
  onPickFromGallery: () => void;
}

export const WebcamCaptureModal: React.FC<WebcamCaptureModalProps> = ({
  isOpen,
  webcamError,
  videoRef,
  onClose,
  onCapture,
  onPickFromGallery,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
      <div className="bg-slate-900 text-white rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl border border-slate-700">
        <div className="px-4 py-3 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Camera className="w-4 h-4 text-amber-400" />
            <span className="font-bold text-sm">Chụp ảnh văn bản để quét AI</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          {webcamError ? (
            <div className="py-8 px-4 text-center space-y-3 bg-slate-800/70 rounded-xl border border-slate-700">
              <AlertTriangle className="w-8 h-8 text-amber-400 mx-auto" />
              <p className="text-xs text-slate-200 leading-relaxed">{webcamError}</p>
              <button
                type="button"
                onClick={onPickFromGallery}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white"
              >
                <ImagePlus className="w-4 h-4" />
                <span>Chọn ảnh có sẵn từ máy</span>
              </button>
            </div>
          ) : (
            <>
              <div className="relative rounded-xl overflow-hidden bg-black aspect-[4/3] border border-slate-700">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
                {/* Framing corner guides */}
                <div className="pointer-events-none absolute inset-4 border border-white/25 rounded-lg">
                  <span className="absolute -top-0.5 -left-0.5 w-5 h-5 border-t-2 border-l-2 border-amber-400 rounded-tl-md" />
                  <span className="absolute -top-0.5 -right-0.5 w-5 h-5 border-t-2 border-r-2 border-amber-400 rounded-tr-md" />
                  <span className="absolute -bottom-0.5 -left-0.5 w-5 h-5 border-b-2 border-l-2 border-amber-400 rounded-bl-md" />
                  <span className="absolute -bottom-0.5 -right-0.5 w-5 h-5 border-b-2 border-r-2 border-amber-400 rounded-br-md" />
                </div>
              </div>
              <p className="text-[11px] text-slate-400 text-center">
                Đưa phần đầu văn bản (Số/ký hiệu, Ngày ban hành, Cơ quan ký, Trích yếu) vào khung sáng rõ rồi bấm Chụp.
              </p>
              <div className="flex items-center justify-between gap-2 pt-1">
                <button
                  type="button"
                  onClick={onPickFromGallery}
                  className="px-3 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 inline-flex items-center gap-1.5"
                >
                  <ImagePlus className="w-3.5 h-3.5" />
                  <span>Chọn ảnh</span>
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300"
                  >
                    Đóng
                  </button>
                  <button
                    type="button"
                    onClick={onCapture}
                    className="px-5 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-lg inline-flex items-center gap-1.5 active:scale-95"
                  >
                    <Camera className="w-4 h-4" />
                    <span>Chụp &amp; Quét</span>
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
