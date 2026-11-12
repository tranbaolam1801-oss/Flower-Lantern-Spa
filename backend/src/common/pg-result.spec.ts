import { affectedRows, returnedRows } from './pg-result';
import { isUniqueViolation, isForeignKeyViolation } from './db-errors';

describe('pg-result', () => {
  it('reads SELECT rows as-is', () => {
    expect(returnedRows([{ a: 1 }, { a: 2 }])).toEqual([{ a: 1 }, { a: 2 }]);
    expect(affectedRows([{ a: 1 }])).toBe(1);
  });
  it('unwraps the [rows, rowCount] shape TypeORM returns for UPDATE/DELETE', () => {
    expect(returnedRows([[{ id: 'LH1' }], 1])).toEqual([{ id: 'LH1' }]);
    expect(affectedRows([[], 3])).toBe(3);
  });
  it('treats non-arrays as empty', () => {
    expect(returnedRows(undefined)).toEqual([]);
    expect(affectedRows(null)).toBe(0);
  });
});

describe('db-errors', () => {
  it('detects unique violations from TypeORM QueryFailedError and raw pg errors', () => {
    expect(isUniqueViolation({ driverError: { code: '23505' } })).toBe(true);
    expect(isUniqueViolation({ code: '23505' })).toBe(true);
    expect(isUniqueViolation({ code: '23503' })).toBe(false);
    expect(isUniqueViolation(new Error('x'))).toBe(false);
  });
  it('detects foreign-key violations', () => expect(isForeignKeyViolation({ code: '23503' })).toBe(true));
});
