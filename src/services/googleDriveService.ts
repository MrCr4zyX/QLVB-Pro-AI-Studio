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
const TOKEN_EXPIRY_KEY = 'k02_gdrive_token_expiry';
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
let authOperationId = 0;
let activePortalCancel: (() => void) | null = null;
const AUTH_BROADCAST_CHANNEL = 'k02_gdrive_auth_channel';

let cachedAccessToken: string | null =
  typeof window !== 'undefined'
    ? localStorage.getItem(TOKEN_STORAGE_KEY) || sessionStorage.getItem(TOKEN_STORAGE_KEY)
    : null;
let cachedIdToken: string | null =
  typeof window !== 'undefined'
    ? localStorage.getItem(ID_TOKEN_STORAGE_KEY)
    : null;

export const isAuthorizedFirebaseHost = (): boolean => {
  if (typeof window === 'undefined') return true;
  const host = window.location.hostname;
  return (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host.endsWith('.run.app') ||
    host.endsWith('.firebaseapp.com') ||
    host.endsWith('.web.app')
  );
};

export const broadcastAuthBridgeCode = (code: string) => {
  if (typeof window === 'undefined' || !code) return;
  try {
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage({ type: 'K02_AUTH_BRIDGE_CODE', code }, '*');
    }
  } catch {
    // Ignore cross-origin opener error
  }
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      const bc = new BroadcastChannel(AUTH_BROADCAST_CHANNEL);
      bc.postMessage({ type: 'K02_AUTH_BRIDGE_CODE', code });
      setTimeout(() => bc.close(), 500);
    }
  } catch {
    // Ignore BroadcastChannel error
  }
};

export const cancelPendingPortalPopup = () => {
  if (activePortalCancel) {
    activePortalCancel();
    activePortalCancel = null;
  }
};

function saveTokens(
  accessToken: string,
  idToken?: string | null,
  profile?: { email?: string | null; displayName?: string | null; photoURL?: string | null },
  expiresInSec = 3500
) {
  authOperationId += 1;
  cachedAccessToken = accessToken;
  if (idToken) cachedIdToken = idToken;
  if (typeof window !== 'undefined') {
    const expiryMs = Date.now() + expiresInSec * 1000;
    localStorage.setItem(TOKEN_STORAGE_KEY, accessToken);
    sessionStorage.setItem(TOKEN_STORAGE_KEY, accessToken);
    localStorage.setItem(TOKEN_EXPIRY_KEY, String(expiryMs));
    localStorage.setItem(SCOPE_VERSION_KEY, 'true');
    if (idToken) {
      localStorage.setItem(ID_TOKEN_STORAGE_KEY, idToken);
    }
    if (profile) {
      localStorage.setItem(USER_FALLBACK_KEY, JSON.stringify(profile));
    }
  }
}

export function clearExpiredAccessToken() {
  cachedAccessToken = null;
  if (typeof window !== 'undefined') {
    sessionStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem(TOKEN_EXPIRY_KEY);
  }
}

export function isStoredTokenExpired(): boolean {
  if (!cachedAccessToken) return true;
  if (typeof window === 'undefined') return false;
  const rawExpiry = localStorage.getItem(TOKEN_EXPIRY_KEY);
  if (!rawExpiry) return true;
  const expiryMs = Number(rawExpiry);
  return !Number.isFinite(expiryMs) || Date.now() >= expiryMs;
}

export async function verifyAndRefreshTokenExpiry(token: string): Promise<boolean> {
  if (!token) return false;
  try {
    const res = await fetch(
      `https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${encodeURIComponent(token)}`,
      { cache: 'no-store' }
    );
    if (!res.ok) {
      return false;
    }
    const data = await res.json();
    const expiresIn = Number(data?.expires_in || 0);
    if (expiresIn <= 30) {
      return false;
    }
    if (typeof window !== 'undefined') {
      const expiryMs = Date.now() + (expiresIn - 30) * 1000;
      localStorage.setItem(TOKEN_EXPIRY_KEY, String(expiryMs));
    }
    return true;
  } catch {
    return !isStoredTokenExpired();
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
  if (typeof window !== 'undefined' && isAuthorizedFirebaseHost()) {
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
    if (isSigningIn) return;

    const opIdAtStart = authOperationId;
    const tokenAtStart =
      cachedAccessToken ||
      (typeof window !== 'undefined' ? localStorage.getItem(TOKEN_STORAGE_KEY) : null);

    if (tokenAtStart) {
      cachedAccessToken = tokenAtStart;
      const isValid = await verifyAndRefreshTokenExpiry(tokenAtStart);
      if (isSigningIn || authOperationId !== opIdAtStart) return;
      if (!isValid) {
        if (cachedAccessToken === tokenAtStart) {
          clearExpiredAccessToken();
          if (onAuthFailure) onAuthFailure();
        }
        return;
      }
    }

    if (isSigningIn || authOperationId !== opIdAtStart) return;

    const hasV2Scope = typeof window !== 'undefined' && localStorage.getItem(SCOPE_VERSION_KEY) === 'true';
    if (user && cachedAccessToken && hasV2Scope) {
      if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
    } else if (!user && cachedAccessToken) {
      const fallbackUser = getSavedUserProfile();
      if (fallbackUser && onAuthSuccess) {
        onAuthSuccess(fallbackUser, cachedAccessToken);
      }
    } else if (!isSigningIn && !cachedAccessToken) {
      if (onAuthFailure) onAuthFailure();
    }
  });
};

