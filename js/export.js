// ===========================
//  Export — Word / PDF
// ===========================

import { showToast } from './ui.js';
import { MATEEN_LOGO_BASE64 } from './mateen-logo.js';

function watermarkHtml() {
  return `<img src="${MATEEN_LOGO_BASE64}" class="wm-logo" alt=""/>`;
}

const MH = ['محرم','صفر','ربيع الأول','ربيع الثاني','جمادى الأولى','جمادى الثانية','رجب','شعبان','رمضان','شوال','ذو القعدة','ذو الحجة'];
const MG = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
const DAYS_ORDER = ['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];

const fmtH = d => { if(!d) return ''; const [dd,mm,yy]=d.split('-'); if(!dd||!mm||!yy||dd==='') return ''; return `${parseInt(dd)} ${MH[parseInt(mm)-1]||mm} ${yy} هـ`; };
const fmtG = d => { if(!d) return ''; const [dd,mm,yy]=d.split('-'); if(!dd||!mm||!yy||dd==='') return ''; return `${parseInt(dd)} ${MG[parseInt(mm)-1]||mm} ${yy} م`; };
const fmtT = s => { if(!s.hour) return ''; return `${s.hour}:${s.minute||'00'} ${s.ampm||'ص'}`; };
const fmtDayTime = s => { const t=fmtT(s); return s.day&&t ? `${s.day} — ${t}` : s.day||t||''; };
const fmtI = s => s.interview==='done' ? 'تمت' : 'لم تتم';
const fmtR = s => s.accepted==='accepted' ? 'مقبولة' : s.accepted==='rejected' ? 'غير مقبولة' : 'لم يحدد';

function toMins(s) {
  if(!s.hour) return -1;
  let h = parseInt(s.hour), m = parseInt(s.minute||'0');
  if(s.ampm==='م' && h!==12) h+=12;
  if(s.ampm==='ص' && h===12) h=0;
  return h*60+m;
}
function minsToLabel(m) {
  let h=Math.floor(m/60), mm=m%60;
  const ap=h<12?'ص':'م';
  if(h===0) h=12; else if(h>12) h-=12;
  return `${h}:${String(mm).padStart(2,'0')} ${ap}`;
}

const today = new Date();
const todayH = `${today.getDate()} ${MH[today.getMonth()]} ${today.getFullYear()} هـ`;
const todayG = `${today.getDate()} ${MG[today.getMonth()]} ${today.getFullYear()} م`;

function getColsAndHeaders(students) {
  const cols = {
    name:      document.getElementById('col_name')?.checked      ?? true,
    day:       document.getElementById('col_day')?.checked       ?? true,
    time:      document.getElementById('col_time')?.checked      ?? true,
    dateH:     document.getElementById('col_dateH')?.checked     ?? true,
    dateG:     document.getElementById('col_dateG')?.checked     ?? false,
    interview: document.getElementById('col_interview')?.checked ?? false,
    result:    document.getElementById('col_result')?.checked    ?? false,
  };
  const headers = [];
  if(cols.name)      headers.push('اسم الطالبة');
  if(cols.day)       headers.push('اليوم');
  if(cols.time)      headers.push('الوقت');
  if(cols.dateH)     headers.push('التاريخ الهجري');
  if(cols.dateG)     headers.push('التاريخ الميلادي');
  if(cols.interview) headers.push('المقابلة');
  if(cols.result)    headers.push('القبول');
  return { cols, headers };
}

function buildTableHtml(students, cols, headers, title, subtitle='') {
    const headCells = `<th style="width:36px">#</th>` + headers.map(h=>`<th>${h}</th>`).join('');
    const rows = students.map((s,i) => {
    const cells = [`<td>${i+1}</td>`];
    if(cols.name)      cells.push(`<td class="name-td">${s.name||''}</td>`);
    if(cols.day)       cells.push(`<td>${s.day||''}</td>`);
    if(cols.dateH)     cells.push(`<td>${fmtH(s.dateH)}</td>`);
    if(cols.dateG)     cells.push(`<td>${fmtG(s.dateG)}</td>`);
    if(cols.time)      cells.push(`<td>${fmtT(s)}</td>`);
    if(cols.interview) cells.push(`<td>${fmtI(s)}</td>`);
    if(cols.result)    cells.push(`<td>${fmtR(s)}</td>`);
    return `<tr class="${i%2===0?'odd':'even'}">${cells.join('')}</tr>`;
  }).join('');

  return `
  <div class="page">
    ${watermarkHtml()}
    <div class="page-header">
      <img src="${MATEEN_LOGO_BASE64}" class="page-logo" alt="شعار متين"/>
      <div class="page-header-text">
        <div class="prog-name">برنامج متين العلمي المستوي الثاني</div>
      </div>
    </div>
    <div class="page-title">${title}</div>
    ${subtitle ? `<div class="page-subtitle">${subtitle}</div>` : ''}
    <table>
      <thead><tr>${headCells}</tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="page-footer">
      <span> برنامج متين العلمي المستوي الثاني </span>
      <span>◆</span>
      <span>الصفحة {PAGE}</span>
    </div>
    <br style="mso-break-type:page-break;page-break-after:always">
 </div>`;
}

const PAGE_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&family=Noto+Naskh+Arabic:wght@400;600;700&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Noto Naskh Arabic', 'Cairo', Arial, sans-serif; direction: rtl; background: #efe2c8; padding: 20px; }
  @media print {
    body { background: white; padding: 0; }
    .page { box-shadow: none; margin: 0; border-radius: 0; border: none; page-break-after: always; }
    .page:last-child { page-break-after: avoid; }
    .page::before { border-radius: 0; }
  }
  .page { position: relative; background: linear-gradient(180deg,#fffdf8 0%,#fbf4e6 100%); max-width: 750px; margin: 0 auto 30px; padding: 36px 40px 26px; border-radius: 12px; box-shadow: 0 4px 20px rgba(92,61,46,.16); border: 1px solid #e3cfa8; page-break-after: always; mso-page-break-after: always; break-after: page; overflow: hidden; }
  .page:last-child { page-break-after: avoid; mso-page-break-after: avoid; }
  .page::before { content:''; position:absolute; top:0; left:0; right:0; height:7px; background: linear-gradient(90deg,#8a5e3c,#c9a227,#e8c96a,#c9a227,#8a5e3c); }
  .page-header { display: flex; align-items: center; gap: 16px; padding: 16px 0 16px; border-bottom: 2.5px solid #c9a227; margin-bottom: 20px; }
  .page-logo { width: 58px; height: 58px; object-fit: contain; flex-shrink: 0; }
  .prog-name { font-family: 'Amiri', serif; font-size: 22px; font-weight: 700; color: #5c3d2e; }
  .prog-sub  { font-size: 14px; color: #8a6a52; margin-top: 3px; }
  .dates { text-align: left; font-size: 14px; color: #8a6a52; line-height: 1.9; }
  .page-title { text-align: center; font-family: 'Amiri', serif; font-size: 24px; font-weight: 700; color: #5c3d2e; margin-bottom: 4px; }
  .page-subtitle { text-align: center; font-size: 17px; font-weight: 600; color: #8a5e3c; margin-bottom: 14px; }
  table { width: 100%; border-collapse: collapse; font-size: 18px; margin-top: 16px; }  thead tr { background: linear-gradient(90deg,#5c3d2e,#7a4f34,#5c3d2e); }
  thead th { color: #e8c96a; padding: 13px 14px; text-align: center; font-weight: 700; font-size: 18px; }  tbody tr.odd  { background: #fffdf8; }
  tbody tr.even { background: #f3e9d4; }
  tbody td { padding: 12px 14px; text-align: center; color: #2c1a0e; border-bottom: 1px solid #e3d3ae; font-size: 17px; }
  .name-td { text-align: right; font-weight: 600; color: #5c3d2e; }
  .page-footer { display: flex; justify-content: space-between; margin-top: 18px; padding-top: 12px; border-top: 1px solid #d6c4a8; font-size: 12px; color: #8a6a52; }
  .page-footer span:nth-child(2) { color: #c9a227; font-size: 15px; }
  .wm-logo { position: absolute; top: 50%; left: 50%; width: 320px; height: 320px; object-fit: contain;
    transform: translate(-50%,-50%) rotate(-15deg); opacity: 0.07; z-index: 0; pointer-events: none; }
  .page-header, .page-title, .page-subtitle, table, .page-footer { position: relative; z-index: 1; }
`;

function buildFullHtmlWord(pages) {
  let numbered = pages;
  let p = 1;
  numbered = numbered.replace(/{PAGE}/g, () => p++);
  return `<html xmlns:o="urn:schemas-microsoft-com:office:office"
    xmlns:w="urn:schemas-microsoft-com:office:word"
    xmlns="http://www.w3.org/TR/REC-html40">
  <head><meta charset="UTF-8">
  <!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>90</w:Zoom></w:WordDocument></xml><![endif]-->
  <style>${PAGE_CSS}</style></head>
  <body>${numbered}</body></html>`;
}

function buildFullHtmlPrint(pages) {
  let numbered = pages;
  let p = 1;
  numbered = numbered.replace(/{PAGE}/g, () => p++);
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>متين — تصدير</title>
  <style>${PAGE_CSS}</style></head>
  <body>${numbered}</body></html>`;
}

function buildPages(students) {
  const { cols, headers } = getColsAndHeaders(students);
  const groupByTime = document.getElementById('groupByTime')?.checked ?? false;
  const rangeSize   = parseInt(document.getElementById('rangeSize')?.value ?? '60');

  if(!groupByTime) {
    return buildTableHtml(students, cols, headers, 'جدول المقابلات');
  }

  let pagesHtml = '';
  const withTime    = students.filter(s => toMins(s) >= 0);
  const withoutTime = students.filter(s => toMins(s) < 0);

  const DAYS_ORDER = ['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
  const buckets = {};
  withTime.forEach(s => {
    const slot = Math.floor(toMins(s)/rangeSize)*rangeSize;
    const key  = (s.day||'') + '||' + slot;
    if(!buckets[key]) buckets[key] = { day: s.day||'', slot, list:[] };
    buckets[key].list.push(s);
  });

  Object.values(buckets)
    .sort((a,b) => (DAYS_ORDER.indexOf(a.day)-DAYS_ORDER.indexOf(b.day)) || (a.slot-b.slot))
    .forEach(({day,slot,list}) => {
      const subtitle = `${day} — ${minsToLabel(slot)} إلى ${minsToLabel(slot+rangeSize-1)}`;
      pagesHtml += buildTableHtml(list, cols, headers, 'جدول المقابلات', subtitle);
    });

  if(withoutTime.length)
    pagesHtml += buildTableHtml(withoutTime, cols, headers, 'طالبات بدون وقت محدد');

  return pagesHtml;
}

export async function exportWord(students) {
  if(!students.length) { showToast('لا توجد بيانات للتصدير'); return; }
  const html = buildFullHtmlWord(buildPages(students));
  const blob = new Blob(['\uFEFF'+html], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document;charset=utf-8'
  });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'متين_مقابلات.doc';
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  showToast('تم التصدير Word ✅');
}

export async function exportPdf(students) {
  if(!students.length) { showToast('لا توجد بيانات للتصدير'); return; }
  const html = buildFullHtmlPrint(buildPages(students));
  const win  = window.open('', '_blank');
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); }, 800);
  showToast('تم فتح نافذة الطباعة ✅');
}

// ===========================
//  Export — Attendance / غياب وحضور
// ===========================

const SUBJ_LABEL = { 'قرآن':'قرآن', 'فقه':'فقه', 'تفسير':'تفسير', 'عقيدة':'عقيدة', 'حديث':'حديث' };

const ATT_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&family=Noto+Naskh+Arabic:wght@400;600;700&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Noto Naskh Arabic', 'Cairo', Arial, sans-serif; direction: rtl;
    background: #efe2c8; padding: 20px; }
  @media print {
    body { background: white; padding: 0; }
    .att-page { box-shadow: none; margin: 0; border-radius: 0; border: none; page-break-after: always; }
    .att-page:last-child { page-break-after: avoid; }
    .att-page::before { border-radius: 0; }
  }
  .att-page { position: relative; background: linear-gradient(180deg,#fffdf8 0%,#fbf4e6 100%);
    max-width: 800px; margin: 0 auto 30px; padding: 36px 40px 26px; border-radius: 12px;
    box-shadow: 0 4px 20px rgba(92,61,46,.16); border: 1px solid #e3cfa8; page-break-after: always; overflow: hidden; }
  .att-page:last-child { page-break-after: avoid; }
  .att-page::before { content:''; position:absolute; top:0; left:0; right:0; height:7px;
    background: linear-gradient(90deg,#8a5e3c,#c9a227,#e8c96a,#c9a227,#8a5e3c); }
  .att-header { display: flex; align-items: center; justify-content: space-between; gap: 16px;
    padding: 16px 0 16px; border-bottom: 2.5px solid #c9a227; margin-bottom: 20px; }
  .att-logo { width: 58px; height: 58px; object-fit: contain; flex-shrink: 0; }
  .att-prog-wrap { text-align: right; }
  .att-prog { font-family: 'Amiri', serif; font-size: 23px; font-weight: 700; color: #5c3d2e; }
  .att-prog-sub { font-size: 11.5px; color: #8a6a52; margin-top: 2px; }
  .att-title { text-align: center; font-family: 'Amiri', serif; font-size: 24px; font-weight: 700;
    color: #5c3d2e; margin-bottom: 4px; }
  .att-subtitle { text-align: center; font-size: 15px; font-weight: 600; color: #8a5e3c; margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; margin-top: 8px; }
  thead tr { background: linear-gradient(90deg,#5c3d2e,#7a4f34,#5c3d2e); }
  thead th { color: #e8c96a; padding: 11px 10px; text-align: center; font-weight: 700; font-size: 14px; }
  tbody tr:nth-child(odd)  { background: #fffdf8; }
  tbody tr:nth-child(even) { background: #f3e9d4; }
  tbody td { padding: 9px 10px; text-align: center; color: #2c1a0e; border-bottom: 1px solid #e3d3ae; font-size: 13.5px; }
  .td-name { text-align: right; font-weight: 700; color: #5c3d2e; }
  .chip-present { background:#e5f2e6; color:#1a6b36; padding:3px 12px; border-radius:20px; font-size:12.5px; font-weight:600; }
  .chip-absent  { background:#fbe9e9; color:#b71c1c; padding:3px 12px; border-radius:20px; font-size:12.5px; font-weight:600; }
  .chip-excused { background:#fdf3e2; color:#a06a00; padding:3px 12px; border-radius:20px; font-size:12.5px; font-weight:600; }
  .chip-empty   { color:#c3ac8c; font-size:12.5px; }
  .att-footer { display:flex; justify-content:space-between; align-items:center; margin-top:18px; padding-top:12px;
    border-top:1px solid #d6c4a8; font-size:12px; color:#8a6a52; }
  .att-footer span:nth-child(2) { color:#c9a227; font-size:15px; }
  .wm-logo { position: absolute; top: 50%; left: 50%; width: 320px; height: 320px; object-fit: contain;
    transform: translate(-50%,-50%) rotate(-15deg); opacity: 0.07; z-index: 0; pointer-events: none; }
  .att-header, .att-title, .att-subtitle, table, .att-footer { position: relative; z-index: 1; }
`;

function attHeaderHtml() {
  return `<div class="att-header">
    <img src="${MATEEN_LOGO_BASE64}" class="att-logo" alt="شعار متين"/>
    <div class="att-prog-wrap">
      <div class="att-prog">برنامج متين العلمي</div>
      <div class="att-prog-sub">سجلّ متابعة الحضور والغياب</div>
    </div>
  </div>`;
}

function buildAttHtmlWord(pages) {
  return `<html xmlns:o="urn:schemas-microsoft-com:office:office"
    xmlns:w="urn:schemas-microsoft-com:office:word"
    xmlns="http://www.w3.org/TR/REC-html40">
  <head><meta charset="UTF-8">
  <!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>90</w:Zoom></w:WordDocument></xml><![endif]-->
  <style>${ATT_CSS}</style></head>
  <body>${pages}</body></html>`;
}

function buildAttHtmlPrint(pages) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>سجل الحضور والغياب</title>
  <style>${ATT_CSS}</style></head>
  <body>${pages}</body></html>`;
}

function chipAtt(v) {
  if (v === 'present') return '<span class="chip-present">✔ حاضرة</span>';
  if (v === 'absent')  return '<span class="chip-absent">✖ غائبة</span>';
  if (v === 'excused') return '<span class="chip-excused">⭕ اعتذار</span>';
  return '<span class="chip-empty">—</span>';
}

/**
 * studentsData = [
 *   { name, sessions: [ { date, day, subjects:{قرآن:'present'|'absent'|'',...} } ] }
 * ]
 * mode: 'perStudent' = صفحة لكل طالبة | 'perWeek' = صفحة لكل أسبوع (كل الطالبات والمواد) | 'perSubject' = صفحة لكل مادة
 */
function buildAttSummaryStats(studentsData) {
  return studentsData.map(st => {
    let p = 0, a = 0, e = 0;
    (st.sessions || []).forEach(se => {
      Object.values(se.subjects || {}).forEach(v => {
        if (v === 'present') p++; else if (v === 'absent') a++; else if (v === 'excused') e++;
      });
    });
    const total = p + a;
    const pct = total ? Math.round((p / total) * 100) : 0;
    return { name: st.name, present: p, absent: a, excused: e, pct };
  });
}

function buildAttSummaryPage(studentsData) {
  const stats = buildAttSummaryStats(studentsData);
  const rows = stats.map((r, i) =>
    `<tr><td>${i + 1}</td><td class="td-name">${r.name}</td><td>${r.present}✔</td><td>${r.absent}✖</td><td>${r.excused}⭕</td><td>${r.pct}%</td></tr>`
  ).join('');

  return `<div class="att-page">
    ${watermarkHtml()}
    ${attHeaderHtml()}
    <div class="att-title">سجل الحضور والغياب</div>
    <div class="att-subtitle">ملخص إجمالي</div>
    <table>
      <thead><tr><th>#</th><th class="td-name">الطالبة</th><th>حضور</th><th>غياب</th><th>اعتذار</th><th>نسبة الحضور</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="att-footer"><span>برنامج متين العلمي</span><span>◆</span><span>${stats.length} طالبة</span></div>
  </div>`;
}

function buildAttPages(studentsData, mode) {
  // اجمع كل Subjects الموجودة
  const allSubjects = new Set();
  studentsData.forEach(st =>
    st.sessions.forEach(se =>
      Object.keys(se.subjects || {}).forEach(k => allSubjects.add(k))
    )
  );
  const subjects = [...allSubjects];

  // كل التواريخ المميزة عبر كل الطالبات (مستخدمة في perWeek و perSubject)
  function collectAllDates() {
    const dateMap = {};
    studentsData.forEach(st =>
      (st.sessions||[]).forEach(se => {
        const key = se.date||'';
        if (!dateMap[key]) dateMap[key] = { date: se.date||'', day: se.day||'' };
      })
    );
    return Object.values(dateMap).sort((a,b)=>a.date<b.date?-1:1);
  }

  if (mode === 'perStudent') {
    // ── صفحة لكل طالبة ──────────────────────────────
    return studentsData.map(st => {
      const sessions = [...(st.sessions || [])].sort((a,b) => (a.date||'') < (b.date||'') ? -1 : 1);
      const subjs = subjects.length ? subjects : [...new Set(sessions.flatMap(se => Object.keys(se.subjects||{})))];
      const headCells = `<th>#</th><th>اليوم</th><th>التاريخ</th>` + subjs.map(s=>`<th>${s}</th>`).join('') + `<th>الإجمالي</th>`;
      let totalP = 0, totalA = 0, totalE = 0;
      const rows = sessions.map((se, i) => {
        const subjCells = subjs.map(s => `<td>${chipAtt((se.subjects||{})[s]||'')}</td>`).join('');
        const p = subjs.filter(s => (se.subjects||{})[s]==='present').length;
        const a = subjs.filter(s => (se.subjects||{})[s]==='absent').length;
        const e = subjs.filter(s => (se.subjects||{})[s]==='excused').length;
        totalP += p; totalA += a; totalE += e;
        const total = subjs.length ? `${p}✔ / ${a}✖ / ${e}⭕` : '—';
        return `<tr><td>${i+1}</td><td>${se.day||''}</td><td>${se.date||''}</td>${subjCells}<td>${total}</td></tr>`;
      }).join('');
      const summaryRow = `<tr style="background:#eef3ff;font-weight:600"><td colspan="3">الإجمالي</td>${subjs.map(()=>'<td></td>').join('')}<td>${totalP}✔ / ${totalA}✖ / ${totalE}⭕</td></tr>`;

      return `<div class="att-page">
        ${watermarkHtml()}
        ${attHeaderHtml()}
        <div class="att-title">سجل الحضور والغياب</div>
        <div class="att-subtitle">${st.name}</div>
        <table>
          <thead><tr>${headCells}</tr></thead>
          <tbody>${rows}${summaryRow}</tbody>
        </table>
        <div class="att-footer"><span>برنامج متين العلمي</span><span>◆</span><span>${st.name}</span></div>
      </div>`;
    }).join('');

  } else if (mode === 'perWeek') {
    // ── صفحة لكل أسبوع — كل الطالبات وكل المواد، مجمّعة بالأسبوع (الأحد → السبت) ──
    const allDates = collectAllDates();
    if (!allDates.length) {
      return `<div class="att-page"><div class="att-title">سجل الحضور والغياب</div>
        <p style="text-align:center;color:#999;padding:30px">لا توجد جلسات مسجلة</p></div>`;
    }

    function getWeekRange(dateStr) {
      const d = new Date(dateStr + 'T00:00:00');
      const dow = d.getDay(); // 0 = الأحد
      const start = new Date(d); start.setDate(d.getDate() - dow);
      const end = new Date(start); end.setDate(start.getDate() + 6);
      const fmt = dt => dt.toISOString().split('T')[0];
      return { start: fmt(start), end: fmt(end) };
    }

    const weekMap = {};
    allDates.forEach(dd => {
      const { start, end } = getWeekRange(dd.date);
      if (!weekMap[start]) weekMap[start] = { start, end, dates: [] };
      weekMap[start].dates.push(dd);
    });
    const weeks = Object.values(weekMap).sort((a,b) => a.start < b.start ? -1 : 1);

    return weeks.map(week => {
      const headCells = `<th>#</th><th>اليوم</th><th>التاريخ</th><th class="td-name">الطالبة</th>` + subjects.map(s=>`<th>${s}</th>`).join('') + `<th>الإجمالي</th>`;
      let totalP = 0, totalA = 0, totalE = 0, rowNum = 0;
      const rows = week.dates.map(dd =>
        studentsData.map(st => {
          const se = (st.sessions||[]).find(x => (x.date||'') === dd.date);
          const subjCells = subjects.map(s => `<td>${chipAtt(se ? (se.subjects||{})[s]||'' : '')}</td>`).join('');
          const p = se ? Object.values(se.subjects||{}).filter(v=>v==='present').length : 0;
          const a = se ? Object.values(se.subjects||{}).filter(v=>v==='absent').length : 0;
          const e = se ? Object.values(se.subjects||{}).filter(v=>v==='excused').length : 0;
          totalP += p; totalA += a; totalE += e; rowNum++;
          const total = se ? `${p}✔ / ${a}✖ / ${e}⭕` : '<span class="chip-empty">—</span>';
          return `<tr><td>${rowNum}</td><td>${dd.day||''}</td><td>${dd.date||''}</td><td class="td-name">${st.name}</td>${subjCells}<td>${total}</td></tr>`;
        }).join('')
      ).join('');

      return `<div class="att-page">
        ${watermarkHtml()}
        ${attHeaderHtml()}
        <div class="att-title">سجل الحضور والغياب</div>
        <div class="att-subtitle">الأسبوع من ${week.start} إلى ${week.end}</div>
        <table>
          <thead><tr>${headCells}</tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <div class="att-footer"><span>برنامج متين العلمي</span><span>◆</span><span>${totalP}✔ / ${totalA}✖ / ${totalE}⭕</span></div>
      </div>`;
    }).join('');

  } else if (mode === 'perSubject') {
    // ── صفحة لكل مادة — صف لكل (تاريخ × طالبة)، مش عمود لكل طالبة ──
    const allDates = collectAllDates();
    const subjList = subjects.length ? subjects : ['—'];

    if (!allDates.length) {
      return `<div class="att-page"><div class="att-title">سجل الحضور والغياب</div>
        <p style="text-align:center;color:#999;padding:30px">لا توجد جلسات مسجلة</p></div>`;
    }

    return subjList.map(subj => {
      const headCells = `<th>#</th><th>اليوم</th><th>التاريخ</th><th class="td-name">الطالبة</th><th>الحالة</th>`;

      let totalP = 0, totalA = 0, totalE = 0, rowNum = 0;
      const rows = allDates.map(dd =>
        studentsData.map(st => {
          const se = (st.sessions||[]).find(x=>(x.date||'')===(dd.date||''));
          const v = se ? (se.subjects||{})[subj] : undefined;
          if (v === 'present') totalP++;
          if (v === 'absent') totalA++;
          if (v === 'excused') totalE++;
          rowNum++;
          return `<tr><td>${rowNum}</td><td>${dd.day||''}</td><td>${dd.date||''}</td><td class="td-name">${st.name}</td><td>${chipAtt(v||'')}</td></tr>`;
        }).join('')
      ).join('');

      return `<div class="att-page">
        ${watermarkHtml()}
        ${attHeaderHtml()}
        <div class="att-title">سجل الحضور والغياب</div>
        <div class="att-subtitle">مادة: ${subj}</div>
        <table>
          <thead><tr>${headCells}</tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <div class="att-footer"><span>برنامج متين العلمي</span><span>◆</span><span>${totalP}✔ / ${totalA}✖ / ${totalE}⭕</span></div>
      </div>`;
    }).join('');

  } else {
    // وضع غير معروف — نستخدم عرض الأسبوع كافتراضي بدل تصميم الأعمدة القديم
    return buildAttPages(studentsData, 'perWeek');
  }
}

export async function exportAttendanceWord(studentsData, mode='perStudent', includeSummary=true) {
  if (!studentsData.length) { showToast('لا توجد بيانات للتصدير'); return; }
  const summaryHtml = includeSummary ? buildAttSummaryPage(studentsData) : '';
  const html = buildAttHtmlWord(summaryHtml + buildAttPages(studentsData, mode));
  const blob = new Blob(['\uFEFF'+html], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document;charset=utf-8'
  });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'متين_حضور_غياب.doc';
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  showToast('تم التصدير Word ✅');
}

export async function exportAttendancePdf(studentsData, mode='perStudent', preOpenedWin=null, includeSummary=true) {
  if (!studentsData.length) { showToast('لا توجد بيانات للتصدير'); return; }
  const summaryHtml = includeSummary ? buildAttSummaryPage(studentsData) : '';
  const html = buildAttHtmlPrint(summaryHtml + buildAttPages(studentsData, mode));
  const win = preOpenedWin || window.open('', '_blank');
  if (!win) { showToast('المتصفح منع فتح نافذة الطباعة — فعّلي السماح بالنوافذ المنبثقة'); return; }
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); }, 800);
  showToast('تم فتح نافذة الطباعة ✅');
}

// ══════════════════════════════════════════════════
//  تصدير عام لأي جدول بيانات بسيط (الدرجات، الترتيب، المواد)
//  headers: أسماء الأعمدة، rows: array من arrays بنفس ترتيب الأعمدة
// ══════════════════════════════════════════════════
function buildGenericHtmlPage(title, headers, rows) {
  const headCells = headers.map(h => `<th>${h}</th>`).join('');
  const bodyRows = rows.map(r => `<tr>${r.map(c => `<td>${c ?? ''}</td>`).join('')}</tr>`).join('');
  return `<div class="att-page">
    ${watermarkHtml()}
    ${attHeaderHtml()}
    <div class="att-title">${title}</div>
    <div class="att-subtitle">${todayH} — ${todayG}</div>
    <table>
      <thead><tr>${headCells}</tr></thead>
      <tbody>${bodyRows}</tbody>
    </table>
  </div>`;
}

export async function exportGenericExcel(fileLabel, sheetName, headers, rows) {
  if (!rows.length) { showToast('لا توجد بيانات للتصدير'); return; }
  showToast('جارٍ تجهيز ملف Excel...');
  const { utils, writeFile } = await import('https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs');
  const jsonRows = rows.map(r => {
    const obj = {};
    headers.forEach((h, i) => obj[h] = r[i] ?? '');
    return obj;
  });
  const wb = utils.book_new();
  wb.Workbook = { Views: [{ RTL: true }] };
  const ws = utils.json_to_sheet(jsonRows);
  ws['!cols'] = headers.map(() => ({ wch: 22 }));
  utils.book_append_sheet(wb, ws, sheetName);
  writeFile(wb, `متين_${fileLabel}.xlsx`);
  showToast('تم التصدير Excel ✅');
}

export async function exportGenericWord(fileLabel, title, headers, rows) {
  if (!rows.length) { showToast('لا توجد بيانات للتصدير'); return; }
  const html = buildAttHtmlWord(buildGenericHtmlPage(title, headers, rows));
  const blob = new Blob(['\uFEFF' + html], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document;charset=utf-8'
  });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `متين_${fileLabel}.doc`;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  showToast('تم التصدير Word ✅');
}

export async function exportGenericPdf(fileLabel, title, headers, rows, preOpenedWin = null) {
  if (!rows.length) { showToast('لا توجد بيانات للتصدير'); return; }
  const html = buildAttHtmlPrint(buildGenericHtmlPage(title, headers, rows));
  const win = preOpenedWin || window.open('', '_blank');
  if (!win) { showToast('المتصفح منع فتح نافذة الطباعة — فعّلي السماح بالنوافذ المنبثقة'); return; }
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); }, 800);
  showToast('تم فتح نافذة الطباعة ✅');
}
// ── تصدير Excel — شيت واحد مسطّح (بدون مفهوم "صفحات") + شيت ملخص اختياري ──
export async function exportAttendanceExcel(studentsData, includeSummary=true) {
  if (!studentsData.length) { showToast('لا توجد بيانات للتصدير'); return; }
  showToast('جارٍ تجهيز ملف Excel...');

  const { utils, writeFile } = await import('https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs');

  const allSubjects = new Set();
  studentsData.forEach(st =>
    (st.sessions || []).forEach(se => Object.keys(se.subjects || {}).forEach(k => allSubjects.add(k)))
  );
  const subjects = [...allSubjects];

  const wb = utils.book_new();
  // خلي الملف كله يفتح من اليمين لليسار في Excel
  wb.Workbook = { Views: [{ RTL: true }] };

  if (includeSummary) {
    const summaryRows = buildAttSummaryStats(studentsData).map(r => ({
      'الطالبة': r.name, 'حضور': r.present, 'غياب': r.absent, 'اعتذار': r.excused, 'نسبة الحضور %': r.pct
    }));
    const wsSummary = utils.json_to_sheet(summaryRows);
    wsSummary['!cols'] = [{ wch: 28 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 16 }];
    utils.book_append_sheet(wb, wsSummary, 'ملخص');
  }

  const detailRows = [];
  studentsData.forEach(st => {
    const sessions = [...(st.sessions || [])].sort((a, b) => (a.date || '') < (b.date || '') ? -1 : 1);
    sessions.forEach(se => {
      const row = { 'الطالبة': st.name, 'اليوم': se.day || '', 'التاريخ': se.date || '' };
      subjects.forEach(s => {
        const v = (se.subjects || {})[s];
        row[s] = v === 'present' ? 'حضور' : v === 'absent' ? 'غياب' : v === 'excused' ? 'عذر' : '';
      });
      detailRows.push(row);
    });
  });
  const wsDetail = utils.json_to_sheet(detailRows);
  // عرض ثابت للأعمدة عشان النص مايتقطعش
  wsDetail['!cols'] = [
    { wch: 28 }, { wch: 12 }, { wch: 14 },
    ...subjects.map(() => ({ wch: 14 })),
  ];
  utils.book_append_sheet(wb, wsDetail, 'سجل الحضور');

  writeFile(wb, 'متين_حضور_غياب.xlsx');
  showToast('تم التصدير Excel ✅');
}
