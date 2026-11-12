import { normalizeVnPhone, phoneTransform } from './phone';

describe('normalizeVnPhone', () => {
  it('keeps canonical 10-digit numbers unchanged', () => {
    expect(normalizeVnPhone('0912345678')).toBe('0912345678');
  });
  it('maps +84 to the 0-prefixed form without dropping digits', () => {
    expect(normalizeVnPhone('+84912345678')).toBe('0912345678');
  });
  it('trims surrounding whitespace only', () => {
    expect(normalizeVnPhone('  0912345678 ')).toBe('0912345678');
  });
  it.each(['091234567', '09123456789', '+8491234567', '+849123456789', '84912345678', '0912-345-678', '09123a5678', '', null, undefined, 912345678])(
    'rejects %p instead of truncating or guessing',
    (value) => expect(normalizeVnPhone(value)).toBeNull(),
  );
  it('transform leaves invalid input untouched so validation can report it', () => {
    expect(phoneTransform({ value: '+84912345678' })).toBe('0912345678');
    expect(phoneTransform({ value: '09123456789' })).toBe('09123456789');
    expect(phoneTransform({ value: 5 })).toBe(5);
  });
});