export const getPwaAuthPortalUrl = (): string => {
  if (typeof window === 'undefined') return WEB_AUTH_PORTAL_URL;
  const cleanOriginUrl = `${window.location.origin}${window.location.pathname}`;
  return `${WEB_AUTH_PORTAL_URL}&pwa_origin=${encodeURIComponent(cleanOriginUrl)}`;
};

export const generatePwaReturnUrl = (
  pwaOrigin: string,
  tokenOverride?: string | null,
  userOverride?: User | null
): string | null => {
  const code = generateApkAuthBridgeCode(tokenOverride, userOverride);
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

    cancelPendingPortalPopup();

    const portalUrl = getPwaAuthPortalUrl();
    const isStandalonePwa =
      window.matchMedia?.('(display-mode: standalone)').matches ||
      (window.navigator as any)?.standalone === true;
    const isMobileDevice = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');

    // In standalone mobile PWA, same-tab redirect is faster and avoids trapped popups
    if (isStandalonePwa && isMobileDevice) {
      window.location.href = portalUrl;
      reject(new Error('REDIRECTING_TO_PORTAL'));
      return;
    }

    const width = 540;
    const height = 700;
    const left = Math.max(0, Math.round(window.screenX + (window.outerWidth - width) / 2));
    const top = Math.max(0, Math.round(window.screenY + (window.outerHeight - height) / 2));

    const popup = window.open(
      portalUrl,
      'k02_pwa_google_auth',
      `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`
    );

    // If popup was blocked by browser, redirect in same tab immediately
    if (!popup) {
      window.location.href = portalUrl;
      reject(new Error('REDIRECTING_TO_PORTAL'));
      return;
    }

    let settled = false;
    let bc: BroadcastChannel | null = null;

    const cleanup = () => {
      activePortalCancel = null;
      window.removeEventListener('message', onMessage);
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('focus', onWindowFocus);
      clearTimeout(maxWaitTimer);
      if (bc) {
        try {
          bc.close();
        } catch {
          // Ignore close error
        }
        bc = null;
      }
    };

    const handleBridgeCode = async (code: string) => {
      if (settled || !code) return;
      settled = true;
      cleanup();
      try {
        if (popup && !popup.closed) popup.close();
      } catch {
        // Ignore popup close error
      }
      try {
        const res = await connectWithExternalToken(code);
        resolve(res);
      } catch (err) {
        reject(err);
      }
    };

    const checkLocalTokenSaved = () => {
      if (settled) return false;
      const freshToken = localStorage.getItem(TOKEN_STORAGE_KEY);
      if (freshToken && !isStoredTokenExpired()) {
        cachedAccessToken = freshToken;
        const savedUser = getSavedUserProfile();
        if (savedUser) {
          settled = true;
          cleanup();
          try {
            if (popup && !popup.closed) popup.close();
          } catch {
            // Ignore
          }
          resolve({ user: savedUser, accessToken: freshToken });
          return true;
        }
      }
      return false;
    };

    const onMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === 'K02_AUTH_BRIDGE_CODE' && typeof event.data.code === 'string') {
        handleBridgeCode(event.data.code);
      }
    };

    const onStorage = (event: StorageEvent) => {
      if (event.key === TOKEN_STORAGE_KEY && event.newValue) {
        checkLocalTokenSaved();
      }
    };

    const onWindowFocus = () => {
      setTimeout(() => {
        checkLocalTokenSaved();
      }, 300);
    };

    if (typeof BroadcastChannel !== 'undefined') {
      try {
        bc = new BroadcastChannel(AUTH_BROADCAST_CHANNEL);
        bc.onmessage = (event) => {
          if (event.data && event.data.type === 'K02_AUTH_BRIDGE_CODE' && typeof event.data.code === 'string') {
            handleBridgeCode(event.data.code);
          }
        };
      } catch {
        // Ignore BroadcastChannel error
      }
    }

    window.addEventListener('message', onMessage);
    window.addEventListener('storage', onStorage);
    window.addEventListener('focus', onWindowFocus);

    activePortalCancel = () => {
      if (!settled) {
        settled = true;
        cleanup();
        try {
          if (popup && !popup.closed) popup.close();
        } catch {
          // Ignore
        }
        reject(new Error('Đã hủy phiên chờ đăng nhập.'));
      }
    };

    // Timeout after 3 minutes if user abandons the popup
    const maxWaitTimer = setTimeout(() => {
      if (!settled && !checkLocalTokenSaved()) {
        settled = true;
        cleanup();
        reject(new Error('Quá thời gian chờ xác thực Google Drive. Vui lòng thử lại.'));
      }
    }, 180000);
  });
};

