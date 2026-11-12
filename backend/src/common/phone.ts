export const VN_MOBILE_STORED = /^0[0-9]{9}$/;

// Canonical storage form is 0xxxxxxxxx (CHAR(10)); +84xxxxxxxxx is the only accepted alternative and maps 1:1 to it.
export function normalizeVnPhone(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  const canonical = /^\+84[0-9]{9}$/.test(value) ? `0${value.slice(3)}` : value;
  return VN_MOBILE_STORED.test(canonical) ? canonical : null;
}

// For class-transformer: converts valid input to canonical form, leaves invalid input untouched so validation reports it.
export const phoneTransform = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? (normalizeVnPhone(value) ?? value.trim()) : value;
