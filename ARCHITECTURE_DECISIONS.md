# Quyết định kiến trúc

- ADR-001: Prompt.md là hướng dẫn triển khai chính; SRS 7.2 là baseline vật lý. SQL đề xuất và database cũ được audit, không ghi đè.
- ADR-002: Frontend/backend npm workspaces, API REST `/api`, Vite proxy cùng origin để chuẩn bị cookie HttpOnly. Mỗi lớp có build/typecheck riêng.
- ADR-003: Không tự đồng bộ schema; migration SQL có kiểm soát. Database Dev riêng. Không đổi hosting hoặc cấp tài nguyên cloud.
- ADR-004: Liveness độc lập readiness. SQL không sẵn sàng trả 503; không thay bằng dữ liệu giả hoặc mảng rỗng để che lỗi.
- ADR-005: Catalog public lọc theo BR-UC6-01 Hoạt động; tìm kiếm parameterized, escape LIKE, Vietnamese_100_CI_AS. Endpoint còn là foundation, chưa đủ UC_6/7.
- ADR-006: Chưa dựng auth tạm thời bằng tài khoản/mật khẩu mẫu. Form chỉ kiểm tra UI cho đến khi hoàn tất bảo mật/lockout SQL và kiểm thử.
- ADR-007: Windows integrated authentication chỉ cho localhost development; SQL authentication độc lập nền tảng vẫn có sẵn qua env. Không đưa mật khẩu Windows vào ứng dụng.
- ADR-008: Mọi payment provider sản xuất là SePay; mock chỉ trong test. Schema payment bổ sung phải được duyệt trước áp dụng.
- ADR-009 (thay ADR-006): Login dùng API thật Argon2id/JWT cookie. Secret cấu hình riêng ít nhất 32 bytes; HS256 issuer/audience cố định. Guard đọc quyền/trạng thái SQL hiện tại. SQL outage trả 503.
- ADR-010: Browser mutations cần `X-Spa-Request: 1` và origin hợp lệ. Webhook SePay tương lai phải xác thực riêng theo tài liệu chính thức; hiện chưa có endpoint webhook.
- ADR-011: E2E dùng cổng riêng 5183/3100, không dừng server đang mở. SQL integration fixture rollback; E2E tài khoản seed local opt-in, không tự seed.
- ADR-012: Repair mojibake seed theo exact corrupted value/ID trong transaction, không đổi hashes/schema. SQL UTF-8 luôn chạy `sqlcmd -f 65001`.
