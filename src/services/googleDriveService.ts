import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signInWithCredential,
  GoogleAuthProvider,
  onAuthStateChanged,
  User,
  signOut
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);

const TOKEN_STORAGE_KEY = 'k02_gdrive_access_token';
const ID_TOKEN_STORAGE_KEY = 'k02_gdrive_id_token';
const USER_FALLBACK_KEY = 'k02_gdrive_user_profile';
const SCOPE_VERSION_KEY = 'k02_gdrive_scope_v2';

export const WEB_AUTH_PORTAL_URL =
  'https://ais-pre-zi5n6oemfk3n5aykcoslbd-383593929664.asia-east1.run.app/?apk_auth=1';

const provider = new GoogleAuthProvider();
// Full Drive scope is required to detect folders & backup files uploaded from other devices / PC / Web Drive
provider.addScope('https://www.googleapis.com/auth/drive');
provider.addScope('https://www.googleapis.com/auth/drive.file');

let isSigningIn = false;
let cachedAccessToken: string | null =
  typeof window !== 'undefined'
    ? localStorage.getItem(TOKEN_STORAGE_KEY) || sessionStorage.getItem(TOKEN_STORAGE_KEY)
    : null;
let cachedIdToken: string | null =
  typeof window !== 'undefined'
    ? localStorage.getItem(ID_TOKEN_STORAGE_KEY)
    : null;

function saveTokens(accessToken: string, idToken?: string | null, profile?: { email?: string | null; displayName?: string | null; photoURL?: string | null }) {
  cachedAccessToken = accessToken;
  if (idToken) cachedIdToken = idToken;
  if (typeof window !== 'undefined') {
    localStorage.setItem(TOKEN_STORAGE_KEY, accessToken);
    sessionStorage.setItem(TOKEN_STORAGE_KEY, accessToken);
    localStorage.setItem(SCOPE_VERSION_KEY, 'true');
    if (idToken) {
      localStorage.setItem(ID_TOKEN_STORAGE_KEY, idToken);
    }
    if (profile) {
      localStorage.setItem(USER_FALLBACK_KEY, JSON.stringify(profile));
    }
  }
}

export function getSavedUserProfile(): User | null {
  if (auth.currentUser) return auth.currentUser;
  if (typeof window === 'undefined' || !cachedAccessToken) return null;
  try {
    const raw = localStorage.getItem(USER_FALLBACK_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return {
      uid: parsed.email || 'apk-user',
      email: parsed.email || 'Đã kết nối Google Drive',
      displayName: parsed.displayName || 'Tài khoản Google Drive',
      photoURL: parsed.photoURL || null,
    } as unknown as User;
  } catch {
    return null;
  }
}

// Initialize auth state listener + handle redirect result & APK deep link
export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  if (typeof window !== 'undefined') {
    getRedirectResult(auth)
      .then((result) => {
        if (result && result.user) {
          const credential = GoogleAuthProvider.credentialFromResult(result);
          if (credential?.accessToken) {
            saveTokens(credential.accessToken, credential.idToken, {
              email: result.user.email,
              displayName: result.user.displayName,
              photoURL: result.user.photoURL,
            });
            if (onAuthSuccess) onAuthSuccess(result.user, credential.accessToken);
          }
        }
      })
      .catch((err) => {
        console.warn('Redirect result check:', err);
      });
  }

  return onAuthStateChanged(auth, async (user: User | null) => {
    const hasV2Scope = typeof window !== 'undefined' && localStorage.getItem(SCOPE_VERSION_KEY) === 'true';
    if (user && cachedAccessToken && hasV2Scope) {
      if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
    } else if (!user && cachedAccessToken) {
      const fallbackUser = getSavedUserProfile();
      if (fallbackUser && onAuthSuccess) {
        onAuthSuccess(fallbackUser, cachedAccessToken);
      }
    } else if (!isSigningIn) {
      cachedAccessToken = null;
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem(TOKEN_STORAGE_KEY);
        localStorage.removeItem(TOKEN_STORAGE_KEY);
      }
      if (onAuthFailure) onAuthFailure();
    }
  });
};

export const getPwaAuthPortalUrl = (): string => {
  if (typeof window === 'undefined') return WEB_AUTH_PORTAL_URL;
  const cleanOriginUrl = `${window.location.origin}${window.location.pathname}`;
  return `${WEB_AUTH_PORTAL_URL}&pwa_origin=${encodeURIComponent(cleanOriginUrl)}`;
};

