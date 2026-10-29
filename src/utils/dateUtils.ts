import { Schedule, DatePrecision } from '../types';

/**
 * Remove Vietnamese accents and convert to lower case for search matching,
 * matching PC python `search_key`:
 * text = unicodedata.normalize('NFD', str(value or '').casefold())
 * text = ''.join(ch for ch in text if not unicodedata.combining(ch))
 * return text.replace('đ', 'd')
 */
export function searchKey(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value).toLowerCase();
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .trim();
}

/**
 * Format ISO date (YYYY-MM-DD) to Vietnamese standard DD/MM/YYYY
 */
export function displayDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const parts = iso.split('-');
  if (parts.length === 3) {
    const [y, m, d] = parts;
    return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
  }
  return iso;
}

/**
 * Format document number and symbol without duplicating symbol if number already ends with it
 */
export function formatDocCode(number: string | null | undefined, symbol: string | null | undefined): string {
  const num = (number || '').trim();
  const sym = (symbol || '').trim();
  if (!sym) return num;
  if (!num) return sym;
  if (
    num.toLowerCase() === sym.toLowerCase() ||
    num.toLowerCase().endsWith(`/${sym.toLowerCase()}`)
  ) {
    return num;
  }
  return `${num}/${sym}`;
}

/**
 * Format Period label (YYYY -> YYYY, YYYY-MM -> MM/YYYY, YYYY-MM-DD -> DD/MM/YYYY)
 */
export function periodLabel(iso: string | null | undefined): string {
  if (!iso) return '';
  if (iso.length === 4) return iso;
  if (iso.length === 7) {
    const [y, m] = iso.split('-');
    return `${m}/${y}`;
  }
  return displayDate(iso);
}

/**
 * Auto-format date input with '/' separators as user types (e.g. 29102026 -> 29/10/2026)
 */
