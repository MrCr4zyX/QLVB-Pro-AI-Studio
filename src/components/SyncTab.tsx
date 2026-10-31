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
  Cloud,
  ExternalLink,
  LogOut,
  FolderSync,
  Clock,
  HardDriveDownload,
  AlertTriangle,
  FolderArchive,
  ArrowDownToLine,
  Check,
  KeyRound,
  Smartphone,
  Copy,
} from 'lucide-react';
import {
  AppDataState,
  exportToExcel,
  exportToExcelBlob,
  importFromExcel,
  importFromExcelBuffer,
} from '../utils/excelSync';
import { generateInitialData } from '../services/storageService';
import { playSuccessChime, playAlertChime, notifyAndroidNative } from '../utils/soundUtils';
import { markWeeklyBackupCompleted } from '../hooks/useNotifications';
import {
  checkPcQlvbFolderReady,
  ensurePcQlvbDirectoryHandle,
  getExportTimestampPrefix,
  QLVB_EXPORT_PATH_LABEL,
  saveArrayBufferToQlvbFolder,
  saveTextToQlvbFolder,
} from '../utils/fileExportUtils';
import {
  googleSignIn,
  googleSignInRedirect,
  buildDirectGoogleOAuthUrl,
  consumeOAuthHashCallback,
  connectWithExternalToken,
  generateApkAuthBridgeCode,
  generateApkDeepLink,
  generatePwaReturnUrl,
  broadcastAuthBridgeCode,
  cancelPendingPortalPopup,
  WEB_AUTH_PORTAL_URL,
  logoutGoogle,
  initAuth,
  getAccessToken,
  uploadExcelBackupToDrive,
  listRecentBackups,
  downloadBackupFromDrive,
  DriveBackupFile,
} from '../services/googleDriveService';
import type { User } from 'firebase/auth';

interface SyncTabProps {
  appState: AppDataState;
  onUpdateState: (newState: AppDataState) => void;
}

