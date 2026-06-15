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
