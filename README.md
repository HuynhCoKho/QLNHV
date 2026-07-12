# QLNHV cá nhân

Ứng dụng web cá nhân chạy trên GitHub Pages. Dữ liệu được lưu cục bộ trong trình duyệt (IndexedDB), không nằm trong GitHub.

## An toàn dữ liệu

- Mật khẩu và dữ liệu nghiệp vụ không được gửi lên GitHub.
- Bản sao lưu dùng AES-GCM với khóa dẫn xuất PBKDF2-SHA-256.
- Tải file `.qlnhv` lên Google Drive sau mỗi buổi làm việc.
- Không xóa dữ liệu trình duyệt trước khi kiểm tra bản sao lưu.

## Giới hạn

Phiên bản này dành cho một người dùng và không đồng bộ tự động giữa thiết bị. Khi đổi thiết bị, tải bản sao lưu từ Google Drive và dùng chức năng Khôi phục.
