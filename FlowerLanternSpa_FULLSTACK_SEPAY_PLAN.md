# KẾ HOẠCH FULLSTACK — FLOWER LANTERN SPA + SEPAY

## Mục tiêu
Xây dựng hệ thống quản lý và đặt lịch Flower Lantern Spa đầy đủ Frontend, Backend, Microsoft SQL Server, thanh toán QR SePay và kiểm thử end-to-end trên máy local, **chưa chọn hoặc triển khai môi trường hosting**.

## Nguồn đầu vào (đặt trong `references/`)
1. `50K141.04.3007(1).docx`: SRS, 10 nhóm UC/35 UC chi tiết, đặc tả UI và vật lý DB 15 bảng.
2. `50K141.04.3007.fig`: file Figma gốc; import vào Figma để dùng MCP, không tự nhận có thể đọc chính xác `.fig` bằng cách đoán.
3. `BO_QUY_CHUAN_TRUOC_FIGMA(1).docx`: hệ màu, typography và UI kit.
4. `BPMN_UCD_CLASS(1).drawio`: BPMN/UCD/Class Diagram.
5. `Luồng giao diện(1).drawio`: screen flow.
6. `Sơ đồ AD(1).drawio`: Activity Diagrams.
7. `HoaSen_TrangTri_TuMauDuyet(1).png`: ảnh hoa sen được duyệt.
8. `nen.png`: banner nền được duyệt.

## Công nghệ
- Frontend: React, TypeScript, Vite, Tailwind CSS, shadcn/ui (điều chỉnh theo Figma), React Router, TanStack Query, React Hook Form, Zod.
- Backend: NestJS + TypeScript, REST API, Swagger/OpenAPI, validation, JWT + HttpOnly cookie, phân quyền RBAC, Argon2.
- DB: Microsoft SQL Server local; TypeORM với driver `mssql`; migrations riêng, tuyệt đối tắt `synchronize` trong production; không dùng SQLite/PostgreSQL để thay cho SQL Server.
- Payment: SePay, QR chuyển khoản với số tiền và nội dung tham chiếu duy nhất, webhook bảo mật HMAC-SHA256 hoặc cơ chế đã được xác minh từ docs SePay, idempotency, đối soát; mock provider trong test.
- Test: Jest/Supertest, DB integration tests, Playwright E2E, test concurrency và webhook retries.
- Local: Node.js LTS, SQL Server local/Docker nếu hỗ trợ, SSMS; không cần hosting để chạy frontend/backend/database local.
- Cloud deploy: **chưa quyết định**; không tạo cloud resource hay dịch vụ trả phí.

## Giai đoạn 0 — Audit
- Đọc toàn bộ tài liệu, các bảng/hình/diagram, kiểm kê từng Frame/Figma node, map SRS UC ↔ UI ↔ route ↔ API ↔ DB.
- Xác thực Figma MCP đọc được Frame thật; nếu chưa thì ghi blocker, không giả vờ pixel-perfect.
- Kiểm tra mâu thuẫn SRS: trạng thái thanh toán (bao gồm “Thanh toán một phần”), trạng thái mặc định lịch hẹn online/offline; ghi `docs/OPEN_QUESTIONS.md` và đề xuất giải pháp. Không sửa tài liệu gốc.
- Đối chiếu 15 bảng vật lý; đề xuất migration **bổ sung** bảng/cột payment-integration nếu cần (transaction ID, external reference, unique order code, provider status, payload/log, expiration, reconciliation), chỉ áp dụng sau khi đã thông qua audit.

## Giai đoạn 1 — SQL Server + Backend nền tảng
- Tạo versioned SQL migrations, PK/FK/UNIQUE/CHECK/DEFAULT/index, seed 20 giường, tài khoản thử nghiệm có mật khẩu băm, script reset DB test.
- Backend NestJS theo module, config .env (không commit secrets), DTO, validation, error mapping, audit logs, API documentation, health endpoint.
- Auth/login/permissions tương thích SRS, 5 lần sai khóa 15 phút.

## Giai đoạn 2 — Business APIs UC_1–UC_10
- CRUD/queries cho khách hàng, lịch hẹn, dịch vụ, nhân viên, vai trò, đánh giá/phản hồi, báo cáo, tìm kiếm, lịch hẹn cá nhân.
- Lịch hẹn: 20 giường, không trùng khoảng thời gian, transaction DB + concurrency locking/serializable strategy + retry phù hợp, kể cả nhiều request đồng thời; kiểm tra toàn bộ thời lượng gói.
- Phân tách trạng thái lịch hẹn và thanh toán; huỷ lịch không xoá vĩnh viễn; xét điều kiện đánh giá theo SRS.

