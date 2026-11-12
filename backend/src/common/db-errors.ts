/** PostgreSQL SQLSTATE codes the application reacts to (replaces SQL Server error numbers 2627/2601/547). */
export const PG_UNIQUE_VIOLATION = '23505';
export const PG_FOREIGN_KEY_VIOLATION = '23503';
export const PG_CHECK_VIOLATION = '23514';

type DriverError = { code?: unknown; driverError?: { code?: unknown } };

function sqlState(error: unknown): string | undefined {
  const e = error as DriverError | null | undefined;
  const code = e?.driverError?.code ?? e?.code;
  return typeof code === 'string' ? code : undefined;
}

/** True for a duplicate-key error from a unique index/constraint (TypeORM QueryFailedError or raw pg error). */
export const isUniqueViolation = (error: unknown): boolean => sqlState(error) === PG_UNIQUE_VIOLATION;
export const isForeignKeyViolation = (error: unknown): boolean => sqlState(error) === PG_FOREIGN_KEY_VIOLATION;
export const isCheckViolation = (error: unknown): boolean => sqlState(error) === PG_CHECK_VIOLATION;
