# ANA Spa Management Platform

<p align="center">
  <img src="https://img.shields.io/badge/Python-3.10+-3776AB?style=for-the-badge&logo=python&logoColor=white" alt="Python">
  <img src="https://img.shields.io/badge/Django-4.2.29-092E20?style=for-the-badge&logo=django&logoColor=white" alt="Django">
  <img src="https://img.shields.io/badge/ASGI-Daphne_4.2-FF6600?style=for-the-badge" alt="Daphne">
  <img src="https://img.shields.io/badge/WebSocket-Django_Channels_4.3-4A90D9?style=for-the-badge" alt="Channels">
  <img src="https://img.shields.io/badge/Storage-Cloudinary-3448C5?style=for-the-badge&logo=cloudinary&logoColor=white" alt="Cloudinary">
  <img src="https://img.shields.io/badge/Tests-156_passing-27AE60?style=for-the-badge" alt="Tests">
  <img src="https://img.shields.io/badge/License-MIT-lightgrey?style=for-the-badge" alt="License">
</p>

<p align="center">
  Ứng dụng web full-stack quản lý toàn bộ hoạt động spa — đặt lịch trực tuyến, quản lý dịch vụ,<br>
  điều phối nhân viên, live chat thời gian thực, xử lý khiếu nại và phân tích doanh thu.
</p>

---

## Mục lục

