/*
  MANUAL SETUP - NOT EXECUTED BY CLAUDE. Review every line, then run it yourself in SSMS.

  Purpose : a dedicated, least-privilege SQL login for running the SQL integration tests against
            FlowerLanternSpa_Test with the pure-JavaScript `tedious` driver (the native msnodesqlv8
            driver is blocked by Smart App Control). No code or dependency change is needed:
            backend/src/config.ts already uses tedious whenever DB_AUTH is not 'windows' and
            DB_HOST / DB_NAME / DB_USER / DB_PASSWORD are set.

  Run as  : your own Windows login (a sysadmin) in SSMS, new query window, any database.
            Run SECTION 1 once. SECTION 2 is read-only verification. SECTION 3 removes everything.

  What it creates (and nothing else):
    - server login  [spa_test_runner]  : SQL authentication, password policy ON, NOT in any server role,
                                         default database FlowerLanternSpa_Test, no access to any other
                                         user database (see verification step 2.1).
    - database user [spa_test_runner]  : in FlowerLanternSpa_Test only.
    - database role [spa_test_app]     : SELECT, INSERT, UPDATE, DELETE and VIEW DEFINITION on schema dbo.
                                         No ALTER / CREATE / DROP / TRUNCATE / EXECUTE / CONTROL, so it cannot
                                         change schema, create objects, or touch logins and permissions.

  Why these permissions: the integration specs run rolled-back INSERT/UPDATE/DELETE fixtures plus the
  lockout tests, and the schema audit reads table/column/FK metadata (VIEW DEFINITION). They run no DDL,
  no EXEC and no temp-table setup. Schema-level grants also cover future dbo tables (e.g. PhienDangNhap,
  SePayWebhookEvent) without another script.

  Password handling: put a NEW random password in @Password below. Do NOT reuse any existing password,
  do NOT paste it into chat or commit it, and close this tab WITHOUT saving (otherwise the file on disk
  contains the password). The password is a local-only secret: store it in the untracked env file
  described at the bottom.

  Safety: SECTION 1 is a single batch with no GO, so a failed guard (THROW) stops everything before any
  change. Nothing here touches FlowerLanternSpa_Dev, FlowerLanternSpa_3NF or any other database.
*/

-- =============================== SECTION 1 : CREATE (run once) ===============================
SET NOCOUNT ON;
SET XACT_ABORT ON;

DECLARE @Password nvarchar(128) = N'<<REPLACE_WITH_A_NEW_STRONG_PASSWORD_16+_CHARS>>';

IF DB_ID(N'FlowerLanternSpa_Test') IS NULL
  THROW 51001, N'FlowerLanternSpa_Test does not exist. Nothing was changed.', 1;
IF @Password LIKE N'<<%' OR LEN(@Password) < 16
  THROW 51002, N'Set @Password to a new strong secret of at least 16 characters. Nothing was changed.', 1;
IF EXISTS (SELECT 1 FROM sys.server_principals WHERE name = N'spa_test_runner')
  THROW 51003, N'Login spa_test_runner already exists. Review it with SECTION 2 or remove it with SECTION 3 first. Nothing was changed.', 1;
IF EXISTS (SELECT 1 FROM FlowerLanternSpa_Test.sys.database_principals WHERE name IN (N'spa_test_runner', N'spa_test_app'))
  THROW 51004, N'A user or role with that name already exists in FlowerLanternSpa_Test. Nothing was changed.', 1;

