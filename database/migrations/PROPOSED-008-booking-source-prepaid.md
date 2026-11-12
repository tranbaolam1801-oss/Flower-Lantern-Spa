# PROPOSED-008 — booking source (`Nguồn đặt lịch`) and prepaid amount

Status: PROPOSED / NOT APPLIED. Nothing here was executed or parse-checked by a SQL Server. Needs explicit user approval (additive change to the approved 15-table baseline).

## Findings (read-only, Test DB `sys.columns` + SRS `audit/extracted/50K141.04.3007.txt`)

| Item | SRS evidence | Existing column that could hold it | Verdict |
|---|---|---|---|
| Nguồn đặt lịch | L375 staff enters "nguồn đặt lịch"; L548 search filter "nguồn"; L968/L1022/BR-UC5.1-03 online bookings must be recorded with source "ONLINE"; L3818/L4023 UI Select | `dbo.LichHen` has no source/channel column. `KhachHang.KenhLienHe` is the customer's contact channel (a customer attribute, not per booking). `TrangThaiLichHen` is the status. | **No column fits -> one additive column is required.** Deriving "ONLINE" from status ("Chờ xác nhận") is unreliable (staff can confirm, staff-created bookings can start in other states). |
| Thanh toán trả trước | L378 staff records prepaid payment; L3862 "Thanh toán trả trước", Input Amount, VND; L3865 payment status Chưa thanh toán / Thanh toán một phần / Đã thanh toán | `dbo.ThanhToan` (`SoTienThanhToan MONEY`, `TrangThaiGiaoDich`, `NgayGhiNhan`, FK `MaLichHen`) already records a payment amount per booking. | **No new column needed.** Store prepaid as a `ThanhToan` row (`SoTienThanhToan` = prepaid amount, `TrangThaiGiaoDich` = N'Thành công', `NhaCungCap` NULL = manual/cash entry; after 007 the provider columns stay NULL) and compute `LichHen.TrangThaiThanhToan` from the rows (the booking/payments code already recomputes it). |

Consequence: only **`LichHen.NguonDatLich`** needs a migration. Prepaid is a code change (insert a manual `ThanhToan` row in the booking transaction), not a schema change. Note open item 6 in `PAYMENT_SEPAY_PROPOSAL.md` (manual payment status without a `ThanhToan` row) is closed by the same approach.

## Proposed migration (copy into `database/migrations/008-lichhen-nguon-dat-lich.PROPOSED.sql` only after approval; kept inline here so no un-approved executable file exists)

Allow-list: `FlowerLanternSpa_Test` now; for Staging replace the guard exactly as in `staging/*.PROPOSED.sql` (single `@AllowedDb` variable).

```sql
-- PROPOSED / NOT APPLIED. Additive. Single batch (no GO).
SET XACT_ABORT ON; SET QUOTED_IDENTIFIER ON; SET ANSI_NULLS ON;
IF DB_NAME() NOT IN (N'FlowerLanternSpa_Test')
  THROW 51008, N'Migration 008 is proposed for FlowerLanternSpa_Test only. Nothing was changed.', 1;
BEGIN TRANSACTION;
IF COL_LENGTH('dbo.LichHen','NguonDatLich') IS NULL
  ALTER TABLE dbo.LichHen ADD NguonDatLich NVARCHAR(50) NULL;
COMMIT TRANSACTION;
```

- Type `NVARCHAR(50) NULL` mirrors `KhachHang.KenhLienHe`. No CHECK/enum: the SRS fixes only the value `ONLINE`; the staff-selectable list is not enumerated (open decision: e.g. `Trực tiếp`, `Điện thoại`, `Zalo`, `Facebook`).
- Existing rows keep NULL (no backfill; none is invented). The API should present NULL as "chưa ghi nhận". Test currently has 0 LichHen rows.
- Code impact when applied: `backend/src/entities/lich-hen.entity.ts` add `NguonDatLich` (nvarchar 50, nullable); booking write/search read-write it (`source` in `booking-write.dto.ts`); online bookings write `ONLINE`.
- Verify: `SELECT name, TYPE_NAME(user_type_id), max_length, is_nullable FROM sys.columns WHERE object_id=OBJECT_ID('dbo.LichHen') AND name='NguonDatLich';` -> nvarchar, 100, 1.
- Rollback: `ALTER TABLE dbo.LichHen DROP COLUMN NguonDatLich;` (loses stored sources; run only if no data must be kept).

## Approval line
"Approve adding dbo.LichHen.NguonDatLich NVARCHAR(50) NULL (PROPOSED-008) on FlowerLanternSpa_Test" and "Approve storing prepaid as a manual dbo.ThanhToan row (no schema change)".
