import React, { useState, useRef, useEffect } from 'react';
import {
  FileSpreadsheet,
  Upload,
  Download,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Database,
  FileDown,
  FileUp,
  RotateCcw,
  Smartphone,
  Cloud,
  ExternalLink,
  Copy,
  LogOut,
  Sparkles,
} from 'lucide-react';
import { AppDataState, exportToExcel, importFromExcel } from '../utils/excelSync';
import { generateInitialData } from '../services/storageService';
import { googleSignIn, logoutGoogle, uploadApkToDrive, initAuth } from '../services/googleDriveService';
import type { User } from 'firebase/auth';

interface SyncTabProps {
  appState: AppDataState;
  onUpdateState: (newState: AppDataState) => void;
}

export const SyncTab: React.FC<SyncTabProps> = ({ appState, onUpdateState }) => {
  const [importStatus, setImportStatus] = useState<{
    type: 'success' | 'error' | null;
    message: string;
  }>({ type: null, message: '' });

  const [isProcessing, setIsProcessing] = useState(false);
  const [overwriteMode, setOverwriteMode] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const jsonInputRef = useRef<HTMLInputElement>(null);

  // Google Drive State
  const [user, setUser] = useState<User | null>(null);
  const [isDriveLoading, setIsDriveLoading] = useState(false);
  const [driveStatus, setDriveStatus] = useState<string>('');
  const [driveApkLink, setDriveApkLink] = useState<string>(() => {
    return localStorage.getItem('k02_drive_apk_link') || '';
  });
  const [copiedLink, setCopiedLink] = useState(false);
  const [isDirectDownloading, setIsDirectDownloading] = useState(false);

  useEffect(() => {
    const unsubscribe = initAuth((currentUser) => {
      setUser(currentUser);
    }, () => {
      setUser(null);
    });
    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    setImportStatus({ type: null, message: '' });

    try {
      const result = await importFromExcel(file, appState, overwriteMode);
      if (result.success && result.data) {
        onUpdateState(result.data);
        setImportStatus({
          type: 'success',
          message: `Đã nhập thành công từ file Excel "${file.name}"! (${result.stats.documents} văn bản, ${result.stats.reports} báo cáo, ${result.stats.schedules} lịch)`,
        });
      } else {
        throw new Error(result.message || 'Nhập file không thành công');
      }
    } catch (error: any) {
      setImportStatus({
        type: 'error',
        message: `Lỗi khi nhập dữ liệu: ${error.message || 'File Excel không đúng định dạng chuẩn K02'}`,
      });
    } finally {
      setIsProcessing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleExportExcel = () => {
    try {
      const count = exportToExcel(appState);
      setImportStatus({
        type: 'success',
        message: `Đã xuất ${count} văn bản ra file "documents.xlsx" thành công. Bạn có thể sao chép file này vào máy tính để nhập lại vào phần mềm PC.`,
      });
    } catch (error: any) {
      setImportStatus({
        type: 'error',
        message: `Lỗi khi xuất dữ liệu: ${error.message}`,
      });
    }
  };

  const handleExportJSON = () => {
    try {
      const jsonStr = JSON.stringify(appState, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `k02_backup_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setImportStatus({
        type: 'success',
        message: 'Đã xuất file sao lưu JSON thành công.',
      });
    } catch (error: any) {
      setImportStatus({ type: 'error', message: `Lỗi: ${error.message}` });
    }
  };

  const handleResetSampleData = () => {
    if (window.confirm('Bạn có chắc chắn muốn đặt lại dữ liệu mẫu ban đầu? Toàn bộ dữ liệu hiện tại sẽ được thay thế bằng danh mục mẫu chuẩn K02.')) {
      const initial = generateInitialData();
      onUpdateState(initial);
      setImportStatus({
        type: 'success',
        message: 'Đã đặt lại dữ liệu mẫu K02 ban đầu thành công!',
      });
    }
  };

  const handleJSONUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (parsed && Array.isArray(parsed.documents)) {
          onUpdateState(parsed);
          setImportStatus({
            type: 'success',
            message: 'Đã khôi phục dữ liệu từ file sao lưu JSON!',
          });
        } else {
          setImportStatus({ type: 'error', message: 'Tệp JSON không đúng cấu trúc K02.' });
        }
      } catch (err: any) {
        setImportStatus({ type: 'error', message: `Lỗi đọc file JSON: ${err.message}` });
      }
    };
    reader.readAsText(file);
    if (jsonInputRef.current) jsonInputRef.current.value = '';
  };

  // Google Drive Handlers
  const handleConnectDrive = async () => {
    setIsDriveLoading(true);
    setDriveStatus('Đang mở xác thực Google...');
    try {
      const res = await googleSignIn();
      setUser(res.user);
      setDriveStatus('Đã kết nối tài khoản Google thành công!');
    } catch (err: any) {
      setDriveStatus(`Lỗi kết nối: ${err.message || 'Không thể đăng nhập Google'}`);
    } finally {
      setIsDriveLoading(false);
    }
  };

  const handleLogoutDrive = async () => {
    await logoutGoogle();
    setUser(null);
    setDriveStatus('Đã đăng xuất Google Drive.');
  };

  const handleUploadToDrive = async () => {
    if (!user) {
      await handleConnectDrive();
      return;
    }
    setIsDriveLoading(true);
    setDriveStatus('Bắt đầu tải lên Google Drive...');
    try {
      const result = await uploadApkToDrive((msg) => setDriveStatus(msg));
      setDriveApkLink(result.webViewLink);
      setDriveStatus('Tải lên Google Drive thành công! Tệp đã được cấp quyền chia sẻ liên kết.');
    } catch (err: any) {
      setDriveStatus(`Lỗi tải lên: ${err.message}`);
    } finally {
      setIsDriveLoading(false);
    }
  };

  const handleCopyDriveLink = () => {
    if (!driveApkLink) return;
    navigator.clipboard.writeText(driveApkLink);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const handleDirectBlobDownload = async () => {
    setIsDirectDownloading(true);
    try {
      const res = await fetch('./k02_mobile_qlvb_1.8.apk');
      if (!res.ok) throw new Error('Không tìm thấy tệp APK trên máy chủ');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'k02_mobile_qlvb_1.8.apk';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 2000);
    } catch (err: any) {
      alert(`Lỗi tải trực tiếp: ${err.message}. Vui lòng dùng liên kết Google Drive.`);
    } finally {
      setIsDirectDownloading(false);
    }
  };

  return (
    <div className="pb-24 pt-3 px-3.5 max-w-4xl mx-auto space-y-4">
      {/* Title */}
      <div>
        <h2 className="text-base font-bold text-slate-800 tracking-tight flex items-center gap-2">
          <span>ĐỒNG BỘ DỮ LIỆU & LƯU TRỮ GOOGLE DRIVE</span>
        </h2>
        <p className="text-xs text-slate-500 font-medium">
          Trao đổi dữ liệu hai chiều với phần mềm K02 trên Windows và lưu trữ tệp APK lên Google Drive
        </p>
      </div>

      {/* Status banner */}
      {importStatus.type && (
        <div
          className={`p-3.5 rounded-2xl border text-xs flex items-start gap-2.5 animate-fadeIn ${
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
          <div className="flex-1 font-medium">{importStatus.message}</div>
          <button
            onClick={() => setImportStatus({ type: null, message: '' })}
            className="text-xs font-bold opacity-60 hover:opacity-100"
          >
            ✕
          </button>
        </div>
      )}

      {/* Google Drive Connection & APK Storage Card */}
      <div className="bg-gradient-to-br from-white to-blue-50/60 rounded-3xl p-4 border-2 border-blue-200/90 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-blue-950 flex items-center gap-1.5 uppercase tracking-tight">
            <Cloud className="w-4 h-4 text-blue-600" />
            <span>KẾT NỐI GOOGLE DRIVE ĐỂ TẢI & LƯU TỆP APK</span>
          </h3>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
            Ưu tiên Drive
          </span>
        </div>

        <p className="text-xs text-slate-600 leading-relaxed">
          Lưu trữ tệp tin cài đặt <code>k02_mobile_qlvb_1.8.apk</code> (Tối ưu nhỏ gọn ~2.0 MB) vĩnh viễn trên <strong>Google Drive</strong> của bạn, chia sẻ liên kết trực tiếp cho các đồng chí khác trong đơn vị mà không bao giờ bị hết hạn.
        </p>

        {/* User Auth State */}
        <div className="p-3 bg-white rounded-2xl border border-blue-200/80 space-y-2.5">
          {user ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                {user.photoURL ? (
                  <img src={user.photoURL} alt={user.displayName || ''} className="w-8 h-8 rounded-full border border-blue-300" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center">
                    {user.email?.charAt(0).toUpperCase()}
                  </div>
                )}
                <div>
                  <span className="text-xs font-bold text-slate-800 block leading-tight">
                    {user.displayName || 'Tài khoản Google'}
                  </span>
                  <span className="text-[11px] text-slate-500">{user.email}</span>
                </div>
              </div>

              <button
                onClick={handleLogoutDrive}
                className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-medium transition"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Đăng xuất</span>
              </button>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5">
              <div className="text-xs text-slate-600">
                Chưa kết nối tài khoản Google. Bấm nút dưới để kết nối:
              </div>
              <button
                onClick={handleConnectDrive}
                disabled={isDriveLoading}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 shadow-xs font-bold text-xs transition active:scale-95 disabled:opacity-50"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                </svg>
                <span>Đăng nhập bằng Google</span>
              </button>
            </div>
          )}

          {/* Action buttons */}
          <div className="pt-2 border-t border-slate-100 flex flex-wrap gap-2">
            <button
              onClick={handleUploadToDrive}
              disabled={isDriveLoading}
              className="flex-1 min-w-[200px] flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs transition active:scale-95 disabled:opacity-50"
            >
              <Upload className="w-4 h-4" />
              <span>{isDriveLoading ? 'Đang tải lên Drive...' : 'Tải file APK v1.8 lên Google Drive của tôi'}</span>
            </button>

            <button
              onClick={handleDirectBlobDownload}
              disabled={isDirectDownloading}
              className="flex items-center gap-1.5 py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs transition active:scale-95 disabled:opacity-50"
              title="Tải trực tiếp vào máy tính/điện thoại từ bộ nhớ ứng dụng"
            >
              <Download className="w-4 h-4" />
              <span>{isDirectDownloading ? 'Đang chuẩn bị...' : 'Tải APK v1.8 trực tiếp'}</span>
            </button>
          </div>

          {driveStatus && (
            <div className="text-[11px] text-blue-900 bg-blue-50/80 p-2 rounded-xl font-medium animate-fadeIn">
              ℹ️ {driveStatus}
            </div>
          )}
        </div>

        {/* Drive Link & Custom Input */}
        <div className="space-y-1.5 pt-1">
          <label className="text-[11px] font-bold text-slate-700 block">
            Liên kết Google Drive của tệp APK:
          </label>
          <div className="flex items-center gap-2 bg-white p-2 rounded-xl border border-blue-200">
            <input
              type="text"
              value={driveApkLink}
              onChange={(e) => {
                setDriveApkLink(e.target.value);
                localStorage.setItem('k02_drive_apk_link', e.target.value);
              }}
              placeholder="Dán liên kết Google Drive của đơn vị (vd: https://drive.google.com/...)"
              className="flex-1 text-[11px] text-slate-700 bg-transparent outline-hidden font-mono truncate"
            />
            {driveApkLink && (
              <>
                <button
                  onClick={handleCopyDriveLink}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-800 text-[11px] font-semibold shrink-0 transition"
                >
                  {copiedLink ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Đã chép</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-blue-600" />
                      <span>Chép link</span>
                    </>
                  )}
                </button>

                <a
                  href={driveApkLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold shrink-0 transition"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Mở Drive</span>
                </a>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Main 2-Step Excel Sync Box */}
      <div className="bg-white rounded-3xl p-4 border border-slate-200/80 shadow-xs space-y-4">
        {/* Step 1: Import */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-800 uppercase tracking-tight">
            <div className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px]">
              1
            </div>
            <span>Nhập file Excel từ máy tính PC</span>
          </div>

          <div className="pl-7 space-y-2">
            <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={overwriteMode}
                onChange={(e) => setOverwriteMode(e.target.checked)}
                className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
              />
              <span>Ghi đè toàn bộ dữ liệu (nếu không chọn, hệ thống sẽ nhập gộp và cập nhật)</span>
            </label>

            <input
              type="file"
              ref={fileInputRef}
              accept=".xlsx, .xls"
              onChange={handleFileUpload}
              className="hidden"
            />

            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isProcessing}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs active:scale-95 transition disabled:opacity-50"
            >
              <Upload className="w-4 h-4" />
              <span>{isProcessing ? 'Đang đọc dữ liệu...' : 'Chọn file Excel từ PC (.xlsx)'}</span>
            </button>
          </div>
        </div>

        <hr className="border-slate-100" />

        {/* Step 2: Export */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-800 uppercase tracking-tight">
            <div className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px]">
              2
            </div>
            <span>Xuất file Excel cho máy tính PC</span>
          </div>

          <div className="pl-7 space-y-2">
            <p className="text-xs text-slate-500">
              Xuất toàn bộ {appState.documents.length} văn bản và {appState.reports.length} kỳ báo cáo ra file Excel 9 sheet chuẩn để nhập vào phần mềm PC.
            </p>

            <button
              onClick={handleExportExcel}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs active:scale-95 transition"
            >
              <Download className="w-4 h-4" />
              <span>Tải file Excel (documents.xlsx)</span>
            </button>
          </div>
        </div>
      </div>

      {/* Backup & Sample Data Card */}
      <div className="bg-white rounded-3xl p-4 border border-slate-200/80 shadow-xs space-y-3">
        <h3 className="text-xs font-bold text-slate-800 flex items-center gap-1.5 uppercase">
          <Database className="w-4 h-4 text-indigo-600" />
          <span>Sao lưu dự phòng & Khôi phục</span>
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          {/* HTML Bundle for PC */}
          <a
            href="./k02_web_html.zip"
            download="k02_web_html.zip"
            className="p-3 rounded-2xl bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 text-left space-y-1 transition active:scale-98 flex flex-col justify-between"
            title="Tải gói mã nguồn HTML/JS/CSS nén để đóng gói .exe hoặc mở trên PC"
          >
            <div className="flex items-center gap-1.5 font-bold text-indigo-900 text-xs">
              <Download className="w-4 h-4 text-indigo-600" />
              <span>Tải gói HTML/JS (PC)</span>
            </div>
            <div className="text-[11px] text-indigo-700/80">
              Tệp k02_web_html.zip để đóng gói .exe
            </div>
          </a>

          {/* JSON Export */}
          <button
            onClick={handleExportJSON}
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
            onChange={handleJSONUpload}
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
            onClick={handleResetSampleData}
            className="p-3 rounded-2xl bg-slate-50 border border-slate-200 hover:bg-slate-100 text-left space-y-1 transition active:scale-98"
          >
            <div className="flex items-center gap-1.5 font-bold text-slate-800 text-xs">
              <RotateCcw className="w-4 h-4 text-amber-600" />
              <span>Nạp dữ liệu mẫu</span>
            </div>
            <div className="text-[11px] text-slate-500">
              Mẫu chuẩn văn bản hành chính K02
            </div>
          </button>
        </div>
      </div>

      {/* Guide Card */}
      <div className="bg-blue-50/70 rounded-3xl p-4 border border-blue-200 text-xs text-blue-900 space-y-1.5 leading-relaxed">
        <div className="flex items-center gap-1.5 font-bold">
          <HelpCircle className="w-4 h-4 text-blue-600" />
          <span>Hướng dẫn đồng bộ dữ liệu giữa PC, Google Drive và Android:</span>
        </div>
        <ul className="list-disc list-inside space-y-1 text-[11px] text-blue-800/90 pl-1">
          <li><strong>Lưu trữ Google Drive:</strong> Đăng nhập Google Drive ở trên và bấm <em>Tải file APK lên Google Drive của tôi</em> để tạo liên kết tải vĩnh viễn chia sẻ cho các đồng chí khác.</li>
          <li><strong>Từ PC sang Android:</strong> Trên PC mở <em>Cài đặt ▾ &gt; Sao lưu Excel khôi phục...</em>. Gửi file đó sang điện thoại và bấm <strong>Bước 1</strong> ở trên.</li>
          <li><strong>Từ Android sang PC:</strong> Bấm <strong>Bước 2</strong> ở trên để tải file <code>documents.xlsx</code>. Chuyển sang PC và mở <em>Cài đặt ▾ &gt; Nhập Excel khôi phục...</em>.</li>
        </ul>
      </div>
    </div>
  );
};
