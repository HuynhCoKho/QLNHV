# QLNHV Apps Script

`CustomerGroupReport.gs` chứa phần tổng hợp danh sách khách hàng theo nhóm nghiệp vụ đang được triển khai trong dự án Apps Script `QLNHV`.

- Script ID: `1gVbe6tp1X05li7ZAdLHNx2s53a1ul9xS1qfGN_CLil6FwN_R9WeC5ZvE`
- Web App deployment giữ nguyên URL trong `config.js`.
- Trong `Code.gs`, hàm cũ đã được đổi tên thành `getCustomerGroupReportLegacy`; action `customerGroupReport` gọi hàm mới trong file này.
- Phiên bản triển khai đầu tiên chứa module này: `34` ngày 14/08/2026.

Nguồn mã khách hàng được hợp nhất từ `HoSo`/`TTHC` và các bảng nghiệp vụ trực tiếp, sau đó mới đối chiếu với `KhachHang` để loại trùng và trả về thông tin khách hàng đầy đủ.
