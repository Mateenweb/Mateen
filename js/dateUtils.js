// ===========================
//  Date Utilities
// ===========================

import { MONTHS_HIJRI, MONTHS_AR, YEARS_HIJRI } from './config.js';

/**
 * Convert Hijri date to Gregorian using the standard algorithm
 * (Umm al-Qura compatible approximation via Julian Day Number)
 */
export function hijriToGregorian(hd, hm, hy) {
  hd = parseInt(hd);
  hm = parseInt(hm);
  hy = parseInt(hy);
  if (!hd || !hm || !hy) return null;

  // Hijri → Julian Day Number
  const jdn = Math.floor((11 * hy + 3) / 30)
            + 354 * hy
            + 30 * hm
            - Math.floor((hm - 1) / 2)
            + hd
            + 1948440
            - 385;

  // JDN → Gregorian
  let l = jdn + 68569;
  const n = Math.floor((4 * l) / 146097);
  l = l - Math.floor((146097 * n + 3) / 4);
  const i = Math.floor((4000 * (l + 1)) / 1461001);
  l = l - Math.floor((1461 * i) / 4) + 31;
  const j = Math.floor((80 * l) / 2447);
  const day   = l - Math.floor((2447 * j) / 80);
  l           = Math.floor(j / 11);
  const month = j + 2 - 12 * l;
  const year  = 100 * (n - 49) + i + l;

  return {
    d: String(day).padStart(2, '0'),
    m: String(month).padStart(2, '0'),
    y: String(year)
  };
}

/** Parse a stored "DD-MM-YYYY" date string into parts */
export function parseDateParts(dateStr) {
  if (!dateStr) return { d: '', m: '', y: '' };
  const [d, m, y] = dateStr.split('-');
  return { d: d || '', m: m || '', y: y || '' };
}

/** Build the Hijri date picker HTML for a student row */
export function makeDatePicker(studentId, dateStr) {
  const { d, m, y } = parseDateParts(dateStr || '');
  const days = Array.from({ length: 30 }, (_, i) => i + 1);

  const dayOpts = days
    .map(n => {
      const val = String(n).padStart(2, '0');
      return `<option value="${val}" ${d === val ? 'selected' : ''}>${n}</option>`;
    })
    .join('');

  const monthOpts = MONTHS_HIJRI
    .map((mn, i) => {
      const val = String(i + 1).padStart(2, '0');
      return `<option value="${val}" ${m === val ? 'selected' : ''}>${mn}</option>`;
    })
    .join('');

  const yearOpts = YEARS_HIJRI
    .map(yr => `<option value="${yr}" ${y === String(yr) ? 'selected' : ''}>${yr}</option>`)
    .join('');

  // Auto-calculated Gregorian label
  const gResult = (d && m && y) ? hijriToGregorian(d, m, y) : null;
  const gLabel  = gResult
    ? `<div style="display:flex;gap:2px;align-items:center;margin-top:3px">
        <span style="width:34px;padding:2px 1px;border:1px solid #b3d4f7;border-radius:5px;font-size:10px;background:#e8f4fd;text-align:center">${gResult.d}</span>
        <span style="width:60px;padding:2px 1px;border:1px solid #b3d4f7;border-radius:5px;font-size:10px;background:#e8f4fd;text-align:center">${MONTHS_AR[parseInt(gResult.m) - 1]}</span>
        <span style="width:50px;padding:2px 1px;border:1px solid #b3d4f7;border-radius:5px;font-size:10px;background:#e8f4fd;text-align:center">${gResult.y}</span>
      </div>`
    : '';

  return `
    <div style="display:flex;flex-direction:column;gap:0">
      <div class="arabic-date">
        <select class="date-day-sel" onchange="updateDatePart('${studentId}','hd',this.value)">
          <option value="">يوم</option>${dayOpts}
        </select>
        <select class="date-month-sel" onchange="updateDatePart('${studentId}','hm',this.value)">
          <option value="">شهر</option>${monthOpts}
        </select>
        <select class="date-year-sel" onchange="updateDatePart('${studentId}','hy',this.value)">
          <option value="">سنة</option>${yearOpts}
        </select>
      </div>
      ${gLabel}
    </div>`;
}

/** Format a stored date for Word export */
export function formatHijriDate(dateH) {
  if (!dateH) return '';
  const [d, m, y] = dateH.split('-');
  if (!d || !m || !y || d === '') return '';
  return `${d} ${MONTHS_HIJRI[parseInt(m) - 1] || m} ${y} هـ`;
}

export function formatGregorianDate(dateG) {
  if (!dateG) return '';
  const [d, m, y] = dateG.split('-');
  if (!d || !m || !y || d === '') return '';
  return `${d} ${MONTHS_AR[parseInt(m) - 1] || m} ${y} م`;
}

export function formatTime(student) {
  if (!student.hour) return '';
  return `${student.hour}:${student.minute || '00'} ${student.ampm || 'ص'}`;
}