export const googleSignIn = async (forceConsent = false): Promise<{ user: User; accessToken: string }> => {
  const isApkWebView = typeof window !== 'undefined' && Boolean((window as any).AndroidBridge);

  // If running inside Android APK native WebView, open external Chrome browser
  // because Google blocks OAuth sign-ins inside embedded WebViews (disallowed_useragent)
  if (isApkWebView) {
    const bridge = (window as any).AndroidBridge;
    if (bridge && typeof bridge.openExternalBrowser === 'function') {
      bridge.openExternalBrowser(WEB_AUTH_PORTAL_URL);
      throw new Error('Đang mở trình duyệt Chrome để đăng nhập Google an toàn. Sau khi đăng nhập, ứng dụng sẽ tự động kết nối.');
    }
  }

  // Immediately open authorized portal on external PWA domains (e.g. GitHub Pages)
  // so the browser popup blocker never blocks window.open due to async delay
  if (!isAuthorizedFirebaseHost() && !isApkWebView) {
    return await signInViaAuthorizedPortalPopup();
  }

  const isMobile =
    typeof window !== 'undefined' &&
    (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '') ||
      window.matchMedia?.('(pointer:coarse)').matches);

  const searchParams =
    typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const isPortalMode = Boolean(searchParams && searchParams.get('apk_auth') === '1');

  // On mobile devices or portal mode, redirect sign-in is 100% reliable and avoids popup-closed-by-user
  if (isMobile && isPortalMode) {
    await googleSignInRedirect();
    throw new Error('REDIRECTING_TO_GOOGLE');
  }

  try {
    authOperationId += 1;
    isSigningIn = true;
    const hasV2Scope = typeof window !== 'undefined' && localStorage.getItem(SCOPE_VERSION_KEY) === 'true';
    if (forceConsent || !hasV2Scope) {
      provider.setCustomParameters({ prompt: 'consent select_account' });
    } else {
      provider.setCustomParameters({ prompt: 'select_account' });
    }

    let result;
    try {
      result = await signInWithPopup(auth, provider);
    } catch (popupErr: any) {
      const code = popupErr?.code || '';
      const msg = String(popupErr?.message || '');
      if (
        code === 'auth/popup-closed-by-user' ||
        code === 'auth/popup-blocked' ||
        code === 'auth/cancelled-popup-request' ||
        msg.includes('popup-closed-by-user') ||
        msg.includes('popup-blocked')
      ) {
        // Fallback to same-tab redirect sign in
        await googleSignInRedirect();
        throw new Error('REDIRECTING_TO_GOOGLE');
      }
      throw popupErr;
    }

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

    if (isUnauthorizedDomain && !isApkWebView) {
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
  const isApkWebView = typeof window !== 'undefined' && Boolean((window as any).AndroidBridge);
  if (!isAuthorizedFirebaseHost() && !isApkWebView && typeof window !== 'undefined') {
    window.location.href = getPwaAuthPortalUrl();
    return;
  }

  try {
    authOperationId += 1;
    isSigningIn = true;
    provider.setCustomParameters({ prompt: 'select_account' });
    await signInWithRedirect(auth, provider);
  } catch (error: any) {
    isSigningIn = false;
    const isUnauthorizedDomain =
      error?.code === 'auth/unauthorized-domain' ||
      String(error?.message || '').includes('auth/unauthorized-domain');

    if (isUnauthorizedDomain && !isApkWebView && typeof window !== 'undefined') {
      window.location.href = getPwaAuthPortalUrl();
      return;
    }
    throw error;
  }
};

/**
 * Generate compact Base64 token code or Deep Link for connecting the Android APK / PWA
 */
export const generateApkAuthBridgeCode = (
  tokenOverride?: string | null,
  userOverride?: User | null
): string | null => {
  const activeToken =
    tokenOverride ||
    cachedAccessToken ||
    (typeof window !== 'undefined' ? localStorage.getItem(TOKEN_STORAGE_KEY) : null);
  if (!activeToken) return null;
  const currentUser = userOverride || auth.currentUser || getSavedUserProfile();
  const payload = {
    a: activeToken,
    i: cachedIdToken || '',
    e: currentUser?.email || '',
    n: currentUser?.displayName || '',
    p: currentUser?.photoURL || '',
  };
  return window.btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
};

export const generateApkDeepLink = (
  useIntentScheme = false,
  tokenOverride?: string | null,
  userOverride?: User | null
): string | null => {
  const code = generateApkAuthBridgeCode(tokenOverride, userOverride);
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

  const isValidToken = await verifyAndRefreshTokenExpiry(accessToken);
  if (!isValidToken) {
    throw new Error(
      'Mã Kết Nối này đã hết hạn (mã OAuth2 chỉ có hiệu lực 60 phút). Vui lòng mở lại Cổng Xác Thực Web, bấm Đăng nhập lại rồi sao chép Mã Kết Nối mới.'
    );
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
  await verifyAndRefreshTokenExpiry(accessToken);

  const finalUser = firebaseUser || getSavedUserProfile()!;
  return { user: finalUser, accessToken };
};

export const getAccessToken = async (): Promise<string | null> => {
  if (!cachedAccessToken || isStoredTokenExpired()) {
    clearExpiredAccessToken();
    return null;
  }
  return cachedAccessToken;
};

export const logoutGoogle = async () => {
  await signOut(auth);
  clearExpiredAccessToken();
  cachedIdToken = null;
  if (typeof window !== 'undefined') {
    localStorage.removeItem(ID_TOKEN_STORAGE_KEY);
    localStorage.removeItem(USER_FALLBACK_KEY);
  }
};

function throwDriveApiError(prefix: string, status: number, errText: string): never {
  if (status === 401 || errText.includes('"UNAUTHENTICATED"') || errText.includes('Invalid Credentials')) {
    clearExpiredAccessToken();
    const authErr = new Error(
      'Phiên xác thực Google Drive đã hết hạn (mã truy cập OAuth2 có hiệu lực 60 phút). Vui lòng đăng nhập lại để làm mới kết nối.'
    );
    (authErr as any).isAuthError = true;
    throw authErr;
  }
  throw new Error(`${prefix}: ${errText}`);
}

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
    throwDriveApiError(`Lỗi kiểm tra thư mục ${BACKUP_FOLDER_NAME}`, res.status, errText);
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
    throwDriveApiError(`Lỗi tạo thư mục ${BACKUP_FOLDER_NAME}`, createRes.status, errText);
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
    throwDriveApiError('Lỗi tải tệp lên Google Drive', uploadRes.status, errText);
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
    throwDriveApiError('Lỗi lấy danh sách bản sao lưu', res.status, errText);
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

  if (!metaRes.ok && metaRes.status === 401) {
    const errText = await metaRes.text();
    throwDriveApiError('Lỗi kiểm tra tệp trên Google Drive', metaRes.status, errText);
  }

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
        throwDriveApiError('Lỗi xuất tệp Google Sheets', exportRes.status, errText);
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
    throwDriveApiError('Lỗi tải tệp từ Google Drive', res.status, errText);
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
    throw new Error('Chưa đăng nhập Google Drive hoặc phiên đã hết hạn. Vui lòng kết nối lại tài khoản Google.');
  }

  if (onStatusUpdate) onStatusUpdate('Đang tải tệp APK từ bộ nhớ ứng dụng...');
  let apkRes = await fetch('./k02_mobile_qlvb_19.9.apk');
  if (!apkRes.ok) apkRes = await fetch('./k02_mobile_qlvb_19.8.apk');
  if (!apkRes.ok) apkRes = await fetch('./k02_mobile_qlvb.apk');
  if (!apkRes.ok) {
    throw new Error('Không tìm thấy tệp APK nội bộ để tải lên.');
  }
  const apkBlob = await apkRes.blob();

  if (onStatusUpdate) onStatusUpdate(`Đang tải lên Google Drive (${(apkBlob.size / (1024 * 1024)).toFixed(1)} MB)...`);

  const metadata = {
    name: 'k02_mobile_qlvb_19.9.apk',
    description: 'Ứng dụng Quản lý văn bản K02 Mobile trên Android (v19.9)',
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
    throwDriveApiError('Lỗi tải lên Google Drive', uploadRes.status, errText);
  }

  const fileData = await uploadRes.json();
  return {
    fileId: fileData.id,
    name: fileData.name,
    webViewLink: fileData.webViewLink,
    webContentLink: fileData.webContentLink,
  };
}
