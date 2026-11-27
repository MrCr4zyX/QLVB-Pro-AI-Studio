# QLVB Mobile PRO

Ứng dụng **Quản lý văn bản & Theo dõi thời hạn báo cáo** tối ưu cho điện thoại (Android APK & PWA), hoạt động ngoại tuyến (offline-first) và đồng bộ file Excel hai chiều với phần mềm trên máy tính.

- **Phiên bản Web / PWA:** https://mrcr4zyx.github.io/QLVB-Pro-AI-Studio/

---

## Tính năng chính

### 1. Tổng quan công việc
- Thống kê nhanh tổng số văn bản, kỳ báo cáo, tiến độ hoàn thành theo phạm vi **Toàn bộ / Tháng / Quý / Năm**.
- Danh sách công việc ưu tiên gồm các báo cáo **quá hạn** và **hạn gấp (≤ 7 ngày)** kèm thao tác cập nhật kết quả ngay.
- Thanh cảnh báo gọn trên đầu màn hình hiển thị số báo cáo quá hạn/hạn gấp và nhắc sao lưu dữ liệu định kỳ.

### 2. Quản lý văn bản & Tìm kiếm nhanh
- Tìm kiếm tiếng Việt không dấu theo số văn bản, ký hiệu, cơ quan ban hành, trích yếu, ghi chú, lĩnh vực.
- Thanh lọc 1 chạm theo trạng thái hiệu lực (**Tất cả / Còn hiệu lực / Cần rà soát / Hết hiệu lực**) kèm số lượng thực tế.
- Bộ lọc chi tiết hiển thị số lượng văn bản từng mục theo **Loại văn bản**, **Lĩnh vực** và **Hiệu lực**.
- Sắp xếp linh hoạt: **Mới nhất**, **Cũ nhất**, **Số văn bản (A → Z)**, **Mới cập nhật**.

### 3. Quét văn bản thông minh (Camera & Thư viện ảnh)
- Nút camera nổi tại cả tab **Tổng quan** và tab **Văn bản** với 2 tùy chọn: **Chụp ảnh văn bản** hoặc **Chọn từ thư viện**.
- Tự động nhận diện và điền sẵn các trường thông tin văn bản (ngày ban hành, số, ký hiệu, cơ quan ban hành, loại văn bản, trích yếu, gợi ý lĩnh vực) qua API quét văn bản (`/api/scan-document`).
- Tự động dự phòng bằng **OCR ngoại tuyến (Tesseract.js)** khi thiết bị không có kết nối mạng.

### 4. Theo dõi thời hạn & Lịch tháng
- Hỗ trợ đầy đủ các loại kỳ báo cáo: **Sắp tới**, **Định kỳ** (hằng tháng, hằng quý, hằng năm), **Sơ kết**, **Tổng kết**.
- Nhập ngày nhanh thông minh: gõ `01012026` tự định dạng thành `01/01/2026` (giới hạn 8 chữ số); các mục Sơ kết/Tổng kết vẫn hỗ trợ linh hoạt `dd/mm`, `mm/yyyy`, `yyyy`.
- Xem lịch hạn báo cáo trực quan theo **Lịch tháng** và ghi nhận số/ký hiệu, đường dẫn tệp, ghi chú kết quả báo cáo.

### 5. Thông báo thanh trạng thái Android
- Kênh thông báo ưu tiên cao (tương thích Android 8–15, hỗ trợ xin quyền `POST_NOTIFICATIONS` trên Android 13+).
- Tự động nhắc hạn báo cáo hằng ngày (09:00 & 14:00) và nhắc sao lưu dữ liệu định kỳ vào **10:00 & 15:00 Thứ 2** hàng tuần.

