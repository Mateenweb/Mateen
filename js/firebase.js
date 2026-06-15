// ===========================
//  Firebase & App Logic
// ===========================

import { initializeApp }
  from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js";
import { getFirestore, collection, addDoc, updateDoc, deleteDoc,
         doc, onSnapshot, getDocs, query, orderBy, getDoc }
  from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";
import { fullDeleteUser } from "./delete-account.js";
import { getAuth, onAuthStateChanged }
  from "https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js";

import { FIREBASE_CONFIG }                from './config.js';
import { hijriToGregorian, parseDateParts } from './dateUtils.js';
import { renderTable, showToast }          from './ui.js';
import { exportWord, exportPdf } from './export.js';

const app  = initializeApp(FIREBASE_CONFIG);
const db   = getFirestore(app);
const auth = getAuth(app);

// ── Auth Guard ───────────────────────────────
onAuthStateChanged(auth, async user => {
  if (!user) { window.location.href = '../html/login.html'; return; }
  const snap = await getDoc(doc(db, 'users', user.uid));
  const role = snap.exists() ? snap.data().role : 'student';
  if (role === 'student') { window.location.href = '../html/login.html'; return; }
  // Show page content
  const gate = document.getElementById('authGate');
  const main = document.getElementById('mainContent');
  if (gate) gate.style.display = 'none';
  if (main) main.style.display = 'block';
});

let students = [];
let alphaSortActive = false;
const dateParts = {};

const defaultDoc = () => ({
  order:     Date.now(),
  name:      'طالبة جديدة',
  status:    '',
  day:       '',
  dateH:     '',
  dateG:     '',
  hour:      '',
  minute:    '00',
  ampm:      'ص',
  interview: 'pending',
  accepted:  'na'
});

const studentsQuery = query(collection(db, 'students'), orderBy('order'));
onSnapshot(studentsQuery, snapshot => {
  students = [];
  snapshot.forEach(d => students.push({ id: d.id, ...d.data() }));
  renderTable(students);
});

window.addRow = async () => {
  await addDoc(collection(db, 'students'), defaultDoc());
  showToast('تمت الإضافة');
};

window.addBulkNames = async () => {
  const text = document.getElementById('bulkNames').value;
  if(!text.trim()) return;
  const names = text.split('\n').filter(n => n.trim());
  for(let i=0; i<names.length; i++)
    await addDoc(collection(db,'students'), {...defaultDoc(), order:Date.now()+i, name:names[i].trim()});
  document.getElementById('bulkNames').value = '';
  showToast('تمت إضافة الأسماء');
};

window.autoSaveName = async (id, value) => updateDoc(doc(db,'students',id), { name:value });
window.updateField  = async (id, field, value) => updateDoc(doc(db,'students',id), { [field]:value });

window.toggleInterview = async (id, current) =>
  updateDoc(doc(db,'students',id), { interview: current==='done'?'pending':'done' });

window.toggleAcceptance = async (id, current, interview) => {
  if(interview!=='done') { alert('يجب إجراء المقابلة أولاً'); return; }
  const order = ['na','accepted','rejected'];
  await updateDoc(doc(db,'students',id), { accepted: order[(order.indexOf(current)+1)%3] });
};

window.deleteStudent = async id => {
  if(confirm('حذف الطالبة وكل بياناتها نهائياً؟')) {
    await fullDeleteUser(id);
    showToast('تم الحذف الكامل');
  }
};

window.copyStudentLink = (id) => {
  const url = location.origin + location.pathname.replace('index.html','') + 'student-view.html?id=' + id;
  navigator.clipboard.writeText(url).then(() => showToast('✅ تم نسخ الرابط'));
};

window.clearAll = async () => {
  if(!confirm('حذف جميع البيانات؟')) return;
  const snap = await getDocs(collection(db,'students'));
  for(const item of snap.docs) await deleteDoc(doc(db,'students',item.id));
  showToast('تم حذف الكل');
};

window.updateDatePart = async (id, key, value) => {
  const partMap = { hd:'d', hm:'m', hy:'y' };
  const part = partMap[key];
  if(!part) return;
  const student = students.find(s=>s.id===id) || {};
  if(!dateParts[id]) dateParts[id] = parseDateParts(student.dateH||'');
  dateParts[id][part] = value;
  const {d,m,y} = dateParts[id];
  const updates = { dateH:`${d}-${m}-${y}` };
  if(d&&m&&y) {
    const gr = hijriToGregorian(d,m,y);
    if(gr) updates.dateG = `${gr.d}-${gr.m}-${gr.y}`;
  }
  await updateDoc(doc(db,'students',id), updates);
};

window.applyFilters = () => {
  const search    = document.getElementById('search').value.toLowerCase();
  const interview = document.getElementById('interviewFilter').value;
  const result    = document.getElementById('resultFilter').value;
  const status    = document.getElementById('statusFilter').value;
  let filtered = students.filter(s =>
    (s.name||'').toLowerCase().includes(search) &&
    (interview==='all' || s.interview===interview) &&
    (result==='all'    || s.accepted===result) &&
    (status==='all'    || s.status===status)
  );
  if (alphaSortActive) {
    filtered = [...filtered].sort((a, b) =>
      (a.name||'').localeCompare(b.name||'', 'ar')
    );
  }
  renderTable(students, filtered);
};

