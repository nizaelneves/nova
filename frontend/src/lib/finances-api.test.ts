import { describe, expect, it } from 'vitest';
import { parseAmountToCents, formatCents } from './finances-api';

describe('parseAmountToCents', () => {
  it('parses plain numbers exactly, avoiding float drift', () => {
    expect(parseAmountToCents('19.99')).toBe(1999);
    expect(parseAmountToCents('19,99')).toBe(1999);
    expect(parseAmountToCents('10')).toBe(1000);
    expect(parseAmountToCents('0.1')).toBe(10);
  });

  it('treats the last comma or dot as the decimal separator', () => {
    expect(parseAmountToCents('1.234,56')).toBe(123456);
    expect(parseAmountToCents('1,234.56')).toBe(123456);
    expect(parseAmountToCents('1234')).toBe(123400);
  });

  it('rejects empty or non-numeric input', () => {
    expect(parseAmountToCents('')).toBeNull();
    expect(parseAmountToCents('   ')).toBeNull();
    expect(parseAmountToCents('abc')).toBeNull();
  });

  it('formats centavos as BRL', () => {
    expect(formatCents(1999)).toContain('19,99');
    expect(formatCents(1999)).toContain('R$');
  });
});
