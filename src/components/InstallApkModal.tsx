import React, { useState } from 'react';
import {
  Smartphone,
  Download,
  CheckCircle2,
  Copy,
  ExternalLink,
  X,
  ShieldCheck,
  Sparkles,
  FileDown,
  Info,
  QrCode,
  AlertTriangle,
  Cloud
} from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import appLogo from '../assets/app-logo.png';
import { googleSignIn, uploadApkToDrive } from '../services/googleDriveService';

interface InstallApkModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const InstallApkModal: React.FC<InstallApkModalProps> = ({ isOpen, onClose }) => {
  const { isInstallable, isInstalled, install } = usePWAInstall();
  const [copied, setCopied] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadMsg, setDownloadMsg] = useState('');
  const [showQr, setShowQr] = useState(false);

  const [driveLink, setDriveLink] = useState<string>(() => {
    return typeof window !== 'undefined' ? localStorage.getItem('k02_drive_apk_link') || '' : '';
  });
  const [isUploadingDrive, setIsUploadingDrive] = useState(false);
  const [driveStatusMsg, setDriveStatusMsg] = useState('');

  if (!isOpen) return null;

  const handleUploadToMyDrive = async () => {
    setIsUploadingDrive(true);
    setDriveStatusMsg('Đang chuẩn bị tải lên Google Drive...');
    try {
      const res = await uploadApkToDrive((msg) => setDriveStatusMsg(msg));
      setDriveLink(res.webViewLink);
      localStorage.setItem('k02_drive_apk_link', res.webViewLink);
      navigator.clipboard.writeText(res.webViewLink);
      setDriveStatusMsg('✓ Đã tải lên Google Drive & sao chép link thành công!');
    } catch (err: any) {
      if (err.message?.includes('Chưa đăng nhập')) {
        try {
          setDriveStatusMsg('Đang mở cửa sổ đăng nhập Google...');
          await googleSignIn();
          const res = await uploadApkToDrive((msg) => setDriveStatusMsg(msg));
          setDriveLink(res.webViewLink);
          localStorage.setItem('k02_drive_apk_link', res.webViewLink);
          navigator.clipboard.writeText(res.webViewLink);
          setDriveStatusMsg('✓ Đã tải lên Google Drive & sao chép link thành công!');
        } catch (signInErr: any) {
          setDriveStatusMsg(`Lỗi: ${signInErr.message || 'Không thể đăng nhập Google'}`);
        }
      } else {
        setDriveStatusMsg(`Lỗi: ${err.message}`);
      }
    } finally {
      setIsUploadingDrive(false);
    }
  };

  const handleInstallClick = async () => {
    setInstalling(true);
    try {
      await install();
    } finally {
      setInstalling(false);
    }
  };

  const handleCopyApkLink = () => {
    const linkToCopy = driveLink || window.location.href;
    navigator.clipboard.writeText(linkToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleDownloadInAppBlob = async () => {
    setIsDownloading(true);
    setDownloadMsg('Đang tạo liên kết tải tệp APK...');
    try {
      let res = await fetch('./k02_mobile_qlvb_19.8.apk');
      if (!res.ok) res = await fetch('./k02_mobile_qlvb_19.7.apk');
      if (!res.ok) res = await fetch('./k02_mobile_qlvb.apk');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'k02_mobile_qlvb_19.8.apk';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      }, 2000);
      setDownloadMsg(`Đã tải xuống thành công (${(blob.size / (1024 * 1024)).toFixed(1)} MB)!`);
    } catch (err: any) {
      if (driveLink) {
        window.open(driveLink, '_blank');
      } else {
        alert('Lỗi khi tải tệp. Vui lòng mở tab "Đồng bộ" để kết nối Google Drive và tải lên Drive.');
      }
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/60 backdrop-blur-xs animate-fadeIn">
      <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white p-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl overflow-hidden shadow-md shrink-0 border border-amber-400/50 bg-blue-950 flex items-center justify-center">
              <img
                src={appLogo}
                alt="K02 Icon"
                className="w-full h-full object-cover"
              />
            </div>
            <div>
              <h3 className="text-sm font-bold tracking-tight text-white flex items-center gap-1.5">
                <span>Cài Đặt Ứng Dụng Android (APK v19.8)</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded font-bold bg-amber-500 text-slate-950">
                  v19.8
                </span>
              </h3>
              <p className="text-[11px] text-blue-200/80">
                Phiên bản 19.8 • Tự động lưu vào Download/QLVB_PRO & đồng bộ Google Drive
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 overflow-y-auto space-y-4 text-xs text-slate-700">
          {/* Direct APK Download Card */}
          <div className="p-4 rounded-2xl bg-gradient-to-br from-emerald-50 to-teal-50 border-2 border-emerald-300 text-slate-800 space-y-3 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="font-bold flex items-center gap-1.5 text-emerald-900 text-xs">
                <FileDown className="w-4 h-4 text-emerald-700" />
                <span>TỆP TIN CÀI ĐẶT APK v19.8 (CHUẨN CHỮ KÝ ANDROID)</span>
              </span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-600 text-white uppercase tracking-wider">
                Đã sẵn sàng
              </span>
            </div>

            <p className="text-[11px] text-emerald-950/85 leading-relaxed">
              Tệp <code>k02_mobile_qlvb_19.8.apk</code> (Phiên bản v19.8) hỗ trợ tự động tạo và lưu tệp Excel/JSON vào thư mục <code>Download/QLVB_PRO</code>, nhắc lịch sao lưu định kỳ và ký chuẩn chứng thực Android (V1 + V2 + V3).
            </p>

            {/* Primary Download: In-App Direct Download */}
            <button
              onClick={handleDownloadInAppBlob}
              disabled={isDownloading}
              className="flex items-center justify-center gap-2 w-full py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-600 via-teal-600 to-green-600 hover:from-emerald-700 hover:to-green-700 text-white font-bold text-xs shadow-md active:scale-98 transition text-center cursor-pointer disabled:opacity-50"
            >
              <Download className="w-4 h-4 shrink-0" />
              <span>{isDownloading ? 'Đang chuẩn bị tệp...' : 'TẢI FILE k02_mobile_qlvb_19.8.apk (2.8 MB)'}</span>
            </button>

            {downloadMsg && (
              <div className="text-[11px] text-emerald-850 font-bold text-center bg-emerald-100/70 p-1.5 rounded-lg">
                ✓ {downloadMsg}
              </div>
            )}

            {/* Google Drive 1-Click Upload and Link generation */}
            <div className="p-3 bg-white/95 rounded-xl border border-blue-200 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-blue-900 flex items-center gap-1.5">
                  <Cloud className="w-3.5 h-3.5 text-blue-600" />
                  <span>LƯU TRỮ VĨNH VIỄN TRÊN GOOGLE DRIVE:</span>
                </span>
                <span className="text-[10px] font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                  Khuyên dùng
                </span>
              </div>

              <button
                onClick={handleUploadToMyDrive}
                disabled={isUploadingDrive}
                className="w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold text-xs shadow-xs transition flex items-center justify-center gap-2 active:scale-98 disabled:opacity-50 cursor-pointer"
              >
                <Cloud className="w-4 h-4" />
                <span>{isUploadingDrive ? 'Đang xử lý...' : 'Tải file APK lên Google Drive của tôi & Lấy Link'}</span>
              </button>

              {driveStatusMsg && (
                <div className="text-[11px] font-bold text-center text-blue-800 bg-blue-50 p-1.5 rounded-lg border border-blue-100">
                  {driveStatusMsg}
                </div>
              )}

              {driveLink && (
                <div className="p-2 bg-blue-50/80 rounded-lg border border-blue-200 flex items-center justify-between gap-2">
                  <span className="text-[10px] font-mono text-blue-900 truncate flex-1">
                    {driveLink}
                  </span>
                  <a
                    href={driveLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1 px-2 text-[10px] font-bold bg-blue-600 text-white rounded hover:bg-blue-700 shrink-0 flex items-center gap-1"
                  >
                    <span>Mở Drive</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={() => setShowQr(!showQr)}
                className="flex-1 py-2 px-3 rounded-lg bg-white border border-emerald-300 text-emerald-800 hover:bg-emerald-100/60 font-semibold text-[11px] flex items-center justify-center gap-1.5 transition"
              >
                <QrCode className="w-3.5 h-3.5 text-indigo-600" />
                <span>{showQr ? 'Ẩn mã QR' : 'Hiện mã QR quét điện thoại'}</span>
              </button>

              <button
                onClick={handleCopyApkLink}
                className="py-2 px-3 rounded-lg bg-white border border-emerald-300 text-emerald-800 hover:bg-emerald-100/60 font-semibold text-[11px] flex items-center justify-center gap-1.5 transition"
              >
                {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-slate-600" />}
                <span>{copied ? 'Đã chép' : 'Sao chép liên kết'}</span>
              </button>
            </div>

            {/* QR Code display */}
            {showQr && (
              <div className="p-3 bg-white rounded-xl border border-emerald-200 flex flex-col items-center gap-2 animate-fadeIn">
                <span className="text-[11px] text-slate-600 font-medium text-center">
                  Dùng camera điện thoại hoặc Zalo quét mã để mở ứng dụng và tải tệp về:
                </span>
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(driveLink || window.location.href)}`}
                  alt="QR Code tải APK"
                  className="w-36 h-36 rounded-lg border border-slate-200 shadow-xs"
                />
              </div>
            )}

            {/* Instructions */}
            <div className="bg-white/90 rounded-xl p-2.5 border border-emerald-200/80 text-[11px] text-slate-600 space-y-1">
              <span className="font-bold text-slate-800 flex items-center gap-1">
                <Info className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                <span>Cách cài đặt file APK trên điện thoại:</span>
              </span>
              <ol className="list-decimal list-inside space-y-0.5 pl-0.5 leading-relaxed text-[11px]">
                <li>Bấm nút xanh ở trên để tải file <code>.apk</code> (dung lượng chuẩn <strong>5.0 MB</strong>).</li>
                <li>Mở mục <strong>"Tệp đã tải về" (Downloads)</strong> trên điện thoại và bấm vào tệp.</li>
                <li>Nếu điện thoại hỏi <em>"Cài đặt ứng dụng không xác định"</em>, chọn <strong>Cài đặt / Cho phép từ nguồn này</strong>.</li>
              </ol>
            </div>
          </div>

          {/* WebAPK Option */}
          <div className="p-3.5 rounded-2xl bg-blue-50/80 border border-blue-200 text-blue-950 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold flex items-center gap-1.5 text-blue-900">
                <Sparkles className="w-4 h-4 text-amber-500" />
                <span>Hoặc cài trực tiếp qua Chrome (WebAPK)</span>
              </span>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-600 text-white">
                Không cần tải file
              </span>
            </div>
            <p className="text-[11px] text-blue-900/80 leading-relaxed">
              Mở trang web này bằng Chrome/Samsung Internet trên điện thoại, bấm menu <strong>3 dấu chấm (⋮)</strong> $\rightarrow$ Chọn <strong>"Cài đặt ứng dụng"</strong> để điện thoại tự tạo app K02.
            </p>

            {isInstallable && (
              <button
                onClick={handleInstallClick}
                disabled={installing}
                className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold text-xs shadow-xs flex items-center justify-center gap-2 active:scale-98 transition disabled:opacity-50"
              >
                <Download className="w-4 h-4" />
                <span>{installing ? 'Đang kích hoạt...' : 'Cài đặt trực tiếp qua trình duyệt'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-3 bg-slate-50 border-t border-slate-200 flex justify-end shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs transition"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