export function formatDateInputMask(value: string, prevValue = ''): string {
  if (!value) return '';

  // Allow natural backspacing without re-appending trailing slash
  if (prevValue && value.length < prevValue.length) {
    return value.replace(/[^0-9/]/g, '');
  }

  // Auto-pad single digit day or month when user manually types '/'
  if (/^\d\/$/.test(value)) {
    return `0${value}`;
  }
  if (/^\d{2}\/\d\/$/.test(value)) {
    return `${value.slice(0, 3)}0${value.slice(3)}`;
  }

  const digits = value.replace(/\D/g, '').slice(0, 8);
  if (digits.length === 0) return '';
  if (digits.length < 2) return digits;
  if (digits.length === 2) return `${digits}/`;
  if (digits.length < 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  if (digits.length === 4) return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4, 8)}`;
}

/**
 * Parse DD/MM/YYYY, DDMMYYYY, or YYYY-MM-DD to YYYY-MM-DD
 */
export function parseDateInput(s: string): string | null {
  if (!s) return null;
  const clean = s.trim();
  // If already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean;
  // If 8 raw digits DDMMYYYY
  const normalized = /^\d{8}$/.test(clean)
    ? `${clean.slice(0, 2)}/${clean.slice(2, 4)}/${clean.slice(4, 8)}`
    : clean;
  // If DD/MM/YYYY
  const parts = normalized.split('/');
  if (parts.length === 3) {
    const [d, m, y] = parts.map((p) => parseInt(p, 10));
    if (!isNaN(d) && !isNaN(m) && !isNaN(y)) {
      const dateObj = new Date(y, m - 1, d);
      if (dateObj.getFullYear() === y && dateObj.getMonth() === m - 1 && dateObj.getDate() === d) {
        return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      }
    }
  }
  return null;
}

/**
 * Returns number of days in month (month 1-12)
 */
export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/**
 * Add months to a Date, clamping day to max month range (matching Python `add_months`)
 */
export function addMonths(d: Date, months: number): Date {
  const targetMonth = d.getMonth() + months;
  const targetYear = d.getFullYear() + Math.floor(targetMonth / 12);
  const normalizedMonth = ((targetMonth % 12) + 12) % 12;
  const maxDay = daysInMonth(targetYear, normalizedMonth + 1);
  return new Date(targetYear, normalizedMonth, Math.min(d.getDate(), maxDay));
}

/**
 * Parse flexible date for schedules
 */
export function parseFlexibleDate(value: string, annual = false, baseYear?: number): { start: string; precision: DatePrecision } {
  const clean = value.trim();
  if (!clean) throw new Error('Chưa nhập thời gian báo cáo');

  // Handle dd/mm for annual
  if (annual && clean.includes('/')) {
    const parts = clean.split('/');
    if (parts.length === 2 && parts.every((p) => /^\d+$/.test(p))) {
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10);
      const year = baseYear || new Date().getFullYear();
      if (month < 1 || month > 12) throw new Error('Tháng phải từ 1 đến 12');
      const maxD = daysInMonth(year, month);
      const safeD = Math.min(day, maxD);
      return {
        start: `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(safeD).padStart(2, '0')}`,
        precision: 'day',
      };
    }
  }

  // DD/MM/YYYY
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(clean)) {
    const iso = parseDateInput(clean);
    if (!iso) throw new Error('Ngày không hợp lệ (định dạng dd/mm/yyyy)');
    return { start: iso, precision: 'day' };
  }

  // MM/YYYY
  if (/^\d{1,2}\/\d{4}$/.test(clean)) {
    const [m, y] = clean.split('/').map((x) => parseInt(x, 10));
    if (m < 1 || m > 12) throw new Error('Tháng phải từ 1 đến 12');
    return { start: `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}`, precision: 'month' };
  }

  // YYYY
  if (/^\d{4}$/.test(clean)) {
    return { start: clean, precision: 'year' };
  }

  // Fallback ISO YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
    return { start: clean, precision: 'day' };
  }

  throw new Error('Thời gian phải là dd/mm/yyyy, mm/yyyy hoặc yyyy (nếu lặp hàng năm có thể nhập dd/mm)');
}

/**
 * Approximate period projection (month ends at last day, year ends at Dec 31)
 */
export function periodProjection(iso: string): string {
  if (iso.length === 4) return `${iso}-12-31`;
  if (iso.length === 7) {
    const [yStr, mStr] = iso.split('-');
    const y = parseInt(yStr, 10);
    const m = parseInt(mStr, 10);
    const lastDay = daysInMonth(y, m);
    return `${iso}-${String(lastDay).padStart(2, '0')}`;
  }
  return iso;
}

/**
 * Generate due dates matching PC python logic `due_dates`
 */
export function generateDueDates(schedule: Schedule, todayInput?: Date): string[] {
  const today = todayInput || new Date();
  const todayYear = today.getFullYear();
  const kind = schedule.kind;

  if (kind.startsWith('Định kỳ')) {
    const day = schedule.day_of_month || 15;
    const startIso = schedule.start_date || today.toISOString().slice(0, 10);
    const startDate = new Date(startIso);
    const result: string[] = [];

    if (schedule.repeat_rule === 'Hằng năm') {
      const startYear = startDate.getFullYear();
      const maxYear = Math.max(startYear, todayYear) + 3;
      const targetMonth = startDate.getMonth() + 1; // 1-12
      for (let y = startYear; y <= maxYear; y++) {
        const maxD = daysInMonth(y, targetMonth);
        const actualD = Math.min(day, maxD);
        const dObj = new Date(y, targetMonth - 1, actualD);
        if (dObj >= startDate) {
          result.push(`${y}-${String(targetMonth).padStart(2, '0')}-${String(actualD).padStart(2, '0')}`);
        }
      }
    } else if (schedule.repeat_rule === 'Hằng quý') {
      // Các tháng cuối quý: 03, 06, 09, 12. Chỉ sinh kỳ từ ngày bắt đầu.
      const startMonthIndex = startDate.getFullYear() * 12 + startDate.getMonth();
      const currentMonthIndex = todayYear * 12 + today.getMonth();
      const beginIndex = Math.max(startMonthIndex, currentMonthIndex - 2);
      const endIndex = currentMonthIndex + 14;
      for (let idx = beginIndex; idx <= endIndex; idx++) {
        const y = Math.floor(idx / 12);
        const m = (idx % 12) + 1;
        if (![3, 6, 9, 12].includes(m)) continue;
        const actualD = Math.min(day, daysInMonth(y, m));
        const dueDate = new Date(y, m - 1, actualD);
        if (dueDate >= startDate) {
          result.push(`${y}-${String(m).padStart(2, '0')}-${String(actualD).padStart(2, '0')}`);
        }
      }
    } else {
      // Hằng tháng (monthly)
      const startMonthIndex = startDate.getFullYear() * 12 + startDate.getMonth();
      const currentMonthIndex = todayYear * 12 + today.getMonth();
      const beginIndex = Math.max(startMonthIndex, currentMonthIndex - 2);
      const endIndex = currentMonthIndex + 14;

      for (let idx = beginIndex; idx <= endIndex; idx++) {
        const y = Math.floor(idx / 12);
        const m = (idx % 12) + 1; // 1-12
        const maxD = daysInMonth(y, m);
        const actualD = Math.min(day, maxD);
        const dObj = new Date(y, m - 1, actualD);
        if (dObj >= startDate) {
          result.push(`${y}-${String(m).padStart(2, '0')}-${String(actualD).padStart(2, '0')}`);
        }
      }
    }
    return result;
  }

  if (!schedule.start_date) return [];
  const baseIso = schedule.start_date;
  const projectedIso = periodProjection(baseIso);
  const baseDate = new Date(projectedIso);
  const rule = schedule.repeat_rule;

  if (rule === 'Không lặp') {
    return [projectedIso];
  }
  if (rule === 'Năm sau') {
    const nextYear = baseDate.getFullYear() + 1;
    const maxD = daysInMonth(nextYear, baseDate.getMonth() + 1);
    const nextIso = `${nextYear}-${String(baseDate.getMonth() + 1).padStart(2, '0')}-${String(Math.min(baseDate.getDate(), maxD)).padStart(2, '0')}`;
    return [projectedIso, nextIso];
  }
  if (rule.startsWith('Năm:')) {
    const customYear = parseInt(rule.split(':')[1], 10);
    if (!isNaN(customYear) && customYear !== baseDate.getFullYear()) {
      const maxD = daysInMonth(customYear, baseDate.getMonth() + 1);
      const customIso = `${customYear}-${String(baseDate.getMonth() + 1).padStart(2, '0')}-${String(Math.min(baseDate.getDate(), maxD)).padStart(2, '0')}`;
      return [projectedIso, customIso];
    }
    return [projectedIso];
  }

  // Hằng năm for Sơ kết, Tổng kết
  const res: string[] = [];
  const startYear = baseDate.getFullYear();
  const maxYear = Math.max(startYear, todayYear) + 3;
  const m = baseDate.getMonth() + 1;
  const targetDay = baseDate.getDate();

  for (let y = startYear; y <= maxYear; y++) {
    const maxD = daysInMonth(y, m);
    res.push(`${y}-${String(m).padStart(2, '0')}-${String(Math.min(targetDay, maxD)).padStart(2, '0')}`);
  }
  return res;
}

/**
 * Calculates remaining status text matching PC Python remaining_text()
 */
export function getRemainingText(
  dueIso: string,
  completedIso: string | null | undefined,
  todayIso?: string
): { label: string; tag: 'overdue' | 'urgent' | 'orange' | 'yellow' | 'normal' | 'done' } {
  if (completedIso) {
    return { label: 'Hoàn thành', tag: 'done' };
  }

  const todayStr = todayIso || new Date().toISOString().slice(0, 10);
  const due = new Date(dueIso);
  const today = new Date(todayStr);

  // Time diff in integer days
  const diffTime = due.getTime() - today.getTime();
  const n = Math.round(diffTime / (1000 * 60 * 60 * 24));

  if (n < 0) {
    return { label: `Quá hạn ${-n} ngày`, tag: 'overdue' };
  }
  if (n === 0) {
    return { label: 'Đến hạn hôm nay', tag: 'urgent' };
  }
  if (n <= 7) {
    return { label: `Còn ${n} ngày`, tag: 'urgent' };
  }
  if (n <= 15) {
    return { label: `Còn ${n} ngày`, tag: 'orange' };
  }
  if (n <= 30) {
    return { label: `Còn ${n} ngày`, tag: 'yellow' };
  }

  // > 30 days: compute months and days
  let months = (due.getFullYear() - today.getFullYear()) * 12 + (due.getMonth() - today.getMonth());
  if (months > 0 && addMonths(today, months) > due) {
    months -= 1;
  }
  const intermediate = addMonths(today, months);
  const days = Math.round((due.getTime() - intermediate.getTime()) / (1000 * 60 * 60 * 24));

  if (months <= 0) {
    return { label: `Còn ${n} ngày`, tag: 'normal' };
  }
  return { label: `Còn ${months} tháng ${days} ngày`, tag: 'normal' };
}

/**
 * Get formatted display for report
 */
export function getReportDisplay(
  report: {
    due_date: string;
    completed_date: string | null | undefined;
    precision: DatePrecision;
  },
  todayIso?: string
): { displayDue: string; label: string; tag: 'overdue' | 'urgent' | 'orange' | 'yellow' | 'normal' | 'done' } {
  if (report.precision === 'day') {
    const rem = getRemainingText(report.due_date, report.completed_date, todayIso);
    return {
      displayDue: displayDate(report.due_date),
      label: rem.label,
      tag: rem.tag,
    };
  }

  const [y, m] = report.due_date.split('-');
  let displayDue = '';
  if (report.precision === 'year') {
    displayDue = y;
  } else {
    displayDue = `${m}/${y}`;
  }

  if (report.completed_date) {
    return { displayDue, label: 'Hoàn thành', tag: 'done' };
  }
  return { displayDue, label: 'Dự kiến...', tag: 'yellow' };
}
