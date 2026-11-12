# T-SQL → PostgreSQL conversion guide (Flower Lantern Spa)

Rollback point for the SQL Server implementation: git tag `sqlserver-baseline` (commit `d64bd92`).
Schema: `database/postgres/001-schema.sql` (schema `dbo`, unquoted identifiers, see header).
Driver: TypeORM `postgres` + `pg`. Connection: `DATABASE_URL` (Neon pooled URL in production).

## Fixed foundation (do NOT edit — report needs instead)
`src/config.ts`, `src/database.service.ts`, `src/common/*`, `src/testing/pg-test-server.ts`,
`src/app.module.ts`, `src/setup.ts`, `src/main.ts`, `database/postgres/001-schema.sql`.

Already provided:
- `DatabaseService.query(sql, params)` — `$1..$n` placeholders; driver errors → 503 (unchanged contract).
- `DatabaseService.transaction(async (runner) => { ... })` — BEGIN/COMMIT, rollback + rethrow on any error.
- `returnedRows(result)` / `affectedRows(result)` (`common/pg-result.ts`) — TypeORM returns `[rows, rowCount]`
  for UPDATE/DELETE and plain `rows` otherwise.
- `isUniqueViolation(e)` (`common/db-errors.ts`) — SQLSTATE 23505 (replaces SQL Server 2627/2601).
- Result parsing matches the old driver: `timestamp` → `Date` read as UTC wall-clock; `date` → `Date` at UTC
  midnight; `time` → `Date` on 1970-01-01 UTC; `numeric`/`bigint` → `number`.

## Rules
1. **Placeholders** `@0, @1, …` → `$1, $2, …` (shift by one). Params are positional and may be reused.
2. **One statement per parameterised query.** pg's extended protocol rejects multi-statement strings with
   parameters. T-SQL batches (`DECLARE`, `IF … BEGIN … END`, `BEGIN TRY/CATCH`, `BEGIN TRANSACTION`, `THROW`,
   `@@TRANCOUNT`, `SET XACT_ABORT`) become `this.database.transaction(async (r) => { … })` with sequential
   queries and JS control flow. Throw the same Nest exceptions with the **exact same Vietnamese messages and
   HTTP status codes** inside the callback (that rolls back).
3. **Locks.** `WITH (UPDLOCK, HOLDLOCK)` / `WITH (UPDLOCK)` table hints are removed.
   - Locking existing rows to serialise writers (e.g. the per-bed lock on `dbo.Giuong`): `SELECT … FOR UPDATE`
     (with joins: `FOR UPDATE OF <alias>`). Not allowed with aggregates/DISTINCT/GROUP BY.
   - `MAX(id)+1` key generation or "check-not-exists-then-insert" that relied on HOLDLOCK range locks: take a
     transaction-scoped advisory lock first: `SELECT pg_advisory_xact_lock(hashtext($1))` with a stable key
     such as `'dbo.TaiKhoan:id'` or `'phone:' || phone`. Transaction-scoped locks are safe on Neon's PgBouncer
     (transaction mode); **never** use session-level `pg_advisory_lock`, `SET`, `PREPARE`, temp tables.
   - Keep unique indexes as the final guard and map `isUniqueViolation` to the same 409 message.