export const SyncTab: React.FC<SyncTabProps> = ({ appState, onUpdateState }) => {
  const [importStatus, setImportStatus] = useState<{
    type: 'success' | 'error' | 'info' | null;
    message: string;
  }>({ type: null, message: '' });

  const [isProcessing, setIsProcessing] = useState(false);
  const [overwriteMode, setOverwriteMode] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const jsonInputRef = useRef<HTMLInputElement>(null);

  // Google Drive State
  const [user, setUser] = useState<User | null>(null);
  const [isDriveLoading, setIsDriveLoading] = useState(false);
  const [isUploadingDrive, setIsUploadingDrive] = useState(false);
  const [driveStatus, setDriveStatus] = useState<string>('');
  const [recentBackups, setRecentBackups] = useState<DriveBackupFile[]>([]);
  const [isLoadingBackups, setIsLoadingBackups] = useState(false);

  // Restore Modal State
  const [restoreModalFile, setRestoreModalFile] = useState<DriveBackupFile | null>(null);
  const [restoreOverwrite, setRestoreOverwrite] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [isDownloadingFileId, setIsDownloadingFileId] = useState<string | null>(null);

  // APK & PWA Auth Bridge State
  const [showTokenInput, setShowTokenInput] = useState(false);
  const [tokenInputStr, setTokenInputStr] = useState('');
  const [copiedBridgeCode, setCopiedBridgeCode] = useState(false);
  const [qlvbFolderReady, setQlvbFolderReady] = useState<boolean>(true);

  const refreshQlvbFolderStatus = async () => {
    const res = await checkPcQlvbFolderReady();
    setQlvbFolderReady(res.isReady);
  };

  useEffect(() => {
    refreshQlvbFolderStatus();
  }, []);
  const hasAutoTriggeredPortalAuth = useRef(false);
  const isApkMode = typeof window !== 'undefined' && Boolean((window as any).AndroidBridge);
  const searchParams =
    typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const isApkAuthPortal = Boolean(searchParams && searchParams.get('apk_auth') === '1');
  const pwaOriginParam = searchParams ? searchParams.get('pwa_origin') : null;

  // Auto clear status notification after 8 seconds
  useEffect(() => {
    if (importStatus.type) {
      const timer = setTimeout(() => {
        setImportStatus({ type: null, message: '' });
      }, 8000);
      return () => clearTimeout(timer);
    }
  }, [importStatus.type]);

  const dispatchPortalAuthResult = (tokenOverride?: string | null, userOverride?: User | null): boolean => {
    if (typeof window === 'undefined') return false;
    const params = new URLSearchParams(window.location.search);
    const isPortal = params.get('apk_auth') === '1';
    const pwaOrigin = params.get('pwa_origin');
    const bridgeCode = generateApkAuthBridgeCode(tokenOverride, userOverride);

    if (!bridgeCode) return false;

    // 1. Always broadcast via postMessage (if opener alive) and BroadcastChannel
    broadcastAuthBridgeCode(bridgeCode);

    // 2. If pwa_origin is provided, redirect back to PWA (handles both same-tab and COOP-severed popup)
    if (pwaOrigin) {
      const returnUrl = generatePwaReturnUrl(pwaOrigin, tokenOverride, userOverride);
      if (returnUrl) {
        setDriveStatus('✓ Đã xác thực thành công! Đang chuyển phiên đăng nhập về ứng dụng PWA...');
        setTimeout(() => {
          window.location.href = returnUrl;
        }, 180);
        return true;
      }
    }

    // 3. If opened as a popup without pwa_origin, try closing popup
    if (window.opener && !window.opener.closed) {
      setTimeout(() => {
        try {
          window.close();
        } catch {
          // Ignore close error
        }
      }, 250);
    }

    // 4. If APK portal mode without pwa_origin, trigger Android deep link
    if (isPortal && !pwaOrigin) {
      const deepLink = generateApkDeepLink(false, tokenOverride, userOverride);
      if (deepLink) {
        setDriveStatus('✓ Đã xác thực thành công! Đang mở lại ứng dụng K02 QLVB PRO...');
        setTimeout(() => {
          window.location.href = deepLink;
        }, 350);
        return true;
      }
    }

    return false;
  };

  useEffect(() => {
    const consumeNativeDeepLink = async () => {
      const bridge = (window as any).AndroidBridge;
      if (bridge && typeof bridge.consumePendingAuthUri === 'function') {
        const pendingUri = bridge.consumePendingAuthUri();
        if (pendingUri && typeof pendingUri === 'string' && pendingUri.trim().length > 0) {
          setIsDriveLoading(true);
          setDriveStatus('Đang nhận phiên đăng nhập từ trình duyệt Chrome...');
          try {
            const res = await connectWithExternalToken(pendingUri);
            setUser(res.user);
            setDriveStatus('✓ Đã kết nối Google Drive tự động từ trình duyệt Chrome!');
            await fetchRecentBackups(res.accessToken);
          } catch (err: any) {
            setDriveStatus(`Lỗi nhận liên kết xác thực: ${err.message}`);
          } finally {
            setIsDriveLoading(false);
          }
        }
      }
    };

    const consumeWebAuthCallbackUrl = async () => {
      if (typeof window === 'undefined') return;
      const urlParams = new URLSearchParams(window.location.search);
      const externalCode = urlParams.get('code');
      if (externalCode && externalCode.trim().length > 0) {
        urlParams.delete('code');
        const nextQuery = urlParams.toString();
        const cleanUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ''}${window.location.hash}`;
        window.history.replaceState({}, document.title, cleanUrl);

        setIsDriveLoading(true);
        setDriveStatus('Đang nhận phiên đăng nhập Google Drive...');
        try {
          const res = await connectWithExternalToken(externalCode);
          // Broadcast on same origin so if this is a returning popup, the main PWA window receives it immediately
          broadcastAuthBridgeCode(externalCode);
          setUser(res.user);
          setDriveStatus('✓ Đã kết nối tài khoản Google Drive thành công!');

          // If this window was the auth popup that redirected back to PWA origin, close popup automatically
          if (window.name === 'k02_pwa_google_auth') {
            setTimeout(() => {
              try {
                window.close();
              } catch {
                // Ignore close error
              }
            }, 250);
          }

          await fetchRecentBackups(res.accessToken);
        } catch (err: any) {
          setDriveStatus(`Lỗi xác thực phiên đăng nhập: ${err.message}`);
        } finally {
          setIsDriveLoading(false);
        }
      }
    };

    const consumeOAuthCallbackIfPresent = async () => {
      const hashRes = await consumeOAuthHashCallback();
      if (hashRes) {
        setUser(hashRes.user);
        setDriveStatus('✓ Đã xác thực Google Drive thành công!');
        if (hashRes.state?.pwaOrigin) {
          const returnUrl = generatePwaReturnUrl(
            hashRes.state.pwaOrigin,
            hashRes.accessToken,
            hashRes.user
          );
          if (returnUrl) {
            window.location.replace(returnUrl);
            return true;
          }
        }
        if (hashRes.state?.apkAuth) {
          const deepLink = generateApkDeepLink(false, hashRes.accessToken, hashRes.user);
          if (deepLink) {
            window.location.href = deepLink;
            return true;
          }
        }
        const redirected = dispatchPortalAuthResult(hashRes.accessToken, hashRes.user);
        if (!redirected) {
          await fetchRecentBackups(hashRes.accessToken);
        }
        return true;
      }
      return false;
    };

    consumeOAuthCallbackIfPresent();
    consumeNativeDeepLink();
    consumeWebAuthCallbackUrl();

    const unsubscribe = initAuth(
      (currentUser, token) => {
        setUser(currentUser);
        if (token) {
          const redirected = dispatchPortalAuthResult(token, currentUser);
          if (!redirected) {
            fetchRecentBackups(token);
          }
        }
      },
      () => {
        setUser(null);
        setRecentBackups([]);
        const params = new URLSearchParams(window.location.search);
        const isPortalMode =
          params.get('apk_auth') === '1' ||
          params.get('auto_oauth') === '1' ||
          Boolean(params.get('pwa_origin'));
        if (
          isPortalMode &&
          !hasAutoTriggeredPortalAuth.current &&
          !(window.location.hash || '').includes('access_token=')
        ) {
          hasAutoTriggeredPortalAuth.current = true;
          // In top-level window on portal mode, immediately redirect to Google OAuth2 without intermediate click
          if (window.self === window.top) {
            setDriveStatus('Đang chuyển tới trang chọn tài khoản Google...');
            window.location.replace(
              buildDirectGoogleOAuthUrl({
                pwaOrigin: params.get('pwa_origin'),
                apkAuth: params.get('apk_auth') === '1' && !params.get('pwa_origin'),
              })
            );
          } else {
            handleConnectDrive(false, true);
          }
        }
      }
    );

    const onApkAuthEvent = () => consumeNativeDeepLink();
    const onFocusOrVisible = () => {
      if (document.visibilityState === 'visible') {
        consumeNativeDeepLink();
      }
    };
    window.addEventListener('k02-apk-auth-received', onApkAuthEvent);
    window.addEventListener('focus', consumeNativeDeepLink);
    document.addEventListener('visibilitychange', onFocusOrVisible);

    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
      window.removeEventListener('k02-apk-auth-received', onApkAuthEvent);
      window.removeEventListener('focus', consumeNativeDeepLink);
      document.removeEventListener('visibilitychange', onFocusOrVisible);
    };
  }, []);

  const fetchRecentBackups = async (token?: string) => {
    const activeToken = token || (await getAccessToken());
    if (!activeToken) {
      setUser(null);
      setRecentBackups([]);
      return;
    }

    setIsLoadingBackups(true);
    try {
      const files = await listRecentBackups(activeToken, (msg) => setDriveStatus(msg));
      setRecentBackups(files);
      setDriveStatus(`Đã quét xong thư mục Backup_QLVB_Pro (${files.length} bản sao lưu gần nhất).`);
    } catch (err: any) {
      console.error('Fetch backups error:', err);
      if (err?.isAuthError || String(err?.message || '').includes('401')) {
        setUser(null);
        setRecentBackups([]);
        setDriveStatus(
          'Phiên kết nối Google Drive đã hết hạn (sau 60 phút). Vui lòng bấm "Đăng nhập bằng Google" để làm mới kết nối.'
        );
      } else {
        setDriveStatus(
          `Lỗi tải danh sách sao lưu: ${err.message || 'Vui lòng bấm Cấp quyền lại để quét toàn bộ Drive'}`
        );
      }
    } finally {
      setIsLoadingBackups(false);
    }
  };

  const handleConnectDrive = async (forceConsent = false, isAutoTrigger = false) => {
    setIsDriveLoading(true);
    setDriveStatus(
      isAutoTrigger
        ? 'Đang mở bảng chọn tài khoản Google...'
        : 'Đang kết nối cửa sổ xác thực Google Drive...'
    );
    try {
      const res = await googleSignIn(forceConsent);
      setUser(res.user);
      setDriveStatus('✓ Đã kết nối tài khoản Google thành công!');
      // Immediately dispatch token back to PWA / APK before scanning Drive folders
      const redirected = dispatchPortalAuthResult(res.accessToken, res.user);
      if (!redirected) {
        await fetchRecentBackups(res.accessToken);
      }
    } catch (err: any) {
      const msg = String(err?.message || '');
      if (msg === 'REDIRECTING_TO_PORTAL') {
        setDriveStatus('Đang chuyển tới cổng xác thực Google Drive...');
        return;
      }
      if (msg === 'REDIRECTING_TO_GOOGLE') {
        setDriveStatus('Đang chuyển hướng sang trang chọn tài khoản Google...');
        return;
      }
      if (msg.includes('Đang mở trình duyệt Chrome')) {
        setDriveStatus(msg);
        return;
      }
      if (
        isAutoTrigger &&
        (err?.code === 'auth/popup-blocked' ||
          err?.code === 'auth/cancelled-popup-request' ||
          msg.includes('popup-blocked'))
      ) {
        setDriveStatus('Vui lòng bấm nút "Đăng nhập bằng Google" bên dưới để chọn tài khoản Google của bạn.');
      } else {
        setDriveStatus(
          `Lỗi kết nối: ${msg || 'Không thể đăng nhập'}. Bạn có thể bấm lại "Đăng nhập bằng Google" hoặc "Nhập Mã Kết Nối" bên dưới.`
        );
      }
    } finally {
      setIsDriveLoading(false);
    }
  };

  const handleConnectDriveRedirect = async () => {
    setIsDriveLoading(true);
    setDriveStatus('Đang mở trang chọn tài khoản Google...');
    try {
      await googleSignInRedirect();
    } catch (err: any) {
      setDriveStatus(`Lỗi chuyển hướng: ${err.message}`);
      setIsDriveLoading(false);
    }
  };

  const handleOpenChromeLogin = () => {
    const bridge = (window as any).AndroidBridge;
    if (bridge && typeof bridge.openExternalBrowser === 'function') {
      setDriveStatus('Đang mở trình duyệt Chrome... Sau khi đăng nhập Google trên Chrome, ứng dụng sẽ tự động kết nối.');
      bridge.openExternalBrowser(WEB_AUTH_PORTAL_URL);
    } else {
      window.open(WEB_AUTH_PORTAL_URL, '_blank');
    }
  };

  const handleConnectWithTokenCode = async () => {
    if (!tokenInputStr.trim()) return;
    setIsDriveLoading(true);
    setDriveStatus('Đang xác thực Mã Kết Nối Google Drive...');
    try {
      const res = await connectWithExternalToken(tokenInputStr);
      setUser(res.user);
      setTokenInputStr('');
      setShowTokenInput(false);
      setDriveStatus('✓ Đã kết nối Google Drive thành công bằng Mã Kết Nối!');
      await fetchRecentBackups(res.accessToken);
    } catch (err: any) {
      setDriveStatus(`Lỗi Mã Kết Nối: ${err.message}`);
    } finally {
      setIsDriveLoading(false);
    }
  };

  const handleCopyBridgeCode = async () => {
    let token = await getAccessToken();
    if (!token) {
      try {
        setIsDriveLoading(true);
        setDriveStatus('Phiên đã hết hạn, đang làm mới mã xác thực trước khi sao chép...');
        const res = await googleSignIn(false);
        setUser(res.user);
        token = res.accessToken;
      } catch (err: any) {
        setUser(null);
        setDriveStatus(`Vui lòng đăng nhập lại để lấy Mã Kết Nối mới: ${err.message}`);
        return;
      } finally {
        setIsDriveLoading(false);
      }
    }
    const code = generateApkAuthBridgeCode();
    if (!code) return;
    navigator.clipboard.writeText(code);
    setCopiedBridgeCode(true);
    setDriveStatus('✓ Đã sao chép Mã Kết Nối mới vào bộ nhớ tạm! Hãy mở App/PWA và bấm "Nhập Mã Kết Nối".');
    setTimeout(() => setCopiedBridgeCode(false), 3500);
  };

  const handleLogoutDrive = async () => {
    await logoutGoogle();
    setUser(null);
    setRecentBackups([]);
    setDriveStatus('Đã đăng xuất khỏi Google Drive.');
  };

  // Upload Excel backup with timestamp to Backup_QLVB_Pro folder
  const handleUploadBackupToDrive = async () => {
    let token = await getAccessToken();
    if (!token) {
      try {
        setIsDriveLoading(true);
        const res = await googleSignIn();
        setUser(res.user);
        token = res.accessToken;
      } catch (err: any) {
        const msg = String(err?.message || '');
        if (msg === 'REDIRECTING_TO_GOOGLE' || msg === 'REDIRECTING_TO_PORTAL') {
          setDriveStatus('Đang chuyển tới trang chọn tài khoản Google...');
          return;
        }
        setUser(null);
        setDriveStatus(`Đăng nhập bị hủy hoặc thất bại: ${msg}`);
        return;
      } finally {
        setIsDriveLoading(false);
      }
    }

    setIsDriveLoading(true);
    setIsUploadingDrive(true);
    setDriveStatus('Đang tạo tệp Excel từ cơ sở dữ liệu hiện tại...');
    try {
      const excelBlob = exportToExcelBlob(appState);
      let uploadedFile: DriveBackupFile;
      try {
        uploadedFile = await uploadExcelBackupToDrive(excelBlob, token, (msg) => {
          setDriveStatus(msg);
        });
      } catch (firstErr: any) {
        if (firstErr?.isAuthError || String(firstErr?.message || '').includes('401')) {
          setDriveStatus('Phiên Google Drive đã hết hạn, đang làm mới xác thực...');
          const freshAuth = await googleSignIn(false);
          setUser(freshAuth.user);
          token = freshAuth.accessToken;
          uploadedFile = await uploadExcelBackupToDrive(excelBlob, token, (msg) => {
            setDriveStatus(msg);
          });
        } else {
          throw firstErr;
        }
      }

      markWeeklyBackupCompleted();
      setImportStatus({
        type: 'success',
        message: `Đã sao lưu thành công tệp "${uploadedFile.name}" vào thư mục Backup_QLVB_Pro trên Google Drive!`,
      });
      // Refresh list
      await fetchRecentBackups(token);
    } catch (err: any) {
      if (err?.isAuthError) {
        setUser(null);
      }
      setDriveStatus(`Lỗi tải lên: ${err.message}`);
      setImportStatus({
        type: 'error',
        message: `Lỗi sao lưu lên Drive: ${err.message}`,
      });
    } finally {
      setIsDriveLoading(false);
      setIsUploadingDrive(false);
    }
  };

  // Restore data from a selected Drive backup file
  const handleConfirmRestore = async () => {
    if (!restoreModalFile) return;

    let token = await getAccessToken();
    if (!token) {
      try {
        const freshAuth = await googleSignIn(false);
        setUser(freshAuth.user);
        token = freshAuth.accessToken;
      } catch (err: any) {
        setUser(null);
        setImportStatus({
          type: 'error',
          message: `Phiên đăng nhập Google đã hết hạn. Vui lòng đăng nhập lại: ${err.message}`,
        });
        return;
      }
    }

    setIsRestoring(true);
    try {
      let arrayBuffer: ArrayBuffer;
      try {
        arrayBuffer = await downloadBackupFromDrive(token, restoreModalFile.id);
      } catch (firstErr: any) {
        if (firstErr?.isAuthError) {
          const freshAuth = await googleSignIn(false);
          setUser(freshAuth.user);
          token = freshAuth.accessToken;
          arrayBuffer = await downloadBackupFromDrive(token, restoreModalFile.id);
        } else {
          throw firstErr;
        }
      }

      const result = await importFromExcelBuffer(arrayBuffer, appState, restoreOverwrite);

      if (result.success && result.data) {
        onUpdateState(result.data);
        setImportStatus({
          type: 'success',
          message: `Khôi phục thành công từ bản sao lưu "${restoreModalFile.name}"! (${result.stats.documents} văn bản, ${result.stats.reports} báo cáo, ${result.stats.schedules} lịch).`,
        });
        setRestoreModalFile(null);
      } else {
        throw new Error(result.message || 'Không thể xử lý dữ liệu từ tệp');
      }
    } catch (err: any) {
      if (err?.isAuthError) setUser(null);
      setImportStatus({
        type: 'error',
        message: `Lỗi khôi phục dữ liệu: ${err.message}`,
      });
    } finally {
      setIsRestoring(false);
    }
  };

  // Download a Drive backup file directly to local device
  const handleDownloadDriveFileToDevice = async (file: DriveBackupFile) => {
    let preDirHandle: any = null;
    try {
      preDirHandle = await ensurePcQlvbDirectoryHandle(false);
    } catch (dirErr: any) {
      if (dirErr?.name === 'AbortError' || dirErr?.isUserCancelled) return;
    }

    let token = await getAccessToken();
    if (!token) {
      try {
        const freshAuth = await googleSignIn(false);
        setUser(freshAuth.user);
        token = freshAuth.accessToken;
      } catch (err: any) {
        setUser(null);
        setImportStatus({
          type: 'error',
          message: `Vui lòng đăng nhập lại Google Drive để tải tệp: ${err.message}`,
        });
        return;
      }
    }

    setIsDownloadingFileId(file.id);
    try {
      let arrayBuffer: ArrayBuffer;
      try {
        arrayBuffer = await downloadBackupFromDrive(token, file.id);
      } catch (firstErr: any) {
        if (firstErr?.isAuthError) {
          const freshAuth = await googleSignIn(false);
          setUser(freshAuth.user);
          token = freshAuth.accessToken;
          arrayBuffer = await downloadBackupFromDrive(token, file.id);
        } else {
          throw firstErr;
        }
      }

      const { targetPath } = await saveArrayBufferToQlvbFolder(
        arrayBuffer,
        file.name,
        undefined,
        preDirHandle
      );
      setImportStatus({
        type: 'info',
        message: `Đã lưu bản sao lưu vào "${targetPath}" trên thiết bị.`,
      });
    } catch (err: any) {
      if (err?.isUserCancelled) return;
      if (err?.isAuthError) setUser(null);
      setImportStatus({
        type: 'error',
        message: `Lỗi khi tải tệp về máy: ${err.message}`,
      });
    } finally {
      setIsDownloadingFileId(null);
    }
  };

  // Local Excel upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    setImportStatus({ type: null, message: '' });

    try {
      const result = await importFromExcel(file, appState, overwriteMode);
      if (result.success && result.data) {
        onUpdateState(result.data);
        playSuccessChime();
        notifyAndroidNative(
          'K02 Mobile - Khôi phục thành công',
          `Đã nhập ${result.stats.documents} văn bản, ${result.stats.reports} báo cáo từ "${file.name}"`
        );
        setImportStatus({
          type: 'success',
          message: `Đã nhập thành công từ file Excel "${file.name}"! (${result.stats.documents} văn bản, ${result.stats.reports} báo cáo, ${result.stats.schedules} lịch)`,
        });
      } else {
        throw new Error(result.message || 'Nhập file không thành công');
      }
    } catch (error: any) {
      playAlertChime();
      setImportStatus({
        type: 'error',
        message: `Lỗi khi nhập dữ liệu: ${error.message || 'File Excel không đúng định dạng chuẩn K02'}`,
      });
    } finally {
      setIsProcessing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Local Excel export
  const handleExportExcel = async () => {
    try {
      let preDirHandle: any = null;
      try {
        preDirHandle = await ensurePcQlvbDirectoryHandle(false);
      } catch (dirErr: any) {
        if (dirErr?.name === 'AbortError' || dirErr?.isUserCancelled) return;
      }

      const timestamp = getExportTimestampPrefix();
      const filename = `${timestamp}_documents.xlsx`;
      const { count, exportResult } = await exportToExcel(appState, filename, preDirHandle);
      await refreshQlvbFolderStatus();
      const targetPath = exportResult.targetPath || `${QLVB_EXPORT_PATH_LABEL}/${filename}`;
      markWeeklyBackupCompleted();
      playSuccessChime();
      notifyAndroidNative(
        'K02 Mobile - Xuất Excel thành công',
        `Đã lưu: ${targetPath} (${count} văn bản)`
      );
      setImportStatus({
        type: 'success',
        message: exportResult.isIframeFallback
          ? `✓ Đã tải xuống "${filename}" (${count} văn bản).\n(Lưu ý: Bạn đang dùng khung xem trước AI Studio. Hãy mở ứng dụng ở tab trình duyệt PC riêng để tự động tạo thư mục con Download/QLVB_PRO)`
          : exportResult.createdSubfolder
          ? `✓ Đã xuất thành công ${count} văn bản!\n📁 Đã tạo & lưu tại: ${targetPath}`
          : `✓ Đã tải xuống "${filename}" (${count} văn bản) vào thư mục Download của trình duyệt.`,
      });
    } catch (error: any) {
      if (error?.isUserCancelled) return;
      playAlertChime();
      setImportStatus({
        type: 'error',
        message: `Lỗi khi xuất dữ liệu: ${error.message}`,
      });
    }
  };

  const handleExportJSON = async () => {
    try {
      let preDirHandle: any = null;
      try {
        preDirHandle = await ensurePcQlvbDirectoryHandle(false);
      } catch (dirErr: any) {
        if (dirErr?.name === 'AbortError' || dirErr?.isUserCancelled) return;
      }

      const jsonStr = JSON.stringify(appState, null, 2);
      const timestamp = getExportTimestampPrefix();
      const filename = `${timestamp}_k02_backup.json`;
      const { targetPath, createdSubfolder, isIframeFallback } = await saveTextToQlvbFolder(
        jsonStr,
        filename,
        'application/json',
        preDirHandle
      );
      await refreshQlvbFolderStatus();
      markWeeklyBackupCompleted();

      playSuccessChime();
      notifyAndroidNative(
        'K02 Mobile - Sao lưu JSON thành công',
        `Đã lưu: ${targetPath}`
      );
      setImportStatus({
        type: 'success',
        message: isIframeFallback
          ? `✓ Đã tải file sao lưu "${filename}".\n(Lưu ý: Bạn đang dùng khung xem trước AI Studio. Hãy mở ứng dụng ở tab trình duyệt PC riêng để tự động tạo thư mục con Download/QLVB_PRO)`
          : createdSubfolder
          ? `✓ Đã xuất file sao lưu JSON thành công!\n📁 Đã tạo & lưu tại: ${targetPath}`
          : `✓ Đã tải file sao lưu "${filename}" vào thư mục Download của trình duyệt.`,
      });
    } catch (error: any) {
      if (error?.isUserCancelled) return;
      playAlertChime();
      setImportStatus({ type: 'error', message: `Lỗi: ${error.message}` });
    }
  };

  const handleResetSampleData = () => {
    if (window.confirm('Bạn có chắc chắn muốn đặt lại dữ liệu mẫu ban đầu? Toàn bộ dữ liệu hiện tại sẽ được thay thế bằng danh mục mẫu chuẩn K02.')) {
      const initial = generateInitialData();
      onUpdateState(initial);
      playSuccessChime();
      notifyAndroidNative('K02 Mobile', 'Đã đặt lại dữ liệu mẫu K02 ban đầu');
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

  const formatFileSize = (bytesStr?: string) => {
    if (!bytesStr) return '';
    const bytes = parseInt(bytesStr, 10);
    if (isNaN(bytes)) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDateTime = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleString('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="pb-24 pt-3 px-3.5 max-w-4xl mx-auto space-y-4">
      {/* Title */}
      <div>
        <h2 className="text-base font-bold text-slate-800 tracking-tight flex items-center gap-2">
          <span>ĐỒNG BỘ & SAO LƯU DỮ LIỆU</span>
        </h2>
        <p className="text-xs text-slate-500 font-medium">
          Sao lưu dữ liệu hai chiều với Google Drive (Thư mục <code>Backup_QLVB_Pro</code>) hoặc trao đổi tệp Excel với máy tính PC
        </p>
      </div>

      {/* Floating Status Notification Toast (Always visible regardless of scroll) */}
      {importStatus.type && (
        <div
          className="fixed left-3 right-3 max-w-lg mx-auto z-50 animate-bounce-in shadow-2xl pointer-events-auto"
          style={{ top: 'max(3.8rem, calc(env(safe-area-inset-top, 0px) + 3.8rem))' }}
        >
          <div
            className={`p-3.5 rounded-2xl border text-xs flex items-start gap-2.5 backdrop-blur-md shadow-2xl overflow-hidden ${
              importStatus.type === 'success'
                ? 'bg-slate-900/95 border-emerald-400 text-emerald-100'
                : importStatus.type === 'info'
                ? 'bg-slate-900/95 border-blue-400 text-blue-100'
                : 'bg-slate-900/95 border-rose-400 text-rose-100'
            }`}
          >
            {importStatus.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            ) : importStatus.type === 'info' ? (
              <CheckCircle2 className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            )}
            <div className="flex-1 min-w-0 font-semibold leading-relaxed break-words break-all [overflow-wrap:anywhere] whitespace-pre-line">
              {importStatus.message}
            </div>
            <button
              onClick={() => setImportStatus({ type: null, message: '' })}
              className="text-xs font-black p-1 hover:bg-white/20 rounded-lg text-white shrink-0 ml-1"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Top Status banner */}
      {importStatus.type && (
        <div
          className={`p-3.5 rounded-2xl border text-xs flex items-start gap-2.5 animate-fadeIn overflow-hidden ${
            importStatus.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : importStatus.type === 'info'
              ? 'bg-blue-50 border-blue-200 text-blue-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          {importStatus.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          ) : importStatus.type === 'info' ? (
            <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          )}
          <div className="flex-1 min-w-0 font-medium break-words break-all [overflow-wrap:anywhere] whitespace-pre-line">
            {importStatus.message}
          </div>
          <button
            onClick={() => setImportStatus({ type: null, message: '' })}
            className="text-xs font-bold opacity-60 hover:opacity-100 shrink-0 ml-1"
          >
            ✕
          </button>
        </div>
      )}

      {/* Main Google Drive Backup & Sync Card */}
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
          Tự động đồng bộ các bản sao lưu Excel <code>YYYYMMDD_HHmmss_documents.xlsx</code> vào thư mục <strong>Backup_QLVB_Pro</strong> trên Google Drive. Bạn có thể chọn khôi phục nhanh ngược về ứng dụng bất cứ lúc nào.
        </p>

        {/* User Auth Bar */}
        <div className="p-3 bg-white rounded-2xl border border-blue-200/80 space-y-2.5">
          {user ? (
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
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

                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    onClick={() => handleConnectDrive(true)}
                    disabled={isDriveLoading}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 text-[11px] font-semibold transition"
                    title="Cấp quyền đọc tệp từ các thiết bị khác trên Google Drive"
                  >
                    <FolderSync className="w-3.5 h-3.5" />
                    <span>Đồng bộ đa thiết bị</span>
                  </button>
                  <button
                    onClick={handleLogoutDrive}
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
                        href={generatePwaReturnUrl(pwaOriginParam) || '#'}
                        className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-[11px] flex items-center gap-1 shadow-xs transition"
                      >
                        <ExternalLink className="w-3 h-3" />
                        <span>Quay về ứng dụng PWA</span>
                      </a>
                    )}
                    <a
                      href={generateApkDeepLink(false) || '#'}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] flex items-center gap-1 shadow-xs transition"
                    >
                      <ExternalLink className="w-3 h-3" />
                      <span>Kết nối vào App APK</span>
                    </a>
                    <button
                      onClick={handleCopyBridgeCode}
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
                      Cổng xác thực Google Drive K02 PRO: Bấm nút bên phải để chọn tài khoản Google và tự động quay về ứng dụng:
                    </span>
                  ) : (
                    'Chưa kết nối Google Drive. Chọn phương thức đăng nhập để tự động sao lưu & khôi phục dữ liệu:'
                  )}
                </div>
                <button
                  onClick={() => handleConnectDrive(false)}
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
                    <svg className="w-4 h-4 shrink-0 bg-white rounded-full p-0.5" viewBox="0 0 24 24">
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
                  onClick={handleConnectDriveRedirect}
                  disabled={isDriveLoading}
                  className="w-full sm:w-auto justify-center flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 font-bold text-[11px] transition"
                >
                  <svg className="w-4 h-4 shrink-0" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <defs>
                      <radialGradient id="ieBlueBody" cx="35%" cy="28%" r="70%">
                        <stop offset="0%" stopColor="#8CE4FF" />
                        <stop offset="35%" stopColor="#1B8CEB" />
                        <stop offset="75%" stopColor="#0050A8" />
                        <stop offset="100%" stopColor="#002359" />
                      </radialGradient>
                      <linearGradient id="ieGloss" x1="20" y1="8" x2="36" y2="32" gradientUnits="userSpaceOnUse">
                        <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.65" />
                        <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
                      </linearGradient>
                      <linearGradient id="ieGoldOrbit" x1="6" y1="54" x2="58" y2="10" gradientUnits="userSpaceOnUse">
                        <stop offset="0%" stopColor="#D97706" />
                        <stop offset="35%" stopColor="#FBBF24" />
                        <stop offset="65%" stopColor="#FEF08A" />
                        <stop offset="100%" stopColor="#D97706" />
                      </linearGradient>
                    </defs>
                    {/* Back upper-left green/yellow glow of the orbit ring */}
                    <path
                      d="M12 37C17 24 31 12 45 9"
                      stroke="#A3E635"
                      strokeWidth="4.2"
                      strokeLinecap="round"
                      opacity="0.7"
                    />
                    {/* Classic thick 3D lowercase 'e' with upper eye cutout and bottom-right opening */}
                    <path
                      fillRule="evenodd"
                      clipRule="evenodd"
                      d="M33 8C18.64 8 8 18.75 8 32.5C8 46.25 18.64 56 33.2 56C43.5 56 51.8 50.8 55.6 42.5H42.2C39.9 45.6 36.8 47.2 33 47.2C25.4 47.2 20.2 42.3 19.6 35.2H56.5V30.8C56.5 17.5 46.6 8 33 8ZM20.2 26.8C21.2 20.4 26.2 16.2 32.8 16.2C39.4 16.2 44.3 20.4 45.1 26.8H20.2Z"
                      fill="url(#ieBlueBody)"
                      stroke="#001E4D"
                      strokeWidth="1.2"
                    />
                    {/* Top 3D specular highlight on 'e' */}
                    <path
                      d="M15 23C18.5 14.5 25.5 10.5 33.5 10.5C41 10.5 47.5 14 51 21"
                      stroke="url(#ieGloss)"
                      strokeWidth="3.5"
                      strokeLinecap="round"
                    />
                    {/* Iconic diagonal golden swoosh ring orbiting from bottom-left to top-right */}
                    <path
                      d="M37 54.5C22.5 59.5 9.5 58.5 6.8 52.2C4.2 46.2 13.5 33.2 29.5 22.2C45.5 11.2 58.8 6.5 60.5 12.2C61.6 15.8 58.2 21.5 52 27.2"
                      stroke="url(#ieGoldOrbit)"
                      strokeWidth="4.2"
                      strokeLinecap="round"
                    />
                  </svg>
                  <span>Đăng nhập qua Trình duyệt</span>
                </button>

                <button
                  onClick={() => setShowTokenInput((prev) => !prev)}
                  disabled={isDriveLoading}
                  className="w-full sm:w-auto justify-center flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 font-bold text-[11px] transition"
                >
                  <KeyRound className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                  <span>Nhập Mã Kết Nối</span>
                </button>

                {isDriveLoading && (
                  <button
                    type="button"
                    onClick={() => {
                      cancelPendingPortalPopup();
                      setIsDriveLoading(false);
                      setDriveStatus('Đã hủy thao tác chờ. Bạn có thể bấm đăng nhập lại.');
                    }}
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
                      onClick={handleOpenChromeLogin}
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
                      onChange={(e) => setTokenInputStr(e.target.value)}
                      placeholder="Dán Mã Kết Nối (Base64 hoặc URL) vào đây..."
                      className="w-full min-w-0 sm:flex-1 px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      onClick={handleConnectWithTokenCode}
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
              onClick={handleUploadBackupToDrive}
              disabled={isDriveLoading || isUploadingDrive}
              className="flex-1 min-w-[220px] flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs transition active:scale-95 disabled:opacity-50"
            >
              <Upload className="w-4 h-4" />
              <span>{isUploadingDrive ? 'Đang sao lưu lên Drive...' : 'Sao lưu ngay lên Google Drive (Backup_QLVB_Pro)'}</span>
            </button>

            {user && (
              <button
                onClick={() => fetchRecentBackups()}
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
              <p className="text-[11px]">Bấm nút <strong>"Sao lưu ngay lên Google Drive"</strong> hoặc bấm <strong>"Đồng bộ đa thiết bị"</strong> để cấp quyền quét tệp từ máy khác.</p>
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
                    {/* Restore button */}
                    <button
                      onClick={() => {
                        setRestoreModalFile(file);
                        setRestoreOverwrite(false);
                      }}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs transition active:scale-95"
                      title="Khôi phục dữ liệu từ bản sao lưu này"
                    >
                      <HardDriveDownload className="w-3.5 h-3.5" />
                      <span>Khôi phục</span>
                    </button>

                    {/* Download to device */}
                    <button
                      onClick={() => handleDownloadDriveFileToDevice(file)}
                      disabled={isDownloadingFileId === file.id}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium transition active:scale-95 disabled:opacity-50"
                      title="Tải tệp Excel này về máy"
                    >
                      <ArrowDownToLine className="w-3.5 h-3.5 text-slate-600" />
                      <span>{isDownloadingFileId === file.id ? 'Đang tải...' : 'Tải về'}</span>
                    </button>

                    {/* Open link on Google Drive if available */}
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

      {/* Confirmation Modal for Restore */}
      {restoreModalFile && (
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
                Tệp: {restoreModalFile.name}
              </div>
              <div className="text-slate-500 text-[11px]">
                Thời gian sao lưu: {formatDateTime(restoreModalFile.createdTime)} {restoreModalFile.size && `(${formatFileSize(restoreModalFile.size)})`}
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
                    checked={!restoreOverwrite}
                    onChange={() => setRestoreOverwrite(false)}
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
                    checked={restoreOverwrite}
                    onChange={() => setRestoreOverwrite(true)}
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
                onClick={() => setRestoreModalFile(null)}
                disabled={isRestoring}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition"
              >
                Hủy bỏ
              </button>
              <button
                onClick={handleConfirmRestore}
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
      )}

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
                onChange={(e) => setOverwriteMode(e.target.checked)}
                className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4 mt-0.5 shrink-0"
              />
              <span className="leading-snug">Ghi đè toàn bộ dữ liệu (nếu không chọn, hệ thống sẽ nhập gộp và cập nhật)</span>
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
              Xuất toàn bộ {appState.documents.length} văn bản và {appState.reports.length} kỳ báo cáo ra file Excel 9 sheet chuẩn (tự động gắn tiền tố thời gian <code>YYYYMMDD_HHmmss_documents.xlsx</code>) để lưu trữ hoặc nhập vào phần mềm PC.
            </p>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={handleExportExcel}
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs active:scale-95 transition"
              >
                <Download className="w-4 h-4 shrink-0" />
                <span>Sao lưu file Excel (.xlsx)</span>
              </button>

              {typeof window !== 'undefined' &&
                !Boolean((window as any).AndroidBridge) &&
                typeof (window as any).showDirectoryPicker === 'function' &&
                window.self === window.top && (
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const dir = await ensurePcQlvbDirectoryHandle(true);
                        await refreshQlvbFolderStatus();
                        if (dir) {
                          const folderLabel = (dir as any).__displayPathPrefix || 'QLVB_PRO';
                          setImportStatus({
                            type: 'success',
                            message: `✓ Đã khởi tạo & liên kết thư mục lưu trữ: ${folderLabel}\nMọi tệp sao lưu Excel/JSON sẽ tự động lưu vào thư mục QLVB_PRO này.`,
                          });
                        }
                      } catch (err: any) {
                        if (err?.name === 'AbortError' || err?.isUserCancelled) return;
                        setImportStatus({
                          type: 'error',
                          message: `Trình duyệt chặn chọn trực tiếp gốc Downloads. Hãy tạo thư mục con tên "QLVB_PRO" trong Downloads rồi chọn thư mục đó.`,
                        });
                      }
                    }}
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
              Mẫu TEST chuẩn văn bản hành chính K02
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
          <span>Hướng dẫn đồng bộ dữ liệu giữa Google Drive, PC và K02 Mobile:</span>
        </div>
        <ul className="list-disc list-inside space-y-1 text-[11px] text-blue-800/90 pl-1">
          <li><strong>Đồng bộ Google Drive:</strong> Khi bấm <em>"Sao lưu ngay lên Google Drive"</em>, hệ thống tự động tìm hoặc tạo thư mục <code>Backup_QLVB_Pro</code> trên Google Drive và lưu trữ file Excel với tên định dạng <code>YYYYMMDD_HHmmss_documents.xlsx</code>.</li>
          <li><strong>Khôi phục từ Drive:</strong> Bạn có thể xem nhanh danh sách 5 bản sao lưu gần nhất, bấm <strong>"Khôi phục"</strong> và chọn Ghi đè hoặc Nhập gộp để đồng bộ dữ liệu ngược về điện thoại.</li>
          <li><strong>Từ PC sang Android:</strong> Trên máy tính PC mở <em>Cài đặt ▾ &gt; Sao lưu Excel khôi phục...</em>. Gửi file đó sang điện thoại và chọn nhập ở <strong>Bước 1</strong>.</li>
          <li><strong>Từ Android sang PC:</strong> Bấm <strong>Bước 2</strong> để tải file Excel, sau đó chuyển file vào máy tính PC và chọn <em>Cài đặt ▾ &gt; Nhập Excel khôi phục...</em>.</li>
        </ul>
      </div>
    </div>
  );
};
