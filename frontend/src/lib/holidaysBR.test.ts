import { describe, expect, it } from 'vitest';
import { easter, holidaysBR } from './holidaysBR';

describe('holidays of Brazil', () => {
  it('finds Easter', () => {
    expect([easter(2025), easter(2026), easter(2027)].map((d) => `${d.getMonth() + 1}-${d.getDate()}`)).toEqual(['4-20', '4-5', '3-28']);
  });

  it('lists the fixed and the moving days of 2026 in order', () => {
    const byDate = Object.fromEntries(holidaysBR(2026).map((h) => [h.date, h.name]));
    expect(byDate['2026-01-01']).toBe('Confraternização Universal');
    expect(byDate['2026-02-16']).toBe('Carnaval');
    expect(byDate['2026-02-17']).toBe('Carnaval');
    expect(byDate['2026-04-03']).toBe('Sexta-feira Santa');
    expect(byDate['2026-04-05']).toBe('Páscoa');
    expect(byDate['2026-06-04']).toBe('Corpus Christi');
    expect(byDate['2026-11-20']).toBe('Consciência Negra');
    const dates = holidaysBR(2026).map((h) => h.date);
    expect(dates).toEqual([...dates].sort());
  });

  it('only counts Black Consciousness Day from 2024', () => {
    expect(holidaysBR(2023).some((h) => h.name === 'Consciência Negra')).toBe(false);
    expect(holidaysBR(2024).some((h) => h.name === 'Consciência Negra')).toBe(true);
  });
});
