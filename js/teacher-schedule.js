import { initializeApp } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js";
import { getFirestore, collection, doc, getDoc, getDocs, addDoc, deleteDoc, query, orderBy, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js";
import { FIREBASE_CONFIG } from "./config.js";

const app  = initializeApp(FIREBASE_CONFIG);
const db   = getFirestore(app);
const auth = getAuth(app);

const DAYS_ORDER = ['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];

let currentUser = null;
let teacherSubject = '';

onAuthStateChanged(auth, async user => {
  if (!user) { window.location.href = 'login.html'; return; }

  const snap = await getDoc(doc(db, 'users', user.uid));
  if (!snap.exists()) { window.location.href = 'login.html'; return; }

  const data   = snap.data();
  const role   = data.role   || '';
  const status = data.status || '';

  if (role !== 'teacher' && role !== 'admin' && role !== 'supervisor') {
    window.location.href = 'home.html'; return;
  }
  if (status === 'pending' || status === 'suspended') {
    window.location.href = 'home.html'; return;
  }

  currentUser    = user;
  teacherSubject = data.subject || user.uid;

  document.getElementById('teacherName').textContent = data.name || user.email;
  document.getElementById('authGate').style.display   = 'none';
  document.getElementById('mainContent').style.display = 'block';

  loadSchedule();
});

window.doLogout = () => signOut(auth).then(() => window.location.href = 'login.html');

// ── Load schedule ──────────────────────
async function loadSchedule() {
  const container = document.getElementById('scheduleContainer');
  try {
    const q = query(collection(db, 'teachers', teacherSubject, 'schedule'), orderBy('createdAt'));
    const snap = await getDocs(q);

    if (snap.empty) {
      container.innerHTML = '<div class="empty-state"><i class="ti ti-calendar-off"></i><span>لا توجد مواعيد مضافة بعد</span></div>';
      return;
    }

    const slots = [];
    snap.forEach(d => slots.push({ id: d.id, ...d.data() }));
    slots.sort((a, b) => DAYS_ORDER.indexOf(a.day) - DAYS_ORDER.indexOf(b.day));

    container.innerHTML = slots.map(s => `
      <div class="sched-row">
        <div class="sched-day-badge">${s.day}</div>
        <div>
          <div class="sched-time-val">${s.time || '--:--'}</div>
          ${s.note ? `<div class="sched-note-val">${s.note}</div>` : ''}
        </div>
        <button class="sched-del-btn" onclick="deleteSlot('${s.id}')"><i class="ti ti-trash"></i></button>
      </div>
    `).join('');
  } catch(e) {
    container.innerHTML = '<div class="empty-state">حدث خطأ أثناء التحميل</div>';
  }
}

window.showAddSlot = () => {
  document.getElementById('addSlotForm').style.display = 'block';
};

window.saveSlot = async () => {
  const day  = document.getElementById('slotDay').value;
  const time = document.getElementById('slotTime').value;
  const note = document.getElementById('slotNote').value.trim();

  if (!time) { alert('يرجى تحديد الوقت'); return; }

  try {
    await addDoc(collection(db, 'teachers', teacherSubject, 'schedule'), {
      day, time, note, createdAt: serverTimestamp()
    });
    document.getElementById('addSlotForm').style.display = 'none';
    document.getElementById('slotTime').value = '';
    document.getElementById('slotNote').value = '';
    loadSchedule();
  } catch(e) {
    alert('حدث خطأ أثناء الحفظ');
  }
};

window.deleteSlot = async id => {
  if (!confirm('حذف هذا الموعد؟')) return;
  await deleteDoc(doc(db, 'teachers', teacherSubject, 'schedule', id));
  loadSchedule();
};
