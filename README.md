# 🕒 3PM — App Quản lý Thu/Chi shop thời trang

Web app quản lý thu chi: HTML/CSS/JS thuần + Bootstrap 5, backend Google Apps Script, lưu Google Sheet, upload ảnh lên Google Drive. **Không cần React/Node/Firebase/MySQL.**

## 📁 Cấu trúc file
| File | Vai trò |
|------|---------|
| `Code.gs` | Backend Apps Script (doGet, doPost, các API, upload Drive) |
| `index.html` + `dashboard.js` | Trang Dashboard (thống kê + biểu đồ) |
| `transaction.html` + `transaction.js` | Trang quản lý giao dịch + đăng nhập + modal |
| `api.js` | Lớp gọi API dùng chung |
| `style.css` | Giao diện (cam #D97706 / kem / đen) |

---

## 🗃️ 3. Cấu trúc Google Sheet

### Sheet `transactions`
| Cột | Kiểu | Mô tả |
|-----|------|------|
| `id` | text | Mã giao dịch tự sinh (VD `TX1718...`) |
| `type` | text | `Income` (thu) hoặc `Expense` (chi) |
| `title` | text | Tên khoản thu/chi |
| `status` | text | `Chờ duyệt` / `Đã duyệt` / `Từ chối` |
| `quantity` | number | Số lượng |
| `unitPrice` | number | Đơn giá |
| `total` | number | Tổng tiền = quantity × unitPrice (backend tự tính) |
| `note` | text | Ghi chú |
| `imageUrl` | text | Link ảnh hóa đơn trên Drive |
| `createdAt` | datetime | Ngày tạo `yyyy-MM-dd HH:mm:ss` |
| `createdBy` | text | Username người tạo |

### Sheet `users`
| Cột | Mô tả |
|-----|------|
| `username` | Tài khoản đăng nhập |
| `password` | Mật khẩu (demo lưu thô — production nên hash) |
| `displayName` | Tên hiển thị |
| `role` | `staff` (nhân viên) hoặc `accountant` (kế toán) |

> Tài khoản mẫu sau khi chạy `setup()`: `staff/123` và `ketoan/123`.
> Chỉ **kế toán** mới thấy nút Duyệt / Từ chối.

---

## 🚀 Cách deploy

### Bước 1 — Backend (Apps Script)
1. Mở Google Sheet → **Extensions → Apps Script**.
2. Xóa code mặc định, dán toàn bộ nội dung `Code.gs`.
3. Chạy hàm **`setup`** một lần (chọn hàm `setup` → ▶ Run) → cấp quyền Sheet + Drive.
   → Tự tạo sheet `transactions`, `users`, dữ liệu mẫu và folder Drive `3PM_Receipts`.
4. **Deploy → New deployment → Web app**:
   - *Execute as:* **Me**
   - *Who has access:* **Anyone**
5. Copy **Web app URL** (kết thúc bằng `/exec`).

### Bước 2 — Frontend
1. Mở `api.js`, dán URL vừa copy vào biến `API_URL`.
2. Mở `transaction.html` để đăng nhập, hoặc `index.html` để xem dashboard.
   - Chạy trực tiếp bằng cách mở file, hoặc host miễn phí trên **GitHub Pages / Netlify**.

---

## ✅ Chức năng
- **Dashboard:** tổng thu / chi tháng này, lợi nhuận, biểu đồ 6 tháng (Chart.js). Chỉ tính giao dịch **Đã duyệt**.
- **Giao dịch:** thêm Thu / Chi, sửa, xóa, tìm kiếm, lọc theo tháng & trạng thái.
- **Quy trình duyệt:** Staff tạo → `Chờ duyệt` → Kế toán `Duyệt`/`Từ chối`.
- **Upload ảnh** hóa đơn lên Drive, lưu link vào Sheet, xem nhanh bằng thumbnail.

## 🔒 Ghi chú bảo mật
Đây là bản đơn giản: mật khẩu lưu thô, phân quyền ở phía client. Nếu dùng thật nên hash mật khẩu và kiểm tra `role` ở backend trước khi cho `delete`/`updateStatus`.
