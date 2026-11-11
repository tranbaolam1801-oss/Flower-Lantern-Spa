# Handover history (append-only)

- 2026-11-11: Khôi phục từ d857c77/main, giữ toàn bộ unfinished changes. Test read-only: 16 tables, 20 beds, chưa PhienDangNhap; Test-only approval có hiệu lực, Dev chưa duyệt. Tạo HANDOVER.md trước DDL. Historical tests 62/62 SQL, 7/7 E2E, không coi là lần chạy mới.
- 2026-11-11: Migration 004 applied once on Test after preflight alias fix; verification PASS baseline columns/counts preserved, 17 tables, 20 beds. Dev unchanged. Auth integration in progress.