## Giai đoạn 3 — Frontend sát Figma
- Dùng Figma MCP để đọc tất cả frames, components, variants, assets, text/typography, spacing và flows.
- Dựng màn hình bằng React DOM/CSS thực, không dùng ảnh chụp toàn màn hình làm UI.
- Hoàn chỉnh màn hình khách hàng và admin với các trạng thái success/error/empty/loading/cancel/disabled, đối chiếu SRS.
- Dùng API thật cho luồng hoạt động, không để MSW/mock thay thế các chức năng được tuyên bố hoàn thành.
- Giữ nguyên 2 ảnh trang trí và không kéo giãn méo ảnh.

## Giai đoạn 4 — SePay QR + webhook
- Cấu hình tài khoản ngân hàng/SePay do người dùng tự thực hiện trên dashboard chính thức.
- Backend quyết định số tiền trên cơ sở giá dịch vụ/đặt lịch lưu trong SQL; tạo `payment reference` duy nhất và QR đúng số tiền, tài khoản nhận, nội dung chuyển khoản.
- Khi khách mở QR: chỉ tạo payment pending. Không bao giờ cập nhật thành đã thanh toán theo click, thời gian trôi qua hoặc callback từ trình duyệt.
- SePay gửi webhook tới endpoint HTTPS công khai; khi local có thể dùng tunnel được duyệt hoặc webhook mock cho test. Không cần deploy app để test local; thanh toán thật cần endpoint webhook truy cập được từ SePay.
- Xác minh chữ ký/token theo tài liệu SePay, kiểm tra tài khoản nhận, giao dịch tiền vào, mã tham chiếu, số tiền, mã giao dịch độc nhất, trạng thái và hạn thanh toán.
- Xử lý transaction atomically, idempotent theo SePay transaction ID; webhook trùng không làm tăng tiền nhận hai lần. Các trường hợp thiếu tiền, thừa tiền, sai nội dung, sai booking, quá hạn phải vào trạng thái review/đối soát, không âm thầm xác nhận sai.
- Frontend polling trạng thái từ Backend hoặc realtime; chỉ hiển thị paid sau khi DB xác nhận.
- Không lưu khóa SePay trong frontend/repo/logs; không yêu cầu nhập secrets vào hội thoại.

## Giai đoạn 5 — Test/acceptance
- Unit tests + integration SQL Server thật + E2E Playwright cho 10 UC và các nhánh lỗi.
- Test ít nhất: song song đặt 1 giường, login 5 sai/15 phút, RBAC bị từ chối, data validation, thanh toán QR đúng amount, webhook giả mạo, webhook duplicate/retry, số tiền thiếu/thừa, refresh trang, phản hồi mạng lỗi.
- So sánh screenshot từng Figma Frame ở đúng viewport, ghi `UI_COVERAGE.md` và `VISUAL_DIFF_REPORT.md`.
- `npm` scripts chạy lint/typecheck/build/test, hướng dẫn start local; danh sách lỗi/thay đổi còn tồn đọng, không tuyên bố pass nếu chưa chạy.
- Sau khi pass mới làm `docs/DEPLOYMENT_OPTIONS.md`, so sánh hosting sau; không tự deploy.

## Lưu ý từ SRS
SRS có bảng `ThanhToan` gồm `MaThanhToan`, `MaLichHen`, `SoTienThanhToan`, `NgayGhiNhan`, `TrangThaiGiaoDich`, `KhoanHoanTien` nhưng chưa thể hiện đủ trường đối soát webhook/provider; bắt buộc audit và migration bổ sung có kiểm soát. 15 bảng gốc vẫn phải giữ đúng định nghĩa đã duyệt.

## Kết quả cuối
- Fullstack chạy local trên máy tính; React ↔ NestJS ↔ SQL Server.
- QR thanh toán SePay đúng tiền; trạng thái thanh toán dựa trên webhook được xác thực.
- Bộ test và báo cáo minh chứng, README và .env.example.
- Chưa khóa nhà cung cấp hosting; kiến trúc dễ chuyển môi trường deploy.