export const generatePwaReturnUrl = (pwaOrigin: string): string | null => {
  const code = generateApkAuthBridgeCode();
  if (!code || !pwaOrigin) return null;
  try {
    const returnUrl = new URL(pwaOrigin);
    returnUrl.searchParams.set('code', code);
    returnUrl.searchParams.set('tab', 'sync');
    return returnUrl.toString();
  } catch {
    const sep = pwaOrigin.includes('?') ? '&' : '?';
    return `${pwaOrigin}${sep}code=${encodeURIComponent(code)}&tab=sync`;
  }
};

const signInViaAuthorizedPortalPopup = (): Promise<{ user: User; accessToken: string }> => {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('Môi trường không hỗ trợ cửa sổ xác thực.'));
      return;
    }

    const portalUrl = getPwaAuthPortalUrl();
    const width = 520;
    const height = 680;
    const left = Math.max(0, Math.round(window.screenX + (window.outerWidth - width) / 2));
    const top = Math.max(0, Math.round(window.screenY + (window.outerHeight - height) / 2));

    const popup = window.open(
      portalUrl,
      'k02_pwa_google_auth',
      `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`
    );

    // If popup was blocked by browser (e.g. mobile standalone PWA), redirect in same tab
    if (!popup) {
      window.location.href = portalUrl;
      return;
    }

    let settled = false;
    const cleanup = () => {
      window.removeEventListener('message', onMessage);
      clearInterval(checkClosedTimer);
    };

    const onMessage = async (event: MessageEvent) => {
      if (event.data && event.data.type === 'K02_AUTH_BRIDGE_CODE' && typeof event.data.code === 'string') {
        settled = true;
        cleanup();
        try {
          if (!popup.closed) popup.close();
        } catch {
          // Ignore popup close error
        }
        try {
          const res = await connectWithExternalToken(event.data.code);
          resolve(res);
        } catch (err) {
          reject(err);
        }
      }
    };

    window.addEventListener('message', onMessage);

    const checkClosedTimer = setInterval(() => {
      if (popup.closed && !settled) {
        settled = true;
        cleanup();
        reject(new Error('Đã đóng cửa sổ xác thực trước khi hoàn tất đăng nhập.'));
      }
    }, 800);
  });
};

