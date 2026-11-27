import React, { useState, useRef, useEffect } from 'react';
import { showConfirm, showToast } from './AppFeedback';
import { CheckCircle2, AlertCircle } from 'lucide-react';
import { DriveBackupCard } from './sync/DriveBackupCard';
import { DriveRestoreModal } from './sync/DriveRestoreModal';
import { LocalBackupSection } from './sync/LocalBackupSection';
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
  const [avatarError, setAvatarError] = useState(false);
  const [isDriveLoading, setIsDriveLoading] = useState(false);
  const [isUploadingDrive, setIsUploadingDrive] = useState(false);
  const [driveStatus, setDriveStatus] = useState<string>('');
  const [recentBackups, setRecentBackups] = useState<DriveBackupFile[]>([]);
  const [isLoadingBackups, setIsLoadingBackups] = useState(false);

  useEffect(() => {
    setAvatarError(false);
  }, [user?.photoURL]);

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
        setDriveStatus('✓ Đã xác thực thành công! Đang mở lại ứng dụng QLVB PRO...');
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
          'QLVB Mobile - Khôi phục thành công',
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
        message: `Lỗi khi nhập dữ liệu: ${error.message || 'File Excel không đúng định dạng chuẩn'}`,
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
        'QLVB Mobile - Xuất Excel thành công',
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
        'QLVB Mobile - Sao lưu JSON thành công',
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

  const handleResetSampleData = async () => {
    const confirmed = await showConfirm({
      title: 'Đặt lại dữ liệu mẫu',
      message:
        'Bạn có chắc chắn muốn đặt lại dữ liệu mẫu ban đầu? Toàn bộ dữ liệu hiện tại sẽ được thay thế bằng danh mục mẫu.',
      confirmText: 'Đặt lại',
      cancelText: 'Hủy',
      danger: true,
    });
    if (confirmed) {
      const initial = generateInitialData();
      onUpdateState(initial);
      playSuccessChime();
      notifyAndroidNative('QLVB Mobile', 'Đã đặt lại dữ liệu mẫu QLVB ban đầu');
      showToast('Đã đặt lại dữ liệu mẫu QLVB ban đầu thành công.', 'success');
      setImportStatus({
        type: 'success',
        message: 'Đã đặt lại dữ liệu mẫu QLVB ban đầu thành công!',
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
          setImportStatus({ type: 'error', message: 'Tệp JSON không đúng cấu trúc.' });
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

  const handlePickPcQlvbFolder = async () => {
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
      <DriveBackupCard
        user={user}
        avatarError={avatarError}
        onAvatarError={() => setAvatarError(true)}
        isApkMode={isApkMode}
        isApkAuthPortal={isApkAuthPortal}
        pwaOriginParam={pwaOriginParam}
        pwaReturnUrl={pwaOriginParam ? generatePwaReturnUrl(pwaOriginParam) || '#' : '#'}
        apkDeepLink={generateApkDeepLink(false) || '#'}
        isDriveLoading={isDriveLoading}
        isUploadingDrive={isUploadingDrive}
        isLoadingBackups={isLoadingBackups}
        isDownloadingFileId={isDownloadingFileId}
        driveStatus={driveStatus}
        recentBackups={recentBackups}
        showTokenInput={showTokenInput}
        tokenInputStr={tokenInputStr}
        copiedBridgeCode={copiedBridgeCode}
        onToggleTokenInput={() => setShowTokenInput((prev) => !prev)}
        onTokenInputChange={setTokenInputStr}
        onConnectDrive={handleConnectDrive}
        onConnectDriveRedirect={handleConnectDriveRedirect}
        onLogoutDrive={handleLogoutDrive}
        onCancelPendingAuth={() => {
          cancelPendingPortalPopup();
          setIsDriveLoading(false);
          setDriveStatus('Đã hủy thao tác chờ. Bạn có thể bấm đăng nhập lại.');
        }}
        onCopyBridgeCode={handleCopyBridgeCode}
        onOpenChromeLogin={handleOpenChromeLogin}
        onConnectWithTokenCode={handleConnectWithTokenCode}
        onUploadBackupToDrive={handleUploadBackupToDrive}
        onRefreshBackups={() => fetchRecentBackups()}
        onSelectRestoreFile={(file) => {
          setRestoreModalFile(file);
          setRestoreOverwrite(false);
        }}
        onDownloadDriveFile={handleDownloadDriveFileToDevice}
        formatDateTime={formatDateTime}
        formatFileSize={formatFileSize}
      />

      {/* Confirmation Modal for Restore */}
      <DriveRestoreModal
        file={restoreModalFile}
        overwrite={restoreOverwrite}
        isRestoring={isRestoring}
        onOverwriteChange={setRestoreOverwrite}
        onClose={() => setRestoreModalFile(null)}
        onConfirm={handleConfirmRestore}
        formatDateTime={formatDateTime}
        formatFileSize={formatFileSize}
      />

      {/* Local Excel, JSON Backup & Guide Section */}
      <LocalBackupSection
        documentsCount={appState.documents.length}
        reportsCount={appState.reports.length}
        overwriteMode={overwriteMode}
        isProcessing={isProcessing}
        qlvbFolderReady={qlvbFolderReady}
        importStatus={importStatus}
        fileInputRef={fileInputRef}
        jsonInputRef={jsonInputRef}
        onOverwriteModeChange={setOverwriteMode}
        onFileUpload={handleFileUpload}
        onExportExcel={handleExportExcel}
        onPickPcQlvbFolder={handlePickPcQlvbFolder}
        onExportJSON={handleExportJSON}
        onJSONUpload={handleJSONUpload}
        onResetSampleData={handleResetSampleData}
      />
    </div>
  );
};