window.toggleAlphaSort = () => {
  alphaSortActive = !alphaSortActive;
  const btn = document.getElementById('sortAlphaBtn');
  btn.classList.toggle('active', alphaSortActive);
  applyFilters();
};

// ── Export Modal ─────────────────────────────────────────────────
window.openExportModal  = () => document.getElementById('exportModal').classList.add('open');
window.closeExportModal = () => document.getElementById('exportModal').classList.remove('open');
window.toggleGroupOptions = () => {
  document.getElementById('groupOptions').style.display =
    document.getElementById('groupByTime').checked ? 'block' : 'none';
};
document.getElementById('exportModal').addEventListener('click', function(e){
  if(e.target===this) closeExportModal();
});
window.doExport = (type) => {
  if(type==='pdf') exportPdf(students);
  else exportWord(students);
  closeExportModal();
};

// ── Bulk Apply ────────────────────────────────────────────────────
window.onRowCheck = () => {
  const checked = document.querySelectorAll('.row-check:checked');
  document.getElementById('selectedCount').innerText = checked.length + ' محددة';
  document.querySelectorAll('.row-check').forEach(cb =>
    cb.closest('tr').classList.toggle('selected-row', cb.checked));
};

window.toggleSelectAll = val => {
  document.querySelectorAll('.row-check').forEach(cb => {
    cb.checked = val;
    cb.closest('tr').classList.toggle('selected-row', val);
  });
  document.querySelectorAll('#selectAll').forEach(b => b.checked = val);
  document.getElementById('selectedCount').innerText =
    (val ? document.querySelectorAll('.row-check').length : 0) + ' محددة';
};

window.applyBulkDateTime = async () => {
  const checked = document.querySelectorAll('.row-check:checked');
  if(!checked.length) { showToast('اختاري طالبات أولاً'); return; }

  const day  = document.getElementById('bulkDay').value;
  const dd   = String(document.getElementById('bulkDD').value||'').padStart(2,'0');
  const mm   = document.getElementById('bulkMM').value;
  const yy   = document.getElementById('bulkYY').value;
  const hour = document.getElementById('bulkHour').value;
  const ampm = document.getElementById('bulkAmpm').value;

  const updates = {};
  if(day)          updates.day    = day;
  if(dd&&mm&&yy) {
    updates.dateH = `${dd}-${mm}-${yy}`;
    const gr = hijriToGregorian(dd,mm,yy);
    if(gr) updates.dateG = `${gr.d}-${gr.m}-${gr.y}`;
  }
  if(hour)         updates.hour   = hour;
  updates.ampm = ampm;

  if(!Object.keys(updates).length) { showToast('حددي بيانات للتطبيق'); return; }
  for(const cb of checked)
    await updateDoc(doc(db,'students',cb.dataset.id), updates);

  showToast(`✅ تم التطبيق على ${checked.length} طالبة`);
  toggleSelectAll(false);
};
// ── Attendance Export Modal ───────────────────────────────────────
window.openAttendanceModal = () => {
  const list = document.getElementById('attStudentList');
  if (!students.length) { showToast('لا توجد طالبات'); return; }
  list.innerHTML = students.map(s => `
    <label class="att-student-item">
      <input type="checkbox" class="att-stu-check" data-id="${s.id}" checked>
      ${s.name || 'بدون اسم'}
    </label>
  `).join('');
  document.getElementById('attendanceModal').classList.add('open');
};

window.closeAttendanceModal = () =>
  document.getElementById('attendanceModal').classList.remove('open');

window.selectAllAttStudents = (val) => {
  document.querySelectorAll('.att-stu-check').forEach(cb => cb.checked = val);
};

document.getElementById('attendanceModal').addEventListener('click', function(e) {
  if (e.target === this) closeAttendanceModal();
});

