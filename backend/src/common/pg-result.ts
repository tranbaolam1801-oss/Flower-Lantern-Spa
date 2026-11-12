/**
 * TypeORM's PostgreSQL query runner returns plain `rows` for SELECT/INSERT, but `[rows, rowCount]` for
 * UPDATE and DELETE (typeorm/driver/postgres/PostgresQueryRunner: `result.raw = [raw.rows, raw.rowCount]`).
 * These helpers read either shape, so callers do not depend on which statement kind produced the result.
 */
type UpdateShape<T> = [T[], number];

function isUpdateShape<T>(result: unknown): result is UpdateShape<T> {
  return Array.isArray(result) && result.length === 2 && Array.isArray(result[0]) && typeof result[1] === 'number';
}

/** Rows produced by the statement (SELECT rows, or INSERT/UPDATE/DELETE ... RETURNING rows). */
export function returnedRows<T>(result: unknown): T[] {
  if (isUpdateShape<T>(result)) return result[0];
  return Array.isArray(result) ? (result as T[]) : [];
}

/** Number of rows changed by UPDATE/DELETE; for other statements, the number of returned rows. */
export function affectedRows(result: unknown): number {
  if (isUpdateShape(result)) return result[1];
  return Array.isArray(result) ? result.length : 0;
}
