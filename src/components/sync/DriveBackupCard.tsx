import React from 'react';
import {
  FileSpreadsheet,
  Upload,
  RefreshCw,
  Cloud,
  ExternalLink,
  LogOut,
  FolderSync,
  Clock,
  HardDriveDownload,
  FolderArchive,
  ArrowDownToLine,
  Check,
  KeyRound,
  Smartphone,
  Copy,
} from 'lucide-react';
import type { User } from 'firebase/auth';
import type { DriveBackupFile } from '../../services/googleDriveService';

interface DriveBackupCardProps {
  user: User | null;
  avatarError: boolean;
  onAvatarError: () => void;
  isApkMode: boolean;
  isApkAuthPortal: boolean;
  pwaOriginParam: string | null;
  pwaReturnUrl: string;
  apkDeepLink: string;
  isDriveLoading: boolean;
  isUploadingDrive: boolean;
  isLoadingBackups: boolean;
  isDownloadingFileId: string | null;
  driveStatus: string;
  recentBackups: DriveBackupFile[];
  showTokenInput: boolean;
  tokenInputStr: string;
  copiedBridgeCode: boolean;
  onToggleTokenInput: () => void;
  onTokenInputChange: (value: string) => void;
  onConnectDrive: (forceConsent: boolean) => void;
  onConnectDriveRedirect: () => void;
  onLogoutDrive: () => void;
  onCancelPendingAuth: () => void;
  onCopyBridgeCode: () => void;
  onOpenChromeLogin: () => void;
  onConnectWithTokenCode: () => void;
  onUploadBackupToDrive: () => void;
  onRefreshBackups: () => void;
  onSelectRestoreFile: (file: DriveBackupFile) => void;
  onDownloadDriveFile: (file: DriveBackupFile) => void;
  formatDateTime: (dateStr: string) => string;
  formatFileSize: (bytesStr?: string) => string;
}