4. **Functions / syntax**
   | T-SQL | PostgreSQL |
   |---|---|
   | `TOP (n)` / `TOP n` | `LIMIT n` (at the end) |
   | `GETDATE()` | `dbo.vn_now()` (Vietnam wall-clock, as on the original server) |
   | `SYSUTCDATETIME()` | `dbo.utc_now()` |
   | `ISNULL(a,b)` | `COALESCE(a,b)` |
   | `CHARINDEX(a, b)` | `strpos(b, a)` (argument order swaps) |
   | `LEN(x)` | `char_length(rtrim(x))` (LEN ignores trailing blanks) |
   | `a + b` (strings) | `a \|\| b` (check every `+` is string, not numeric) |
   | `CONVERT(datetime, @x, 126)` | `$x::timestamp` |
   | `CONVERT(date, @x)` / `CAST(@x AS date)` | `$x::date` |
   | `CONVERT(varchar(19), col, 126)` | `to_char(col, 'YYYY-MM-DD"T"HH24:MI:SS')` |
   | `CONVERT(varchar(10), d, 23)` / style 120 date part | `to_char(d, 'YYYY-MM-DD')` |
   | `CONVERT(varchar(5), t, 108)` | `to_char(t, 'HH24:MI')` |
   | `CAST(x AS nvarchar(n))` | `x::varchar(n)` (or `::text`) |
   | `CAST(x AS money)` / `decimal` | `x::numeric(19,4)` |
   | `CAST(x AS int)` | `x::int` |
   | `TRY_CAST(x AS …)` | validate in TypeScript first (no direct equivalent) |
   | `DATEADD(minute, n, d)` | `d + make_interval(mins => n)` (n must be int: `$2::int`) |
   | `DATEADD(day, n, d)` | `d + make_interval(days => n)` |
   | `DATEDIFF(minute, a, b)` | `floor(extract(epoch FROM (b - a)) / 60)::int` |
   | `DATEDIFF(day, a, b)` | `(b::date - a::date)` |
   | `OFFSET x ROWS FETCH NEXT y ROWS ONLY` | unchanged (standard SQL, supported) — pass integers |
   | `N'text'` | allowed as-is (or plain `'text'`) |
   | `UPDATE … OUTPUT inserted.c WHERE …` | `UPDATE … WHERE … RETURNING c` + `returnedRows()` |
   | `INSERT … OUTPUT inserted.c VALUES …` | `INSERT … VALUES … RETURNING c` |
   | `@@ROWCOUNT` | `affectedRows(result)` |
   | `CASE WHEN … THEN 1 ELSE 0 END` | unchanged (int) unless the code expects boolean |
5. **Case-insensitive matching.** SQL Server's default collation is case-insensitive. User-facing searches
   (`LIKE`) → `ILIKE`. Equality checks used for duplicate detection on names → `lower(a) = lower($n)`.
   T-SQL LIKE treats `[ ]` as pattern syntax; PostgreSQL does not — re-check any LIKE escaping helper.
6. **Result column names.** Unquoted identifiers and aliases come back **lowercase**. Quote every alias that
   TypeScript reads in camelCase: `AS "bookingId"`. TypeScript that reads unaliased PascalCase columns
   (`rows[0].TrangThai`) must alias them (`TrangThai AS "TrangThai"`) or read lowercase.
7. **Types of parameters.** Cast where PostgreSQL cannot infer: `$1::timestamp`, `$1::date`, `$1::time`,
   `$1::int`, `$1::numeric`, `$1::text` (e.g. `$3::text IS NULL OR …`). Untyped `NULL` comparisons such as
   `(@3 IS NULL OR x <> @3)` need `($4::text IS NULL OR x <> $4)`.
8. **Booking rules are unchanged**: 08:00–22:00, beds G1–G15, full duration within hours, no overlap,
   no past bookings, completed/cancelled locked, staff → "Chưa đến", online → "Chờ xác nhận".

## Tests (per area)
- Update the existing mocked `*.spec.ts` for SQL-text assertions (mocks must expect `$n`, not `@n`).
- Replace the area's SQL Server-only `*.sql.integration.spec.ts` with `*.pg.spec.ts` that uses
  `startPgTestServer()` (see `src/testing/pg-foundation.pg.spec.ts`): seed minimal fixtures with `pg.exec`,
  call the real service/controller methods, and execute **every converted query at least once**.
- Run: `cd backend && node --experimental-vm-modules ../node_modules/jest/bin/jest.js --runInBand <specs>`
  and `npx tsc --noEmit -p .` and `npx eslint <files>` from the repo root.