### 6. Đồng bộ & Sao lưu dữ liệu
- **Google Drive:** Đăng nhập an toàn (hỗ trợ cả PWA và APK qua deep-link `k02qlvb://auth`), tự động sao lưu và khôi phục file Excel (`YYYYMMDD_HHmmss_documents.xlsx`) trong thư mục `Backup_QLVB_Pro`.
- **Excel (.xlsx) & JSON cục bộ:** Xuất/nhập file Excel hai chiều chuẩn cấu trúc PC (`VAN_BAN`, `LICH_BAO_CAO`, `LICH_SU`) và sao lưu JSON trực tiếp vào thư mục `Download/QLVB_PRO` trên Android.

---

## Công nghệ sử dụng

- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS v4, Lucide Icons
- **Mobile & PWA:** Capacitor 7 (Android), `@capacitor/local-notifications`, `vite-plugin-pwa`
- **Xử lý dữ liệu & Quét ảnh:** SheetJS (`xlsx`), Tesseract.js, Serverless API (`/api/scan-document`)
- **Lưu trữ & Đồng bộ:** LocalStorage (offline-first), Firebase Auth & Google Drive REST API

---

## Cài đặt & Chạy cục bộ

**Yêu cầu:** Node.js `>= 20`

1. Cài đặt thư viện:
   ```bash
   npm install
   ```
2. Tạo file `.env` từ `.env.example` và cấu hình biến môi trường:
   ```env
   GEMINI_API_KEY=your_api_key
   VITE_SCAN_API_URL=https://your-backend-domain/api/scan-document
   ```
3. Khởi chạy môi trường phát triển (mặc định cổng `3000`):
   ```bash
   npm run dev
   ```
4. Kiểm tra kiểu dữ liệu và đóng gói bản production:
   ```bash
   npm run lint
   npm run build
   ```

---

## Đóng gói Android APK tự động (GitHub Actions)

Workflow `.github/workflows/build-apk.yml` hỗ trợ đóng gói APK bản phát hành tối ưu dung lượng trực tiếp trên GitHub:

- **Cách chạy:** Vào tab **Actions → Build QLVB Mobile APK → Run workflow** (có thể để trống `custom_version` để tự tăng phiên bản, hoặc nhập tay khi cần).
- **Tự động tăng phiên bản:** Quét GitHub Releases/Tags hiện có và tự tăng tuần tự ( →  → ... →  → `), đồng thời phát hành file "QLVB-PRO-v<version>.apk" lên **GitHub Releases**.
- **Tối ưu dung lượng:** Bật R8 (`minifyEnabled`, `shrinkResources`), giữ ngôn ngữ `vi`/`en`, loại bỏ ảnh splash thừa và nén icon.
- **Ký cố định để cài đè không lỗi chữ ký:** Thiết lập 4 **Repository Secrets** trong *Settings → Secrets and variables → Actions*:
  - `ANDROID_KEYSTORE_BASE64`: Chuỗi base64 của file `.keystore` (PKCS12)
  - `ANDROID_KEYSTORE_PASSWORD`: Mật khẩu keystore
  - `ANDROID_KEY_ALIAS`: Tên alias khóa (ví dụ `qlvbkey`)
  - `ANDROID_KEY_PASSWORD`: Mật khẩu khóa
  - `VITE_SCAN_API_URL` *(tùy chọn)*: URL endpoint quét ảnh văn bản

---

## Cấu trúc thư mục chính

```text
├── .github/workflows/build-apk.yml   # Workflow tự động build, ký & phát hành APK
├── api/scan-document.ts              # Serverless API trích xuất thông tin ảnh văn bản
├── server.ts                         # Express + Vite server & cổng xác thực Drive
├── capacitor.config.json             # Cấu hình Capacitor Android
└── src/
    ├── components/                   # Các màn hình (Tổng quan, Văn bản, Báo cáo, Lịch, Đồng bộ, Modals)
    ├── hooks/                        # useNotifications, usePWAInstall
    ├── services/                     # storageService, googleDriveService, attachmentService
    ├── utils/                        # dateUtils, excelSync, documentScanner, fileExportUtils, soundUtils
    └── types/                        # Định nghĩa kiểu dữ liệu văn bản & lịch báo cáo
```