DECLARE @sql nvarchar(max) =
    N'CREATE LOGIN [spa_test_runner] WITH PASSWORD = N''' + REPLACE(@Password, N'''', N'''''') + N''', '
  + N'CHECK_POLICY = ON, CHECK_EXPIRATION = OFF, '
  + N'DEFAULT_DATABASE = [FlowerLanternSpa_Test], DEFAULT_LANGUAGE = [us_english];';
EXEC (@sql);

-- Runs inside FlowerLanternSpa_Test (three-part name sets the database context for the dynamic batch).
EXEC [FlowerLanternSpa_Test].sys.sp_executesql N'
CREATE USER [spa_test_runner] FOR LOGIN [spa_test_runner] WITH DEFAULT_SCHEMA = [dbo];
CREATE ROLE [spa_test_app] AUTHORIZATION [dbo];
ALTER ROLE [spa_test_app] ADD MEMBER [spa_test_runner];
GRANT SELECT, INSERT, UPDATE, DELETE, VIEW DEFINITION ON SCHEMA::[dbo] TO [spa_test_app];
';

SELECT N'created' AS result, N'spa_test_runner' AS login_name, N'FlowerLanternSpa_Test' AS database_name;
GO

-- ============================ SECTION 2 : VERIFY (read-only, run after section 1) ============================
-- 2.1  Server level: not sysadmin, no server role, sees no user database other than the Test one.
--      EXPECT: is_sysadmin = 0; has_access = 1 only for FlowerLanternSpa_Test (master and tempdb are
--      always reachable through the guest user and are expected to show 1 as well).
EXECUTE AS LOGIN = N'spa_test_runner';
SELECT SUSER_SNAME() AS running_as, IS_SRVROLEMEMBER(N'sysadmin') AS is_sysadmin;
SELECT name, HAS_DBACCESS(name) AS has_access FROM sys.databases ORDER BY name;
REVERT;
GO

SELECT r.name AS server_role
FROM sys.server_role_members m
JOIN sys.server_principals r ON r.principal_id = m.role_principal_id
JOIN sys.server_principals p ON p.principal_id = m.member_principal_id
WHERE p.name = N'spa_test_runner';   -- EXPECT: zero rows
GO

-- 2.2  Database level (inside FlowerLanternSpa_Test).
--      EXPECT: select/insert/update/delete/view_definition = 1; alter/control/create_table/alter_users/execute = 0.
USE [FlowerLanternSpa_Test];
EXECUTE AS USER = N'spa_test_runner';
SELECT
  HAS_PERMS_BY_NAME(N'dbo.LichHen', N'OBJECT', N'SELECT')          AS can_select,
  HAS_PERMS_BY_NAME(N'dbo.LichHen', N'OBJECT', N'INSERT')          AS can_insert,
  HAS_PERMS_BY_NAME(N'dbo.LichHen', N'OBJECT', N'UPDATE')          AS can_update,
  HAS_PERMS_BY_NAME(N'dbo.LichHen', N'OBJECT', N'DELETE')          AS can_delete,
  HAS_PERMS_BY_NAME(N'dbo.LichHen', N'OBJECT', N'VIEW DEFINITION') AS can_view_definition,
  HAS_PERMS_BY_NAME(N'dbo.LichHen', N'OBJECT', N'ALTER')           AS can_alter_table,
  HAS_PERMS_BY_NAME(N'dbo.LichHen', N'OBJECT', N'CONTROL')         AS can_control_table,
  HAS_PERMS_BY_NAME(DB_NAME(), N'DATABASE', N'CREATE TABLE')       AS can_create_table,
  HAS_PERMS_BY_NAME(DB_NAME(), N'DATABASE', N'ALTER ANY USER')     AS can_alter_users,
  HAS_PERMS_BY_NAME(DB_NAME(), N'DATABASE', N'EXECUTE')            AS can_execute_any;
REVERT;
GO

-- 2.3  This script does not change data. Counts to compare with before (17 tables, 20 beds).
SELECT (SELECT COUNT(*) FROM sys.tables) AS tables, (SELECT COUNT(*) FROM dbo.Giuong) AS beds;
GO

/* ================================ SECTION 3 : REMOVE (only to undo) ================================
   Un-comment and run to delete the login, user and role. Does not touch any data.

USE [FlowerLanternSpa_Test];
IF DATABASE_PRINCIPAL_ID(N'spa_test_runner') IS NOT NULL DROP USER [spa_test_runner];
IF DATABASE_PRINCIPAL_ID(N'spa_test_app')    IS NOT NULL DROP ROLE [spa_test_app];
GO
USE master;
DECLARE @kill nvarchar(max) = N'';
SELECT @kill += N'KILL ' + CAST(session_id AS nvarchar(10)) + N'; '
FROM sys.dm_exec_sessions WHERE login_name = N'spa_test_runner';
EXEC (@kill);
IF EXISTS (SELECT 1 FROM sys.server_principals WHERE name = N'spa_test_runner') DROP LOGIN [spa_test_runner];
GO
   ============================================================================================== */

/* ================== AFTER YOU RUN IT: how the tests will use the login (no secrets in git) ==================
   1) Create backend/.env.test.local (git-ignored by `.env.*`), never commit it:
        DB_AUTH=sql
        DB_HOST=localhost
        DB_PORT=1433
        DB_NAME=FlowerLanternSpa_Test
        DB_USER=spa_test_runner
        DB_PASSWORD=<the password you chose>
        DB_TRUST_CERTIFICATE=true        (local self-signed server certificate; tests only)
        RUN_SQL_INTEGRATION=1
   2) Run from C:\Spa\backend (the file is loaded into the process only; nothing is printed):
        PowerShell: Get-Content .env.test.local | ForEach-Object { if ($_ -match '^\s*([A-Z_]+)=(.*)$') { Set-Item "env:$($Matches[1])" $Matches[2] } }; npx jest --runInBand
   3) To rotate the password later:  ALTER LOGIN [spa_test_runner] WITH PASSWORD = N'<new password>';
   Never point DB_NAME at FlowerLanternSpa_Dev with this login (it has no access there, and the specs refuse
   to run unless DB_NAME is FlowerLanternSpa_Test).
   ===================================================================================================== */
