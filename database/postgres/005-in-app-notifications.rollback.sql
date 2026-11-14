-- Rollback of 005-in-app-notifications.sql. Drops ONLY the in-app notification table (history of bell notifications is lost).
-- No customer, employee, booking, payment, avatar (006) or permission-audit data is touched. Take a Neon branch/backup first.
BEGIN;
DROP TABLE IF EXISTS dbo.ThongBaoNoiBo;
COMMIT;
