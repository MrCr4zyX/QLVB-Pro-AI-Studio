# Kế hoạch nâng cấp phiên bản v1.7 và tích hợp Google Drive Link

1. [x] **Cập nhật mã phiên bản v1.7:**
   - Đã cấu hình `versionCode="17"` và `versionName="1.7"` trong AndroidManifest chuẩn.
   - Cập nhật giao diện `InstallApkModal.tsx` và `SyncTab.tsx` hiển thị chuẩn v1.7.

2. [x] **Đóng gói lại tệp APK thật bằng aapt & apksigner:**
   - Biên dịch lại Web bundle với Vite (nhúng static logo splash view).
   - Đóng gói và ký số thành công tệp APK mới (`k02_mobile_qlvb_1.7.apk`).
   - Đã kiểm tra metadata qua `aapt dump badging`: `versionCode='17'` - `versionName='1.7'`.

3. [x] **Tích hợp Google Drive cá nhân:**
   - Tích hợp nút 1 chạm "Tải file APK lên Google Drive của tôi & Lấy Link" ngay trong bảng cài đặt APK để người dùng đẩy trực tiếp lên tài khoản Google cá nhân.
