export function normalizeDOB(inputRaw: string): string {
  if (!inputRaw) return '';
  const raw = inputRaw.trim();
  // 1) yyyy-mm-dd or yyyy/mm/dd -> dd/mm/yyyy
  let m = raw.match(/^([12]\d{3})[-\/.]([01]?\d)[-\/.]([0-3]?\d)$/);
  if (m) {
    const yyyy = parseInt(m[1], 10);
    const mm = Math.max(1, Math.min(12, parseInt(m[2], 10)));
    const dd = Math.max(1, Math.min(31, parseInt(m[3], 10)));
    return `${String(dd).padStart(2, '0')}/${String(mm).padStart(2, '0')}/${String(yyyy)}`;
  }
  // 2) dd-mm-yyyy or dd/mm/yyyy or dd.mm.yyyy
  m = raw.match(/^([0-3]?\d)[-\/.]([01]?\d)[-\/.]([12]\d{3})$/);
  if (m) {
    const dd = Math.max(1, Math.min(31, parseInt(m[1], 10)));
    const mm = Math.max(1, Math.min(12, parseInt(m[2], 10)));
    const yyyy = parseInt(m[3], 10);
    return `${String(dd).padStart(2, '0')}/${String(mm).padStart(2, '0')}/${String(yyyy)}`;
  }
  // 3) dd-mm-yy or dd/mm/yy
  m = raw.match(/^([0-3]?\d)[-\/.]([01]?\d)[-\/.](\d{2})$/);
  if (m) {
    const dd = Math.max(1, Math.min(31, parseInt(m[1], 10)));
    const mm = Math.max(1, Math.min(12, parseInt(m[2], 10)));
    let yy = parseInt(m[3], 10);
    const yyyy = yy < 30 ? 2000 + yy : 1900 + yy;
    return `${String(dd).padStart(2, '0')}/${String(mm).padStart(2, '0')}/${String(yyyy)}`;
  }
  // 4) dd MON yy(yy) e.g., 07 JUL 96 or 07 Jul 1996
  m = raw.match(/^([0-3]?\d)\s+([A-Za-z]{3,})\s+(\d{2,4})$/);
  if (m) {
    const dd = Math.max(1, Math.min(31, parseInt(m[1], 10)));
    const mon = m[2].toLowerCase().slice(0, 3);
    const monMap: Record<string, number> = { jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12 };
    const mm = monMap[mon] || 0;
    let year = parseInt(m[3], 10);
    if (year < 100) year = year < 30 ? 2000 + year : 1900 + year;
    if (mm >= 1 && mm <= 12) {
      return `${String(dd).padStart(2, '0')}/${String(mm).padStart(2, '0')}/${String(year)}`;
    }
  }
  // Fallback
  return raw;
}