window.doExportAttendance = async (type) => {
  const selectedIds = [...document.querySelectorAll('.att-stu-check:checked')]
    .map(cb => cb.dataset.id);
  if (!selectedIds.length) { showToast('اختاري طالبة واحدة على الأقل'); return; }

  const selectedSubjects = [...document.querySelectorAll('.att-subj-check:checked')]
    .map(cb => cb.value);
  if (!selectedSubjects.length) { showToast('اختاري مادة واحدة على الأقل'); return; }

  showToast('⏳ جارٍ تجهيز البيانات...');

  // جلب بيانات الجلسات من Firebase
  const { getFirestore, collection, getDocs, query, orderBy: fbOrderBy, doc: fbDoc, getDoc: fbGetDoc } =
    await import('https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js');
  const fdb = getFirestore();

  const rows = [];
  for (const id of selectedIds) {
    const student = students.find(s => s.id === id);
    if (!student) continue;

    const sessSnap = await getDocs(
      query(collection(fdb, 'students', id, 'sessions'), fbOrderBy('date'))
    );
    const sessions = sessSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    let present = 0, absent = 0, total = 0;
    const sessionRows = sessions.map(sess => {
      const subjs = sess.subjects || {};
      const cells = selectedSubjects.map(subj => {
        const val = subjs[subj];
        if (val === 'present') { present++; total++; return '<td style="color:#2e7d32;font-weight:700">✔</td>'; }
        if (val === 'absent')  { absent++;  total++; return '<td style="color:#c62828;font-weight:700">✖</td>'; }
        return '<td style="color:#bbb">—</td>';
      });
      return `<tr><td>${sess.day || ''}</td><td>${sess.date || ''}</td>${cells.join('')}</tr>`;
    });

    const pct = total ? Math.round(present / total * 100) : null;
    rows.push({ student, sessionRows, present, absent, total, pct });
  }

  // بناء HTML
  const subjHeaders = selectedSubjects.map(s => `<th>${s}</th>`).join('');
  const pages = rows.map(({ student, sessionRows, present, absent, total, pct }) => {
    const pctColor = pct === null ? '#888' : pct >= 75 ? '#2e7d32' : pct >= 50 ? '#e65100' : '#c62828';
    return `
    <div class="page">
      <div class="page-header">
        <div class="prog-name">📖 برنامج متين العلمي</div>
      </div>
      <div class="page-title">${student.name || 'بدون اسم'}</div>
      <div style="text-align:center;margin-bottom:14px;display:flex;justify-content:center;gap:24px;font-size:15px">
        <span style="color:#2e7d32">✔ حاضرة: <b>${present}</b></span>
        <span style="color:#c62828">✖ غائبة: <b>${absent}</b></span>
        ${pct !== null ? `<span style="color:${pctColor}">نسبة الحضور: <b>${pct}%</b></span>` : ''}
      </div>
      <table>
        <thead>
          <tr>
            <th>اليوم</th><th>التاريخ</th>${subjHeaders}
          </tr>
        </thead>
        <tbody>
          ${sessionRows.length ? sessionRows.join('') : '<tr><td colspan="20" style="text-align:center;color:#aaa;padding:20px">لا توجد جلسات مسجلة</td></tr>'}
        </tbody>
      </table>
      <div class="page-footer">
        <span>برنامج متين العلمي</span>
        <span>◆</span>
        <span>الصفحة {PAGE}</span>
      </div>
      <br style="mso-break-type:page-break;page-break-after:always">
    </div>`;
  }).join('');

  const css = `
    @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600&display=swap');
    * { box-sizing:border-box; margin:0; padding:0; }
    body { font-family:'Cairo',Arial,sans-serif; direction:rtl; background:#f0f0f0; padding:20px; }
    @media print { body { background:white; padding:0; } .page { box-shadow:none; margin:0; } }
    .page { background:white; max-width:750px; margin:0 auto 30px; padding:32px 36px 24px; border-radius:8px; box-shadow:0 2px 12px rgba(0,0,0,.1); page-break-after:always; }
    .page:last-child { page-break-after:avoid; }
    .page-header { display:flex; justify-content:space-between; align-items:center; padding-bottom:14px; border-bottom:2.5px solid #1a3a5c; margin-bottom:18px; }
    .prog-name { font-size:22px; font-weight:600; color:#1a3a5c; }
    .page-title { text-align:center; font-size:22px; font-weight:700; color:#1a3a5c; margin-bottom:12px; }
    table { width:100%; border-collapse:collapse; font-size:16px; margin-top:10px; }
    thead tr { background:#1a3a5c; }
    thead th { color:white; padding:10px 12px; text-align:center; font-weight:600; }
    tbody tr:nth-child(even) { background:#f5f8fb; }
    tbody td { padding:9px 12px; text-align:center; border-bottom:0.5px solid #e8edf2; }
    .page-footer { display:flex; justify-content:space-between; margin-top:18px; padding-top:10px; border-top:0.5px solid #ddd; font-size:13px; color:#bbb; }
  `;

  let html = `<html xmlns:o="urn:schemas-microsoft-com:office:office"
    xmlns:w="urn:schemas-microsoft-com:office:word"
    xmlns="http://www.w3.org/TR/REC-html40">
    <head><meta charset="UTF-8">
    <xml><w:WordDocument><w:View>Print</w:View><w:Zoom>90</w:Zoom></w:WordDocument></xml>
    <style>${css}</style></head>
    <body>${pages}</body></html>`;

  let p = 1;
  html = html.replace(/{PAGE}/g, () => p++);

  if (type === 'word') {
    const blob = new Blob(['\uFEFF' + html], {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document;charset=utf-8'
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'متين_حضور_غياب.doc';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    showToast('تم التصدير ✅');
  } else {
    const win = window.open('', '_blank');
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 800);
  }
  closeAttendanceModal();
};
