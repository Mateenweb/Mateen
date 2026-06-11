import { initializeApp } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js";
import { getFirestore, collection, doc, getDoc, getDocs, addDoc, deleteDoc, query, orderBy, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js";
import { FIREBASE_CONFIG } from "./config.js";

const app  = initializeApp(FIREBASE_CONFIG);
const db   = getFirestore(app);
const auth = getAuth(app);

const DAYS_ORDER = ['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
const DAY_ICONS  = { 'الأحد':'🌅','الاثنين':'📖','الثلاثاء':'✏️','الأربعاء':'📚','الخميس':'🌿','الجمعة':'🕌','السبت':'⭐' };

let currentUser = null;
let teacherSubject = '';

onAuthStateChanged(auth, async user => {
  if (!user) { window.location.href = '../html/login.html'; return; }

  const snap = await getDoc(doc(db, 'users', user.uid));
  if (!snap.exists()) { window.location.href = '../html/login.html'; return; }

  const data   = snap.data();
  const role   = data.role   || '';
  const status = data.status || '';

  if (role !== 'teacher' && role !== 'admin' && role !== 'supervisor') {
    window.location.href = '../html/home.html'; return;
  }
  if (status === 'pending' || status === 'suspended') {
    window.location.href = '../html/home.html'; return;
  }

  currentUser    = user;
  teacherSubject = data.subject || user.uid;

  document.getElementById('teacherName').textContent = data.name || user.email;
  document.getElementById('authGate').style.display   = 'none';
  document.getElementById('mainContent').style.display = 'block';

  loadSchedule();
});

window.doLogout = () => signOut(auth).then(() => window.location.href = '../html/login.html');

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

    // رتّب حسب الأيام ثم الوقت
    const byDay = {};
    DAYS_ORDER.forEach(d => byDay[d] = []);
    slots.forEach(s => { if (byDay[s.day]) byDay[s.day].push(s); });
    const activeDays = DAYS_ORDER.filter(d => byDay[d].length > 0);

    let html = '<div class="schedule-week">';
    activeDays.forEach(day => {
      const daySlots = byDay[day].sort((a,b) => (a.time||'').localeCompare(b.time||''));
      html += '<div class="sched-day-group">';
      html += '<div class="sched-day-header">';
      html += '<span class="sched-day-icon">' + (DAY_ICONS[day]||'📅') + '</span>';
      html += '<span class="sched-day-name">' + day + '</span>';
      html += '<span class="sched-day-count">' + daySlots.length + ' موعد</span>';
      html += '</div>';
      html += '<div class="sched-slots">';
      daySlots.forEach(s => {
        html += '<div class="sched-slot">';
        html += '<span class="sched-time-pill"><i class="ti ti-clock"></i> ' + (s.time||'--:--') + '</span>';
        if (s.note) {
          html += '<span class="sched-note-text">' + s.note + '</span>';
        } else {
          html += '<span class="sched-note-text" style="color:var(--text-light)">—</span>';
        }
        html += '<button class="sched-del-btn" onclick="deleteSlot(\'' + s.id + '\')"><i class="ti ti-trash"></i></button>';
        html += '</div>';
      });
      html += '</div></div>';
    });
    html += '</div>';
    container.innerHTML = html;

  } catch(e) {
    container.innerHTML = '<div class="empty-state"><i class="ti ti-alert-circle"></i><span>حدث خطأ أثناء التحميل</span></div>';
  }
}

window.showAddSlot = () => {
  document.getElementById('addSlotForm').style.display = 'block';
  document.getElementById('addSlotForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
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