export const DriveBackupCard: React.FC<DriveBackupCardProps> = ({
  user,
  avatarError,
  onAvatarError,
  isApkMode,
  isApkAuthPortal,
  pwaOriginParam,
  pwaReturnUrl,
  apkDeepLink,
  isDriveLoading,
  isUploadingDrive,
  isLoadingBackups,
  isDownloadingFileId,
  driveStatus,
  recentBackups,
  showTokenInput,
  tokenInputStr,
  copiedBridgeCode,
  onToggleTokenInput,
  onTokenInputChange,
  onConnectDrive,
  onConnectDriveRedirect,
  onLogoutDrive,
  onCancelPendingAuth,
  onCopyBridgeCode,
  onOpenChromeLogin,
  onConnectWithTokenCode,
  onUploadBackupToDrive,
  onRefreshBackups,
  onSelectRestoreFile,
  onDownloadDriveFile,
  formatDateTime,
  formatFileSize,
}) => {
  return (
    <div className="bg-gradient-to-br from-white to-blue-50/60 rounded-3xl p-4 border-2 border-blue-200/90 shadow-xs space-y-3.5">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold text-blue-950 flex items-center gap-1.5 uppercase tracking-tight">
          <Cloud className="w-4 h-4 text-blue-600" />
          <span>ĐỒNG BỘ GOOGLE DRIVE - THƯ MỤC BACKUP_QLVB_PRO</span>
        </h3>
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 flex items-center gap-1">
          <FolderArchive className="w-3 h-3 text-blue-600" />
          <span>Drive .xlsx</span>
        </span>
      </div>

      <p className="text-xs text-slate-600 leading-relaxed">
        Tự động đồng bộ các bản sao lưu Excel <code>YYYYMMDD_HHmmss_documents.xlsx</code> vào thư mục{' '}
        <strong>Backup_QLVB_Pro</strong> trên Google Drive. Bạn có thể chọn khôi phục nhanh ngược về ứng dụng bất cứ lúc nào.
      </p>

      {/* User Auth Bar */}
      <div className="p-3 bg-white rounded-2xl border border-blue-200/80 space-y-2.5">
        {user ? (
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                {user.photoURL && !avatarError ? (
                  <img
                    src={user.photoURL}
                    alt={user.displayName || ''}
                    referrerPolicy="no-referrer"
                    onError={onAvatarError}
                    className="w-8 h-8 rounded-full border border-blue-300 object-cover shrink-0"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center shrink-0">
                    {(user.displayName || user.email || 'U').charAt(0).toUpperCase()}
                  </div>
                )}
                <div>
                  <span className="text-xs font-bold text-slate-800 block leading-tight">
                    {user.displayName || 'Tài khoản Google'}
                  </span>
                  <span className="text-[11px] text-slate-500">{user.email}</span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  onClick={() => onConnectDrive(true)}
                  disabled={isDriveLoading}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 text-[11px] font-semibold transition"
                  title="Cấp quyền đọc tệp từ các thiết bị khác trên Google Drive"
                >
                  <FolderSync className="w-3.5 h-3.5" />
                  <span>Đồng bộ đa thiết bị</span>
                </button>
                <button
                  onClick={onLogoutDrive}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-medium transition"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Đăng xuất</span>
                </button>
              </div>
            </div>

            {/* Bridge to Android APK or External PWA when logged in on Web Browser */}
            {!isApkMode && (
              <div className="p-2.5 rounded-xl bg-emerald-50/90 border border-emerald-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="text-[11px] text-emerald-900">
                  <span className="font-bold flex items-center gap-1">
                    <Smartphone className="w-3.5 h-3.5 text-emerald-700" />
                    {pwaOriginParam ? 'Đã xác thực thành công cho PWA!' : 'Đang dùng App APK / PWA trên thiết bị khác?'}
                  </span>
                  <span>
                    {pwaOriginParam
                      ? 'Bấm nút bên dưới nếu trình duyệt chưa tự động chuyển về ứng dụng PWA:'
                      : 'Chuyển trực tiếp phiên đăng nhập Google Drive này vào ứng dụng APK hoặc PWA:'}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                  {pwaOriginParam && (
                    <a
                      href={pwaReturnUrl || '#'}
                      className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-[11px] flex items-center gap-1 shadow-xs transition"
                    >
                      <ExternalLink className="w-3 h-3" />
                      <span>Quay về ứng dụng PWA</span>
                    </a>
                  )}
                  <a
                    href={apkDeepLink || '#'}
                    className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] flex items-center gap-1 shadow-xs transition"
                  >
                    <ExternalLink className="w-3 h-3" />
                    <span>Kết nối vào App APK</span>
                  </a>
                  <button
                    onClick={onCopyBridgeCode}
                    className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold text-[11px] flex items-center gap-1 transition"
                  >
                    {copiedBridgeCode ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedBridgeCode ? 'Đã chép mã' : 'Copy Mã Kết Nối'}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-2.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div className="text-xs text-slate-600">
                {isApkAuthPortal || pwaOriginParam ? (
                  <span className="font-semibold text-blue-900">
                    Cổng xác thực Google Drive PRO: Bấm nút bên phải để chọn tài khoản Google và tự động quay về ứng dụng:
                  </span>
                ) : (
                  'Chưa kết nối Google Drive. Chọn phương thức đăng nhập để tự động sao lưu & khôi phục dữ liệu:'
                )}
              </div>
              <button
                onClick={() => onConnectDrive(false)}
                disabled={isDriveLoading}
                className={`w-full sm:w-auto justify-center flex items-center gap-2 px-4 py-2.5 rounded-xl shadow-xs font-bold text-xs transition active:scale-95 disabled:opacity-60 shrink-0 ${
                  isApkAuthPortal || pwaOriginParam
                    ? 'bg-blue-600 hover:bg-blue-700 text-white border border-blue-700 ring-2 ring-blue-300'
                    : 'bg-white hover:bg-slate-50 text-slate-800 border border-slate-300'
                }`}
              >
                {isDriveLoading ? (
                  <RefreshCw className="w-4 h-4 shrink-0 animate-spin text-current" />
                ) : (
                  <svg className="w-4 h-4 shrink-0" viewBox="1 1 22 22" xmlns="http://www.w3.org/2000/svg">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                  </svg>
                )}
                <span>
                  {isDriveLoading
                    ? 'Đang xác thực Google...'
                    : isApkAuthPortal || pwaOriginParam
                    ? 'Chọn Tài Khoản Google'
                    : 'Đăng nhập bằng Google'}
                </span>
              </button>
            </div>

            {/* Additional In-App & Bridge Auth Methods */}
            <div className="pt-1 flex flex-wrap items-center gap-2">
              <button
                onClick={onConnectDriveRedirect}
                disabled={isDriveLoading}
                className="w-full sm:w-auto justify-center flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 font-bold text-[11px] transition"
              >
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
                  <defs>
                    <linearGradient id="chromeRed" x1="3.2173" y1="15" x2="44.7812" y2="15" gradientUnits="userSpaceOnUse">
                      <stop offset="0" stopColor="#d93025" />
                      <stop offset="1" stopColor="#ea4335" />
                    </linearGradient>
                    <linearGradient id="chromeYellow" x1="20.7219" y1="47.6791" x2="41.5039" y2="11.6837" gradientUnits="userSpaceOnUse">
                      <stop offset="0" stopColor="#fcc934" />
                      <stop offset="1" stopColor="#fbbc04" />
                    </linearGradient>
                    <linearGradient id="chromeGreen" x1="26.5981" y1="46.5015" x2="5.8161" y2="10.506" gradientUnits="userSpaceOnUse">
                      <stop offset="0" stopColor="#1e8e3e" />
                      <stop offset="1" stopColor="#34a853" />
                    </linearGradient>
                  </defs>
                  <path d="M3.2154,12 A24,24 0 0,1 44.7846,12 L24,12 A12,12 0 0,0 13.6077,30 Z" fill="url(#chromeRed)" />
                  <path d="M3.2154,12 A24,24 0 0,1 44.7846,12 L24,12 A12,12 0 0,0 13.6077,30 Z" fill="url(#chromeYellow)" transform="rotate(120 24 24)" />
                  <path d="M3.2154,12 A24,24 0 0,1 44.7846,12 L24,12 A12,12 0 0,0 13.6077,30 Z" fill="url(#chromeGreen)" transform="rotate(240 24 24)" />
                  <circle cx="24" cy="24" r="12" fill="#ffffff" />
                  <circle cx="24" cy="24" r="9.5" fill="#1a73e8" />
                </svg>
                <span>Đăng nhập qua Trình duyệt</span>
              </button>

              <button
                onClick={onToggleTokenInput}
                disabled={isDriveLoading}
                className="w-full sm:w-auto justify-center flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 font-bold text-[11px] transition"
              >
                <KeyRound className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                <span>Nhập Mã Kết Nối</span>
              </button>

              {isDriveLoading && (
                <button
                  type="button"
                  onClick={onCancelPendingAuth}
                  className="w-full sm:w-auto justify-center flex items-center gap-1 px-3 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-[11px] transition"
                >
                  <span>Hủy chờ / Thử lại</span>
                </button>
              )}
            </div>

            {showTokenInput && (
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2 animate-fadeIn w-full max-w-full overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-1.5">
                  <span className="text-[11px] font-semibold text-slate-700">
                    Dán Mã Kết Nối từ cổng xác thực Web:
                  </span>
                  <button
                    onClick={onOpenChromeLogin}
                    className="text-[11px] font-bold text-blue-600 hover:underline flex items-center gap-1 shrink-0"
                  >
                    <ExternalLink className="w-3 h-3 shrink-0" />
                    <span>Mở Cổng Xác Thực Lấy Mã</span>
                  </button>
                </div>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full min-w-0">
                  <input
                    type="text"
                    value={tokenInputStr}
                    onChange={(e) => onTokenInputChange(e.target.value)}
                    placeholder="Dán Mã Kết Nối (Base64 hoặc URL) vào đây..."
                    className="w-full min-w-0 sm:flex-1 px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    onClick={onConnectWithTokenCode}
                    disabled={isDriveLoading || !tokenInputStr.trim()}
                    className="w-full sm:w-auto shrink-0 flex items-center justify-center px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition disabled:opacity-50"
                  >
                    Kết nối
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Action buttons */}
        <div className="pt-2 border-t border-slate-100 flex flex-wrap gap-2">
          <button
            onClick={onUploadBackupToDrive}
            disabled={isDriveLoading || isUploadingDrive}
            className="flex-1 min-w-[220px] flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs transition active:scale-95 disabled:opacity-50"
          >
            <Upload className="w-4 h-4" />
            <span>{isUploadingDrive ? 'Đang sao lưu lên Drive...' : 'Sao lưu ngay lên Google Drive (Backup_QLVB_Pro)'}</span>
          </button>

          {user && (
            <button
              onClick={onRefreshBackups}
              disabled={isLoadingBackups}
              className="flex items-center gap-1.5 py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs shadow-xs transition active:scale-95 disabled:opacity-50"
              title="Làm mới danh sách tệp sao lưu trên Drive"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingBackups ? 'animate-spin text-blue-600' : ''}`} />
              <span>Quét lại Drive</span>
            </button>
          )}
        </div>

        {driveStatus && (
          <div className="text-[11px] text-blue-900 bg-blue-50/80 p-2 rounded-xl font-medium animate-fadeIn">
            ℹ️ {driveStatus}
          </div>
        )}
      </div>

      {/* List of 5 Most Recent Excel Backups on Drive */}
      <div className="space-y-2 pt-1">
        <div className="flex items-center justify-between text-xs font-bold text-slate-800">
          <span className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-blue-600" />
            <span>5 BẢN SAO LƯU GOOGLE DRIVE GẦN NHẤT</span>
          </span>
          {recentBackups.length > 0 && (
            <span className="text-[11px] text-slate-500 font-normal">
              {recentBackups.length} bản sao lưu
            </span>
          )}
        </div>

        {!user ? (
          <div className="p-3.5 bg-white/70 rounded-2xl border border-dashed border-slate-300 text-center text-xs text-slate-500">
            Đăng nhập tài khoản Google để xem và khôi phục từ 5 bản sao lưu gần nhất.
          </div>
        ) : isLoadingBackups ? (
          <div className="p-4 bg-white rounded-2xl border border-slate-200 flex items-center justify-center gap-2 text-xs text-slate-500">
            <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
            <span>Đang kiểm tra thư mục Backup_QLVB_Pro trên Drive...</span>
          </div>
        ) : recentBackups.length === 0 ? (
          <div className="p-4 bg-white rounded-2xl border border-slate-200 text-center text-xs text-slate-500 space-y-1">
            <p className="font-medium text-slate-700">Chưa có bản sao lưu nào trong thư mục Backup_QLVB_Pro.</p>
            <p className="text-[11px]">
              Bấm nút <strong>"Sao lưu ngay lên Google Drive"</strong> hoặc bấm <strong>"Đồng bộ đa thiết bị"</strong> để cấp quyền quét tệp từ máy khác.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {recentBackups.map((file, idx) => (
              <div
                key={file.id}
                className="bg-white p-3 rounded-2xl border border-blue-100 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 hover:border-blue-300 transition"
              >
                <div className="flex items-start gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center justify-center shrink-0 mt-0.5">
                    <FileSpreadsheet className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-800 truncate" title={file.name}>
                        {file.name}
                      </span>
                      {idx === 0 && (
                        <span className="px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-[9px] font-bold shrink-0">
                          Mới nhất
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-slate-500 mt-0.5">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-slate-400" />
                        {formatDateTime(file.modifiedTime || file.createdTime)}
                      </span>
                      {file.size && <span>• {formatFileSize(file.size)}</span>}
                    </div>
                  </div>
                </div>

                {/* Actions for this backup file */}
                <div className="flex items-center gap-1.5 self-end sm:self-center shrink-0">
                  <button
                    onClick={() => onSelectRestoreFile(file)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs transition active:scale-95"
                    title="Khôi phục dữ liệu từ bản sao lưu này"
                  >
                    <HardDriveDownload className="w-3.5 h-3.5" />
                    <span>Khôi phục</span>
                  </button>

                  <button
                    onClick={() => onDownloadDriveFile(file)}
                    disabled={isDownloadingFileId === file.id}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium transition active:scale-95 disabled:opacity-50"
                    title="Tải tệp Excel này về máy"
                  >
                    <ArrowDownToLine className="w-3.5 h-3.5 text-slate-600" />
                    <span>{isDownloadingFileId === file.id ? 'Đang tải...' : 'Tải về'}</span>
                  </button>

                  {file.webViewLink && (
                    <a
                      href={file.webViewLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-blue-600 transition"
                      title="Mở trên Google Drive"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
