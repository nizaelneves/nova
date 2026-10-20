export interface Holiday { date: string; name: string }

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Easter Sunday of `year` (the Gregorian computus of Meeus, Jones and Butcher). */
export function easter(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

const shift = (base: Date, days: number): Date => new Date(base.getFullYear(), base.getMonth(), base.getDate() + days);

/**
 * The national holidays of Brazil in `year`, and the optional days many people take off (Carnival, Easter,
 * Corpus Christi). The rules are written here from the public law and the church calendar; no data set is used.
 */
export function holidaysBR(year: number): Holiday[] {
  const fixed: [string, string][] = [
    ['01-01', 'Confraternização Universal'],
    ['04-21', 'Tiradentes'],
    ['05-01', 'Dia do Trabalho'],
    ['09-07', 'Independência do Brasil'],
    ['10-12', 'Nossa Senhora Aparecida'],
    ['11-02', 'Finados'],
    ['11-15', 'Proclamação da República'],
    ['12-25', 'Natal'],
  ];
  if (year >= 2024) fixed.push(['11-20', 'Consciência Negra']);
  const holidays: Holiday[] = fixed.map(([md, name]) => ({ date: `${year}-${md}`, name }));
  const sunday = easter(year);
  holidays.push(
    { date: iso(shift(sunday, -48)), name: 'Carnaval' },
    { date: iso(shift(sunday, -47)), name: 'Carnaval' },
    { date: iso(shift(sunday, -2)), name: 'Sexta-feira Santa' },
    { date: iso(sunday), name: 'Páscoa' },
    { date: iso(shift(sunday, 60)), name: 'Corpus Christi' },
  );
  return holidays.sort((a, b) => a.date.localeCompare(b.date));
}