- [Giới thiệu](#giới-thiệu)
- [Tính năng](#tính-năng)
- [Kiến trúc hệ thống](#kiến-trúc-hệ-thống)
- [Công nghệ sử dụng](#công-nghệ-sử-dụng)
- [Cấu trúc dự án](#cấu-trúc-dự-án)
- [Điểm nổi bật về kiến trúc](#điểm-nổi-bật-về-kiến-trúc)
- [Hướng dẫn cài đặt](#hướng-dẫn-cài-đặt)
- [Biến môi trường](#biến-môi-trường)
- [Kiểm thử](#kiểm-thử)
- [Tổng quan API](#tổng-quan-api)
- [Giới hạn hiện tại](#giới-hạn-hiện-tại)
- [Giấy phép](#giấy-phép)

---

## Giới thiệu

**ANA Spa Management Platform** là nền tảng quản lý spa toàn diện xây dựng trên Django 4.2 + ASGI, phục vụ hai nhóm người dùng:

- **Khách hàng** — đặt lịch, theo dõi lịch hẹn, gửi khiếu nại và chat trực tiếp với nhân viên.
- **Nhân viên / Quản trị viên** — quản lý toàn bộ vận hành hàng ngày qua giao diện admin riêng biệt: từ lịch phòng, hóa đơn, thanh toán đến báo cáo doanh thu.

Hệ thống được tổ chức thành **11 Django app** tách bạch theo domain, giao tiếp thời gian thực qua **WebSocket** (Django Channels), và có tầng API JSON nội bộ do chính dự án tự thiết kế (Django function-based views + lớp `ApiResponse` chuẩn hóa response) — không phụ thuộc DRF hay framework API ngoài.

---

## Tính năng

### Dành cho khách hàng
| Tính năng | Mô tả |
|-----------|-------|
| Xác thực tài khoản | Đăng ký / đăng nhập, đặt lại mật khẩu qua email (SendGrid) |
| Danh mục dịch vụ | Xem dịch vụ theo danh mục, hình ảnh và các gói giá |
| Đặt lịch trực tuyến | Chọn dịch vụ, phòng, ngày giờ; nhận xác nhận đặt lịch |
| Lịch sử lịch hẹn | Xem lịch hẹn đã qua và sắp tới kèm trạng thái |
| Gửi khiếu nại | Đính kèm mã lịch hẹn/dịch vụ; theo dõi tiến trình và phản hồi với nhân viên |
| Live chat | Chat thời gian thực với nhân viên hỗ trợ |
| Tài khoản cá nhân | Cập nhật thông tin, đổi mật khẩu |

### Dành cho Admin / Nhân viên
| Tính năng | Mô tả |
|-----------|-------|
| Lịch theo phòng | Xem lịch hẹn dạng calendar theo phòng, quản lý walk-in và đặt online |
| Quản lý lịch hẹn | Tạo, cập nhật, check-in/check-out, hủy lịch; đặt nhiều khách cùng lúc |
| Hóa đơn & Thanh toán | Tự động tạo hóa đơn theo booking; tiền mặt/thẻ/chuyển khoản/ví; thanh toán một phần, chiết khấu |
| Quản lý dịch vụ | CRUD danh mục, dịch vụ (upload ảnh Cloudinary), gói dịch vụ (thời lượng + giá) |
| Quản lý khách hàng | Xem và chỉnh sửa hồ sơ; tìm kiếm theo tên hoặc số điện thoại |
| Quản lý nhân viên | Tạo tài khoản nhân viên, gán nhóm quyền, khóa/mở khóa tài khoản; kiểm tra username trùng real-time |
| Quản lý khiếu nại | Phân công nhân viên xử lý, phản hồi (ghi chú nội bộ), cập nhật trạng thái, đánh dấu hoàn thành |
| Live chat (admin) | Chat thời gian thực qua WebSocket; badge đếm tin chưa đọc |
| Báo cáo thống kê | Dashboard KPI (doanh thu, lịch hẹn, khách mới, khiếu nại); biểu đồ doanh thu theo ngày; top khách hàng & top dịch vụ |

---

## Kiến trúc hệ thống

### Luồng xử lý đặt lịch

```
Khách hàng
    │
    ▼
POST /api/appointments/booking/create/
    │
    ▼
Booking (PENDING) ──────────────────────────────────────┐
    │                                                    │
    ▼                                                    ▼
Staff xác nhận → CONFIRMED                   Invoice tự động tạo
    │                                           (status: UNPAID)
    ▼
Check-in → Appointment: ARRIVED
    │
    ▼
Check-out → Appointment: COMPLETED
    │
    ▼
Thanh toán → InvoicePayment → Invoice: PAID
```

### Sơ đồ quan hệ dữ liệu (ERD rút gọn)

```
Booking ──────────────────── Invoice
   │   (1-1)                    │ (1-n)
   │ (1-n)               InvoiceItem (snapshot dịch vụ)
   │                             │ (1-n)
Appointment                InvoicePayment (CASH/CARD/...)
   ├── Room  (n-1)
   ├── ServiceVariant (n-1)
   └── CustomerProfile (n-1, snapshot)

ChatSession ──── ChatMessage
    └── SessionStaff (nhiều nhân viên / 1 session)

Complaint ──── ComplaintHistory (audit trail)
```

### Hệ thống phân quyền (RBAC)

```
is_superuser  →  group "Quản lý"    →  Toàn bộ tính năng admin (báo cáo, nhân viên, ...)
is_staff      →  group "Lễ tân"     →  Lịch hẹn, hóa đơn, chat, khiếu nại
(regular)     →  group "Khách hàng" →  Giao diện khách (đặt lịch, lịch sử, ...)
```

---

## Công nghệ sử dụng

| Thành phần | Công nghệ |
|------------|-----------|
| Backend | Python 3.10+, Django 4.2.29 |
| API tầng trong | Django function-based views + `ApiResponse` (JSON envelope tự thiết kế) |
| ASGI / WebSocket | Django Channels 4.3, Daphne 4.2 |
| Cơ sở dữ liệu | SQLite |
| Lưu trữ media | Cloudinary + `django-cloudinary-storage` |
| Email | SendGrid SMTP relay |
| Frontend | HTML, CSS, Bootstrap 5, Vanilla JS |
| Xử lý ảnh | Pillow |
| Cấu hình | python-dotenv (biến môi trường) |

---

## Cấu trúc dự án

```
spa_project/
├── core/              # Tiện ích dùng chung: ApiResponse, decorators, user_service,
│                       # validators, CodeGeneratorMixin
│   └── management/commands/
│       └── sync_user_groups.py   # Tạo & đồng bộ group người dùng
├── accounts/          # Xác thực: đăng nhập, đăng ký, đặt lại mật khẩu
├── admin_panel/       # Đăng nhập admin, trang cá nhân nhân viên
├── appointments/      # Booking, lịch hẹn, phòng, hóa đơn, thanh toán
│   ├── models.py      # Room, Booking, Appointment, Invoice, InvoiceItem, InvoicePayment
│   ├── api.py         # API endpoints nội bộ
│   └── tests.py       # Test suite lớn nhất của dự án
├── chat/              # Live chat thời gian thực (WebSocket)
│   ├── consumers.py   # WebSocket consumer
│   └── services.py    # Chat business logic
├── complaints/        # Vòng đời xử lý khiếu nại + ComplaintHistory
├── customers/         # Hồ sơ khách hàng, trang cá nhân phía khách
├── pages/             # Trang tĩnh: trang chủ, giới thiệu
├── reports/           # Báo cáo KPI và phân tích doanh thu
├── spa_services/      # Danh mục, dịch vụ, gói dịch vụ (ServiceVariant)
├── staff/             # Quản lý tài khoản nhân viên
├── templates/
│   ├── spa/           # Layout cho trang khách hàng (base.html)
│   └── manage/        # Layout cho admin panel (base.html)
├── static/            # CSS, JS, images tĩnh
└── spa_project/
    ├── settings.py
    ├── urls.py
    └── asgi.py        # ASGI entry-point (Daphne)
```

---

## Điểm nổi bật về kiến trúc

### Hệ thống layout kép
`spa/base.html` cho trang khách hàng và `manage/base.html` cho admin panel — giao diện và điều hướng hoàn toàn độc lập, không chia sẻ navigation hay context.

### Phân quyền theo vai trò (RBAC)
Các decorator tùy chỉnh kiểm soát quyền truy cập tại tầng view:
```python
@customer_required   # Chỉ khách hàng đã đăng nhập
@staff_required      # Chỉ nhân viên (is_staff)
@staff_api           # API endpoint chỉ dành cho nhân viên + CSRF
```
Các route nhạy cảm như báo cáo và quản lý nhân viên yêu cầu thêm `is_superuser`.

### Chuẩn hóa API response
Lớp `ApiResponse` đảm bảo định dạng JSON nhất quán trên toàn bộ endpoint:
```json
{
  "success": true,
  "message": "Thông báo tùy chọn",
  "data": { }
}
```

### Snapshot pattern
Tên, số điện thoại, email khách hàng được **lưu snapshot** tại thời điểm tạo lịch hẹn/khiếu nại. Lịch sử vẫn chính xác dù profile khách sau này thay đổi.

### Soft delete
Lịch hẹn và booking hỗ trợ `deleted_at` để xóa an toàn mà không mất dữ liệu — bản ghi vẫn còn trong DB và có thể phục hồi.

### Audit trail
`ComplaintHistory` ghi lại **toàn bộ** thay đổi trạng thái, phân công và phản hồi kèm người thực hiện và thời điểm — không thể sửa lại sau khi ghi.

### Sinh mã định danh an toàn đồng thời
Các model cần mã định danh (Booking, Appointment, Invoice, Complaint, Service, ChatSession) dùng chung `CodeGeneratorMixin` (`core/models.py`) — sinh mã dạng `BK0001`, `APP0001`, `INV00001`, chống race condition bằng `select_for_update()` trong transaction, chỉ khai báo 3 thuộc tính cho mỗi model:
```python
class Booking(CodeGeneratorMixin, models.Model):
    code_prefix = 'BK'
    code_field = 'booking_code'
    code_digits = 4
```

### Ràng buộc toàn vẹn ở tầng database
Model sử dụng `CheckConstraint` để đảm bảo tính toàn vẹn dữ liệu độc lập với validation ở tầng Django — dữ liệu vẫn đúng ngay cả khi có thao tác ghi trực tiếp vào DB:
```python
models.CheckConstraint(
    check=models.Q(status__in=['PENDING', 'CONFIRMED', 'CANCELLED', 'REJECTED']),
    name='booking_status_valid'
)
```

---

## Hướng dẫn cài đặt

### Yêu cầu
- Python **3.10+**
- pip

### Các bước cài đặt

```bash
# 1. Clone repository
git clone https://github.com/ngvanan05/django-spa-management-system.git
cd django-spa-management-system/spa_project

# 2. Tạo và kích hoạt môi trường ảo
python -m venv venv
source venv/bin/activate        # Linux / macOS
venv\Scripts\activate           # Windows

# 3. Cài đặt thư viện
pip install -r requirements.txt

# 4. Cấu hình biến môi trường
cp .env.example .env
# Chỉnh sửa .env theo nhu cầu (xem mục Biến môi trường bên dưới)

# 5. Chạy migration
python manage.py migrate

# 6. Tạo tài khoản superuser
python manage.py createsuperuser

# 7. Khởi tạo các group người dùng (Khách hàng / Lễ tân / Quản lý)
python manage.py sync_user_groups --init-groups

# 8. Khởi động server
python manage.py runserver
```

> **Lưu ý ASGI / WebSocket:** `runserver` của Django hỗ trợ ASGI trong môi trường dev. Để chạy giống production hơn, dùng Daphne:
> ```bash
> daphne -p 8000 spa_project.asgi:application
> ```

### Lệnh `sync_user_groups` — chi tiết

```bash
# Khởi tạo 3 group nếu chưa có (chạy lần đầu)
python manage.py sync_user_groups --init-groups

# Kiểm tra và tự động fix dữ liệu user/group/profile
python manage.py sync_user_groups

# Chỉ báo cáo, không thay đổi dữ liệu
python manage.py sync_user_groups --dry-run
```

Lệnh này tạo 3 group Django: **"Khách hàng"**, **"Lễ tân"** và **"Quản lý"** — dùng để kiểm soát quyền truy cập theo vai trò trong toàn hệ thống.

---

## Biến môi trường

Tạo file `.env` tại thư mục `spa_project/` (xem `.env.example` để có đầy đủ danh sách):

```env
# Bắt buộc đổi khi deploy production
DJANGO_SECRET_KEY=your-random-secret-key
DJANGO_DEBUG=True
DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1

# Cloudinary — lưu trữ ảnh dịch vụ trên cloud
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

# SendGrid — gửi email đặt lại mật khẩu
SENDGRID_API_KEY=your_sendgrid_api_key
DEFAULT_FROM_EMAIL=ANA Spa <noreply@yourdomain.com>
```

**Fallback khi chưa cấu hình** (đều hoạt động tốt cho môi trường dev, không cần cấu hình gì thêm):

| Biến | Khi chưa cấu hình |
|------|-------------------|
| `DJANGO_SECRET_KEY` / `DJANGO_DEBUG` / `DJANGO_ALLOWED_HOSTS` | Dùng giá trị mặc định cho dev local — **không dùng nguyên trạng khi deploy production** |
| `CLOUDINARY_*` | Media file lưu local tại `media/` |
| `SENDGRID_API_KEY` | Email in ra terminal (console backend) |

---

## Kiểm thử

Dự án có **156 test case** bao phủ các module nghiệp vụ chính (model, API, luồng xử lý), tập trung nhiều nhất ở `appointments` — module domain lõi của hệ thống.

```bash
# Chạy toàn bộ test suite
python manage.py test

# Chạy test cho một module cụ thể
python manage.py test appointments
python manage.py test chat
python manage.py test complaints

# Chạy với output chi tiết
python manage.py test --verbosity=2
```

Test chạy trên SQLite in-memory (`TEST: {'NAME': ':memory:'}` trong `settings.py`) nên không sinh file phụ và tự dọn sau khi chạy xong.

---

## Tổng quan API

Tất cả API endpoint trả về JSON theo định dạng thống nhất:

```json
{
  "success": true,
  "message": "Thông báo tùy chọn",
  "data": { }
}
```

Trong trường hợp lỗi:
```json
{
  "success": false,
  "message": "Mô tả lỗi",
  "error": "error_code"
}
```

### Các nhóm endpoint chính

| Prefix | Mô tả |
|--------|-------|
| `/api/auth/` | Đăng nhập, đăng ký, đăng xuất, thông tin user hiện tại |
| `/api/appointments/` | Lịch theo phòng, CRUD booking, check-in/out, hóa đơn, thanh toán |
| `/api/complaints/` | Danh sách, chi tiết, phản hồi, trạng thái, phân công, thống kê |
| `/api/reports/` | Dữ liệu KPI với bộ lọc theo khoảng thời gian |
| `/api/chat/` | Danh sách phiên, badge đếm tin chưa đọc |
| `/manage/staff/check-username/` | Kiểm tra tên đăng nhập trùng real-time |

---

## Giới hạn hiện tại

Để giữ README trung thực với trạng thái thật của dự án:

- **Database**: chỉ chạy SQLite, chưa có cấu hình PostgreSQL cho production.
- **Real-time layer**: `CHANNEL_LAYERS` dùng `InMemoryChannelLayer` — phù hợp chạy 1 worker process; cần chuyển sang `channels-redis` để scale nhiều worker/instance.
- **API**: không dùng Django REST Framework — toàn bộ API là function-based view tự viết, phù hợp quy mô hiện tại nhưng sẽ cần cân nhắc lại nếu API mở rộng nhiều hơn.

---

## Giấy phép

Phát hành theo giấy phép [MIT](LICENSE).

---

<p align="center">
  Made by <a href="https://github.com/ngvanan05">Nguyễn Văn An</a>
</p>
