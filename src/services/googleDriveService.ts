import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  User,
  signOut
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);

const provider = new GoogleAuthProvider();
// Workspace Drive scope
provider.addScope('https://www.googleapis.com/auth/drive.file');

let isSigningIn = false;
let cachedAccessToken: string | null = null;

// Initialize auth state listener
export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (cachedAccessToken) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else if (!isSigningIn) {
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      cachedAccessToken = null;
      if (onAuthFailure) onAuthFailure();
    }
  });
};

export const googleSignIn = async (): Promise<{ user: User; accessToken: string }> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Không thể lấy mã truy cập Google Drive từ xác thực.');
    }

    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    console.error('Google Sign-in error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

export const logoutGoogle = async () => {
  await signOut(auth);
  cachedAccessToken = null;
};

export interface DriveUploadResult {
  fileId: string;
  name: string;
  webViewLink: string;
  webContentLink?: string;
}

/**
 * Upload APK directly to the signed-in user's Google Drive
 */
export async function uploadApkToDrive(
  onStatusUpdate?: (status: string) => void
): Promise<DriveUploadResult> {
  const token = await getAccessToken();
  if (!token) {
    throw new Error('Chưa đăng nhập Google Drive. Vui lòng kết nối tài khoản Google trước.');
  }

  if (onStatusUpdate) onStatusUpdate('Đang tải tệp APK từ bộ nhớ ứng dụng...');
  const apkRes = await fetch('./k02_mobile_qlvb_1.8.apk');
  if (!apkRes.ok) {
    throw new Error('Không tìm thấy tệp APK nội bộ để tải lên.');
  }
  const apkBlob = await apkRes.blob();

  if (onStatusUpdate) onStatusUpdate(`Đang tải lên Google Drive (${(apkBlob.size / (1024 * 1024)).toFixed(1)} MB)...`);

  const metadata = {
    name: 'K02_Mobile_QLVB_v1.8.apk',
    description: 'Ứng dụng Quản lý văn bản K02 Mobile trên Android (v1.8)',
    mimeType: 'application/vnd.android.package-archive',
  };

  const boundary = '-------314159265358979323846';
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const metadataContentType = 'Content-Type: application/json; charset=UTF-8\r\n\r\n';
  const mediaContentType = `Content-Type: application/vnd.android.package-archive\r\n\r\n`;

  const metadataPart = new Blob([delimiter + metadataContentType + JSON.stringify(metadata) + '\r\n']);
  const mediaPart = apkBlob;
  const closePart = new Blob([closeDelimiter]);

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

  // Make file publicly readable via link so anyone with the link can download it
  if (onStatusUpdate) onStatusUpdate('Đang cấp quyền chia sẻ liên kết công khai...');
  try {
    await fetch(`https://www.googleapis.com/drive/v3/files/${fileData.id}/permissions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        role: 'reader',
        type: 'anyone',
      }),
    });
  } catch (permErr) {
    console.warn('Set permission warning:', permErr);
  }

  const finalRes = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileData.id}?fields=id,name,webViewLink,webContentLink`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  const finalData = await finalRes.json();

  // Save the drive link in localStorage for persistence
  if (finalData.webViewLink) {
    localStorage.setItem('k02_drive_apk_link', finalData.webViewLink);
  }

  return {
    fileId: finalData.id,
    name: finalData.name,
    webViewLink: finalData.webViewLink,
    webContentLink: finalData.webContentLink,
  };
}
