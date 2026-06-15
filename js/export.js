// ===========================
//  Export — Word / PDF
// ===========================

import { showToast } from './ui.js';

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
    <div class="page-header">
      <div>
        <div class="prog-name">📖 برنامج متين العلمي المستوي الثاني </div>
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
  @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Cairo', Arial, sans-serif; direction: rtl; background: #f0f0f0; padding: 20px; }
  @media print {
    body { background: white; padding: 0; }
    .page { box-shadow: none; margin: 0; border-radius: 0; page-break-after: always; }
    .page:last-child { page-break-after: avoid; }
  }
  .page { background: white; max-width: 750px; margin: 0 auto 30px; padding: 32px 36px 24px; border-radius: 8px; box-shadow: 0 2px 12px rgba(0,0,0,.1); page-break-after: always; mso-page-break-after: always; break-after: page; }
  .page:last-child { page-break-after: avoid; mso-page-break-after: avoid; }
  .page-header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 14px; border-bottom: 2.5px solid #1a3a5c; margin-bottom: 18px; }
  .prog-name { font-size: 26px; font-weight: 600; color: #1a3a5c; }
  .prog-sub  { font-size: 14px; color: #888; margin-top: 3px; }
  .dates { text-align: left; font-size: 14px; color: #888; line-height: 1.9; }
  .page-title { text-align: center; font-size: 24px; font-weight: 600; color: #1a3a5c; margin-bottom: 4px; }
  .page-subtitle { text-align: center; font-size: 19px; color: #999; margin-bottom: 14px; }
  table { width: 100%; border-collapse: collapse; font-size: 20px; margin-top: 16px; }  thead tr { background: #1a3a5c; }
  thead th { color: white; padding: 13px 14px; text-align: center; font-weight: 600; font-size: 20px; }  tbody tr.odd  { background: white; }
  tbody tr.even { background: #f5f8fb; }
  tbody td { padding: 12px 14px; text-align: center; color: #333; border-bottom: 0.5px solid #e8edf2; font-size: 19px; }
  .name-td { text-align: right; }
  .page-footer { display: flex; justify-content: space-between; margin-top: 18px; padding-top: 10px; border-top: 0.5px solid #ddd; font-size: 13px; color: #bbb; }
`;

function buildFullHtml(pages) {
  let numbered = pages;
  let p = 1;
  numbered = numbered.replace(/{PAGE}/g, () => p++);
  return `<html xmlns:o="urn:schemas-microsoft-com:office:office"
    xmlns:w="urn:schemas-microsoft-com:office:word"
    xmlns="http://www.w3.org/TR/REC-html40">
  <head><meta charset="UTF-8">
  <xml><w:WordDocument><w:View>Print</w:View><w:Zoom>90</w:Zoom></w:WordDocument></xml>
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
  const html = buildFullHtml(buildPages(students));
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
  const html = buildFullHtml(buildPages(students));
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
  @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Cairo', Arial, sans-serif; direction: rtl; background: #f0f0f0; padding: 20px; }
  @media print {
    body { background: white; padding: 0; }
    .att-page { box-shadow: none; margin: 0; border-radius: 0; page-break-after: always; }
    .att-page:last-child { page-break-after: avoid; }
  }
  .att-page { background: white; max-width: 800px; margin: 0 auto 30px; padding: 32px 36px 24px;
    border-radius: 8px; box-shadow: 0 2px 12px rgba(0,0,0,.1); page-break-after: always; }
  .att-page:last-child { page-break-after: avoid; }
  .att-header { display: flex; justify-content: space-between; align-items: flex-start;
    padding-bottom: 14px; border-bottom: 2.5px solid #1a3a5c; margin-bottom: 18px; }
  .att-prog { font-size: 24px; font-weight: 600; color: #1a3a5c; }
  .att-title { text-align: center; font-size: 22px; font-weight: 600; color: #1a3a5c; margin-bottom: 4px; }
  .att-subtitle { text-align: center; font-size: 16px; color: #666; margin-bottom: 14px; }
  table { width: 100%; border-collapse: collapse; font-size: 15px; margin-top: 10px; }
  thead tr { background: #1a3a5c; }
  thead th { color: white; padding: 10px 10px; text-align: center; font-weight: 600; font-size: 15px; }
  tbody tr:nth-child(odd)  { background: white; }
  tbody tr:nth-child(even) { background: #f5f8fb; }
  tbody td { padding: 9px 10px; text-align: center; color: #333; border-bottom: 0.5px solid #e8edf2; font-size: 14px; }
  .td-name { text-align: right; font-weight: 600; }
  .chip-present { background:#d4edda; color:#1a6b36; padding:2px 10px; border-radius:20px; font-size:13px; }
  .chip-absent  { background:#fde8e8; color:#b71c1c; padding:2px 10px; border-radius:20px; font-size:13px; }
  .chip-empty   { color:#bbb; font-size:13px; }
  .att-footer { display:flex; justify-content:space-between; margin-top:16px; padding-top:10px;
    border-top:0.5px solid #ddd; font-size:13px; color:#bbb; }
`;

function buildAttHtml(pages) {
  return `<html xmlns:o="urn:schemas-microsoft-com:office:office"
    xmlns:w="urn:schemas-microsoft-com:office:word"
    xmlns="http://www.w3.org/TR/REC-html40">
  <head><meta charset="UTF-8">
  <xml><w:WordDocument><w:View>Print</w:View><w:Zoom>90</w:Zoom></w:WordDocument></xml>
  <style>${ATT_CSS}</style></head>
  <body>${pages}</body></html>`;
}

function chipAtt(v) {
  if (v === 'present') return '<span class="chip-present">✔ حاضرة</span>';
  if (v === 'absent')  return '<span class="chip-absent">✖ غائبة</span>';
  return '<span class="chip-empty">—</span>';
}

/**
 * studentsData = [
 *   { name, sessions: [ { date, day, subjects:{قرآن:'present'|'absent'|'',...} } ] }
 * ]
 * mode: 'perStudent' = صفحة لكل طالبة | 'combined' = جدول مشترك
 */
function buildAttPages(studentsData, mode) {
  // اجمع كل المواد الموجودة
  const allSubjects = new Set();
  studentsData.forEach(st =>
    st.sessions.forEach(se =>
      Object.keys(se.subjects || {}).forEach(k => allSubjects.add(k))
    )
  );
  const subjects = [...allSubjects];

  if (mode === 'perStudent') {
    // ── صفحة لكل طالبة ──────────────────────────────
    return studentsData.map(st => {
      const sessions = [...(st.sessions || [])].sort((a,b) => (a.date||'') < (b.date||'') ? -1 : 1);
      const subjs = subjects.length ? subjects : [...new Set(sessions.flatMap(se => Object.keys(se.subjects||{})))];
      const headCells = `<th>#</th><th>اليوم</th><th>التاريخ</th>` + subjs.map(s=>`<th>${s}</th>`).join('') + `<th>الإجمالي</th>`;
      let totalP = 0, totalA = 0;
      const rows = sessions.map((se, i) => {
        const subjCells = subjs.map(s => `<td>${chipAtt((se.subjects||{})[s]||'')}</td>`).join('');
        const p = subjs.filter(s => (se.subjects||{})[s]==='present').length;
        const a = subjs.filter(s => (se.subjects||{})[s]==='absent').length;
        totalP += p; totalA += a;
        const total = subjs.length ? `${p}✔ / ${a}✖` : '—';
        return `<tr><td>${i+1}</td><td>${se.day||''}</td><td>${se.date||''}</td>${subjCells}<td>${total}</td></tr>`;
      }).join('');
      const summaryRow = `<tr style="background:#eef3ff;font-weight:600"><td colspan="3">الإجمالي</td>${subjs.map(()=>'<td></td>').join('')}<td>${totalP}✔ / ${totalA}✖</td></tr>`;

      return `<div class="att-page">
        <div class="att-header"><div class="att-prog">📖 برنامج متين العلمي</div></div>
        <div class="att-title">سجل الحضور والغياب</div>
        <div class="att-subtitle">${st.name}</div>
        <table>
          <thead><tr>${headCells}</tr></thead>
          <tbody>${rows}${summaryRow}</tbody>
        </table>
        <div class="att-footer"><span>برنامج متين العلمي</span><span>◆</span><span>${st.name}</span></div>
      </div>`;
    }).join('');

  } else {
    // ── جدول مشترك — عمود لكل طالبة ─────────────────
    // نجمع كل الجلسات (date+day) المميزة
    const dateMap = {};
    studentsData.forEach(st =>
      (st.sessions||[]).forEach(se => {
        const key = se.date||'';
        if (!dateMap[key]) dateMap[key] = { date: se.date||'', day: se.day||'' };
      })
    );
    const allDates = Object.values(dateMap).sort((a,b)=>a.date<b.date?-1:1);

    const nameHeads = studentsData.map(st => `<th>${st.name}</th>`).join('');
    const headCells = `<th>#</th><th>اليوم</th><th>التاريخ</th>${nameHeads}`;

    const rows = allDates.map((dd, i) => {
      const cells = studentsData.map(st => {
        const se = (st.sessions||[]).find(x=>(x.date||'')===(dd.date||''));
        if (!se) return '<td><span class="chip-empty">—</span></td>';
        const p = Object.values(se.subjects||{}).filter(v=>v==='present').length;
        const a = Object.values(se.subjects||{}).filter(v=>v==='absent').length;
        const total = (p+a)>0 ? `${p}✔ ${a}✖` : '—';
        return `<td>${total}</td>`;
      }).join('');
      return `<tr><td>${i+1}</td><td>${dd.day}</td><td>${dd.date}</td>${cells}</tr>`;
    }).join('');

    return `<div class="att-page">
      <div class="att-header"><div class="att-prog">📖 برنامج متين العلمي</div></div>
      <div class="att-title">سجل الحضور والغياب — جدول مشترك</div>
      <table>
        <thead><tr>${headCells}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="att-footer"><span>برنامج متين العلمي</span><span>◆</span><span>إجمالي الجلسات: ${allDates.length}</span></div>
    </div>`;
  }
}

export async function exportAttendanceWord(studentsData, mode='perStudent') {
  if (!studentsData.length) { showToast('لا توجد بيانات للتصدير'); return; }
  const html = buildAttHtml(buildAttPages(studentsData, mode));
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

export async function exportAttendancePdf(studentsData, mode='perStudent') {
  if (!studentsData.length) { showToast('لا توجد بيانات للتصدير'); return; }
  const html = buildAttHtml(buildAttPages(studentsData, mode));
  const win = window.open('', '_blank');
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); }, 800);
  showToast('تم فتح نافذة الطباعة ✅');
}