export const googleSignIn = async (forceConsent = false): Promise<{ user: User; accessToken: string }> => {
  try {
    isSigningIn = true;
    const hasV2Scope = typeof window !== 'undefined' && localStorage.getItem(SCOPE_VERSION_KEY) === 'true';
    if (forceConsent || !hasV2Scope) {
      provider.setCustomParameters({ prompt: 'consent' });
    } else {
      provider.setCustomParameters({});
    }

    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Không thể lấy mã truy cập Google Drive từ xác thực.');
    }

    saveTokens(credential.accessToken, credential.idToken, {
      email: result.user.email,
      displayName: result.user.displayName,
      photoURL: result.user.photoURL,
    });
    return { user: result.user, accessToken: credential.accessToken };
  } catch (error: any) {
    const isUnauthorizedDomain =
      error?.code === 'auth/unauthorized-domain' ||
      String(error?.message || '').includes('auth/unauthorized-domain');
    const isApkWebView = typeof window !== 'undefined' && Boolean((window as any).AndroidBridge);

    if (isUnauthorizedDomain && !isApkWebView) {
      console.info('Domain not in Firebase authorizedDomains, falling back to authorized portal popup...');
      return await signInViaAuthorizedPortalPopup();
    }

    console.error('Google Sign-in error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

/**
 * Direct same-window redirect sign-in (works in Android WebView on https://gen-lang-client-0383399711.firebaseapp.com without popups,
 * and falls back to the authorized portal redirect when running on external PWA domains like GitHub Pages)
 */
export const googleSignInRedirect = async (): Promise<void> => {
  try {
    isSigningIn = true;
    provider.setCustomParameters({ prompt: 'select_account' });
    await signInWithRedirect(auth, provider);
  } catch (error: any) {
    isSigningIn = false;
    const isUnauthorizedDomain =
      error?.code === 'auth/unauthorized-domain' ||
      String(error?.message || '').includes('auth/unauthorized-domain');
    const isApkWebView = typeof window !== 'undefined' && Boolean((window as any).AndroidBridge);

    if (isUnauthorizedDomain && !isApkWebView && typeof window !== 'undefined') {
      window.location.href = getPwaAuthPortalUrl();
      return;
    }
    throw error;
  }
};

/**
 * Generate compact Base64 token code or Deep Link for connecting the Android APK from Chrome Web Browser
 */
export const generateApkAuthBridgeCode = (): string | null => {
  if (!cachedAccessToken) return null;
  const currentUser = auth.currentUser || getSavedUserProfile();
  const payload = {
    a: cachedAccessToken,
    i: cachedIdToken || '',
    e: currentUser?.email || '',
    n: currentUser?.displayName || '',
    p: currentUser?.photoURL || '',
  };
  return window.btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
};

export const generateApkDeepLink = (useIntentScheme = false): string | null => {
  const code = generateApkAuthBridgeCode();
  if (!code) return null;
  if (useIntentScheme) {
    return `intent://auth?code=${encodeURIComponent(code)}#Intent;scheme=k02qlvb;package=com.k02.qlvbpro;end`;
  }
  return `k02qlvb://auth?code=${encodeURIComponent(code)}`;
};

/**
 * Connect the APK using a Deep Link URI (k02qlvb://auth?code=...), a Base64 bridge code, or a raw OAuth access token
 */
export const connectWithExternalToken = async (
  rawInput: string
): Promise<{ user: User; accessToken: string }> => {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    throw new Error('Mã kết nối trống.');
  }

  let accessToken = '';
  let idToken = '';
  let email = '';
  let displayName = '';
  let photoURL = '';

  // 1. Check if input is a k02qlvb:// or http(s):// URL with ?code= or ?token=
  if (trimmed.startsWith('k02qlvb://') || trimmed.startsWith('intent://') || trimmed.includes('?code=') || trimmed.includes('?token=')) {
    const queryStart = trimmed.indexOf('?');
    const hashStart = trimmed.indexOf('#');
    const queryStr = queryStart !== -1
      ? trimmed.slice(queryStart + 1, hashStart !== -1 ? hashStart : undefined)
      : '';
    const params = new URLSearchParams(queryStr);
    const codeParam = params.get('code');
    if (codeParam) {
      const decodedJson = decodeURIComponent(escape(window.atob(codeParam.trim())));
      const parsed = JSON.parse(decodedJson);
      accessToken = parsed.a || '';
      idToken = parsed.i || '';
      email = parsed.e || '';
      displayName = parsed.n || '';
      photoURL = parsed.p || '';
    } else {
      accessToken = params.get('token') || params.get('accessToken') || '';
      idToken = params.get('idToken') || '';
      email = params.get('email') || '';
      displayName = params.get('name') || '';
      photoURL = params.get('photo') || '';
    }
  } else if (trimmed.startsWith('ya29.')) {
    // Raw Google OAuth2 access token
    accessToken = trimmed;
  } else {
    // Base64 encoded JSON payload
    try {
      const decodedJson = decodeURIComponent(escape(window.atob(trimmed)));
      const parsed = JSON.parse(decodedJson);
      accessToken = parsed.a || '';
      idToken = parsed.i || '';
      email = parsed.e || '';
      displayName = parsed.n || '';
      photoURL = parsed.p || '';
    } catch {
      throw new Error('Định dạng mã kết nối không hợp lệ. Vui lòng sao chép lại mã từ trình duyệt Web.');
    }
  }

  if (!accessToken) {
    throw new Error('Không tìm thấy Access Token hợp lệ trong mã kết nối.');
  }

  // Verify token against Google UserInfo or Drive About API
  try {
    const infoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (infoRes.ok) {
      const info = await infoRes.json();
      email = info.email || email;
      displayName = info.name || displayName;
      photoURL = info.picture || photoURL;
    }
  } catch {
    // Ignore userinfo error if scope only has drive
  }

  // Also sign into Firebase Auth with credential if possible
  let firebaseUser: User | null = null;
  try {
    const cred = GoogleAuthProvider.credential(idToken || null, accessToken);
    const res = await signInWithCredential(auth, cred);
    firebaseUser = res.user;
  } catch (err) {
    console.warn('signInWithCredential fallback to token profile:', err);
  }

  saveTokens(accessToken, idToken, {
    email: firebaseUser?.email || email || 'Đã kết nối Google Drive',
    displayName: firebaseUser?.displayName || displayName || 'Tài khoản Google',
    photoURL: firebaseUser?.photoURL || photoURL || null,
  });

  const finalUser = firebaseUser || getSavedUserProfile()!;
  return { user: finalUser, accessToken };
};

export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

export const logoutGoogle = async () => {
  await signOut(auth);
  cachedAccessToken = null;
  cachedIdToken = null;
  if (typeof window !== 'undefined') {
    sessionStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem(ID_TOKEN_STORAGE_KEY);
    localStorage.removeItem(USER_FALLBACK_KEY);
  }
};

export interface DriveBackupFile {
  id: string;
  name: string;
  createdTime: string;
  modifiedTime?: string;
  size?: string;
  webViewLink?: string;
  mimeType?: string;
}

export interface DriveUploadResult {
  fileId: string;
  name: string;
  webViewLink: string;
  webContentLink?: string;
}

const BACKUP_FOLDER_NAME = 'Backup_QLVB_Pro';

/**
 * Find all folders named 'Backup_QLVB_Pro' on Google Drive (across all devices)
 * or create one if none exists.
 */
export async function getBackupFolderIds(token: string): Promise<string[]> {
  const query = encodeURIComponent(
    `name = '${BACKUP_FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
  );
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,createdTime)&spaces=drive&includeItemsFromAllDrives=true&supportsAllDrives=true`,
    {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Lỗi kiểm tra thư mục ${BACKUP_FOLDER_NAME}: ${errText}`);
  }

  const data = await res.json();
  if (data.files && data.files.length > 0) {
    return data.files.map((f: { id: string }) => f.id);
  }

  // Folder does not exist, create it
  const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: BACKUP_FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder',
      description: 'Thư mục tự động sao lưu dữ liệu K02 Mobile QLVB Pro (.xlsx)',
    }),
  });

  if (!createRes.ok) {
    const errText = await createRes.text();
    throw new Error(`Lỗi tạo thư mục ${BACKUP_FOLDER_NAME}: ${errText}`);
  }

  const newFolder = await createRes.json();
  return [newFolder.id];
}

export async function getOrCreateBackupFolder(token: string): Promise<string> {
  const ids = await getBackupFolderIds(token);
  return ids[0];
}

/**
 * Upload an Excel backup file to Google Drive in the Backup_QLVB_Pro folder
 * with timestamp prefix: YYYYMMDD_HHmmss_documents.xlsx
 */
export async function uploadExcelBackupToDrive(
  excelBlob: Blob,
  token: string,
  onStatusUpdate?: (status: string) => void
): Promise<DriveBackupFile> {
  if (onStatusUpdate) onStatusUpdate('Đang kiểm tra thư mục Backup_QLVB_Pro trên Drive...');
  const folderId = await getOrCreateBackupFolder(token);

  // Generate timestamp prefix: YYYYMMDD_HHmmss_documents.xlsx
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const filename = `${timestamp}_documents.xlsx`;

  if (onStatusUpdate) onStatusUpdate(`Đang tải tệp "${filename}" lên thư mục Backup_QLVB_Pro...`);

  const metadata = {
    name: filename,
    parents: [folderId],
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    description: `Bản sao lưu dữ liệu K02 Mobile QLVB Pro tạo lúc ${now.toLocaleString('vi-VN')}`,
  };

  const boundary = '-------314159265358979323846';
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;
  const metadataContentType = 'Content-Type: application/json; charset=UTF-8\r\n\r\n';
  const mediaContentType = 'Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n';

  const multipartBody = new Blob([
    delimiter,
    metadataContentType,
    JSON.stringify(metadata),
    delimiter,
    mediaContentType,
    excelBlob,
    closeDelimiter
  ], { type: `multipart/related; boundary=${boundary}` });

  const uploadRes = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,createdTime,modifiedTime,size,webViewLink',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: multipartBody,
    }
  );

  if (!uploadRes.ok) {
    const errText = await uploadRes.text();
    throw new Error(`Lỗi tải tệp lên Google Drive: ${errText}`);
  }

  const uploadedFile: DriveBackupFile = await uploadRes.json();
  if (onStatusUpdate) onStatusUpdate(`✓ Sao lưu thành công: ${uploadedFile.name}`);
  return uploadedFile;
}

/**
 * List the 5 most recent Excel backup files across all Backup_QLVB_Pro folders
 * (including files uploaded from other phones, PC, or web browser)
 */
export async function listRecentBackups(
  token: string,
  onStatusUpdate?: (status: string) => void
): Promise<DriveBackupFile[]> {
  if (onStatusUpdate) onStatusUpdate('Đang quét thư mục Backup_QLVB_Pro trên toàn bộ Drive...');
  const folderIds = await getBackupFolderIds(token);

  if (onStatusUpdate) onStatusUpdate('Đang lấy danh sách 5 bản sao lưu mới nhất...');
  const parentQuery = folderIds.map((id) => `'${id}' in parents`).join(' or ');
  const query = encodeURIComponent(
    `(${parentQuery}) and mimeType != 'application/vnd.google-apps.folder' and trashed = false`
  );

  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${query}&orderBy=modifiedTime desc&pageSize=5&fields=files(id,name,createdTime,modifiedTime,size,webViewLink,mimeType)&spaces=drive&includeItemsFromAllDrives=true&supportsAllDrives=true`,
    {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Lỗi lấy danh sách bản sao lưu: ${errText}`);
  }

  const data = await res.json();
  return data.files || [];
}

/**
 * Download an Excel backup file from Google Drive as an ArrayBuffer
 */
export async function downloadBackupFromDrive(
  token: string,
  fileId: string
): Promise<ArrayBuffer> {
  const metaRes = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,mimeType&supportsAllDrives=true`,
    {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    }
  );

  if (metaRes.ok) {
    const meta = await metaRes.json();
    if (meta.mimeType === 'application/vnd.google-apps.spreadsheet') {
      const exportRes = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`,
        {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        }
      );
      if (!exportRes.ok) {
        const errText = await exportRes.text();
        throw new Error(`Lỗi xuất tệp Google Sheets: ${errText}`);
      }
      return await exportRes.arrayBuffer();
    }
  }

  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`,
    {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Lỗi tải tệp từ Google Drive: ${errText}`);
  }

  return await res.arrayBuffer();
}

/**
 * Upload APK directly to Google Drive (kept for backward compatibility with InstallApkModal)
 */
export async function uploadApkToDrive(
  onStatusUpdate?: (status: string) => void
): Promise<DriveUploadResult> {
  const token = await getAccessToken();
  if (!token) {
    throw new Error('Chưa đăng nhập Google Drive. Vui lòng kết nối tài khoản Google trước.');
  }

  if (onStatusUpdate) onStatusUpdate('Đang tải tệp APK từ bộ nhớ ứng dụng...');
  let apkRes = await fetch('./k02_mobile_qlvb_19.6.apk');
  if (!apkRes.ok) apkRes = await fetch('./k02_mobile_qlvb_19.5.apk');
  if (!apkRes.ok) apkRes = await fetch('./k02_mobile_qlvb.apk');
  if (!apkRes.ok) {
    throw new Error('Không tìm thấy tệp APK nội bộ để tải lên.');
  }
  const apkBlob = await apkRes.blob();

  if (onStatusUpdate) onStatusUpdate(`Đang tải lên Google Drive (${(apkBlob.size / (1024 * 1024)).toFixed(1)} MB)...`);

  const metadata = {
    name: 'k02_mobile_qlvb_19.6.apk',
    description: 'Ứng dụng Quản lý văn bản K02 Mobile trên Android (v19.6)',
    mimeType: 'application/vnd.android.package-archive',
  };

  const boundary = '-------314159265358979323846';
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;
  const metadataContentType = 'Content-Type: application/json; charset=UTF-8\r\n\r\n';
  const mediaContentType = `Content-Type: application/vnd.android.package-archive\r\n\r\n`;

  const multipartBody = new Blob([
    delimiter,
    metadataContentType,
    JSON.stringify(metadata),
    delimiter,
    mediaContentType,
    apkBlob,
    closeDelimiter
  ], { type: `multipart/related; boundary=${boundary}` });

  const uploadRes = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,webContentLink',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: multipartBody,
    }
  );

  if (!uploadRes.ok) {
    const errText = await uploadRes.text();
    throw new Error(`Lỗi tải lên Google Drive: ${uploadRes.status} ${errText}`);
  }

  const fileData = await uploadRes.json();
  return {
    fileId: fileData.id,
    name: fileData.name,
    webViewLink: fileData.webViewLink,
    webContentLink: fileData.webContentLink,
  };
}
