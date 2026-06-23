import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, deleteDoc, doc, query, orderBy, Timestamp }
  from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js";
import { FIREBASE_CONFIG } from "./config.js";

const app = getApps().length ? getApp() : initializeApp(FIREBASE_CONFIG);
const db  = getFirestore(app);
const auth = getAuth(app);

// اقرأ TEACHER_ID من data attribute على script tag
const scriptEl   = document.currentScript ||
  [...document.querySelectorAll('script')].find(s => s.src.includes('teacher-schedule-shared'));
const TEACHER_ID = scriptEl ? scriptEl.dataset.teacherId : '';

const DAYS_ORDER = ['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];

let scheduleSlots = [];

// ── تحميل الجدول ─────────────────────────────────────────────
async function loadSchedule() {
  const snap = await getDocs(collection(db, 'teachers', TEACHER_ID, 'schedule'));
  scheduleSlots = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  scheduleSlots.sort((a,b) => DAYS_ORDER.indexOf(a.day) - DAYS_ORDER.indexOf(b.day) || (a.time||'').localeCompare(b.time||''));
  renderSchedule();
  updateQuickCards();
}

// ── عرض الجدول ───────────────────────────────────────────────
function renderSchedule() {
  const c = document.getElementById('scheduleContainer');
  if (!c) return;
  if (!scheduleSlots.length) {
    c.innerHTML = '<div class="empty-state"><i class="ti ti-calendar-off"></i>لا توجد مواعيد بعد</div>';
    return;
  }

  // تجميع حسب اليوم
  const byDay = {};
  scheduleSlots.forEach(s => {
    if (!byDay[s.day]) byDay[s.day] = [];
    byDay[s.day].push(s);
  });

  let html = '';
  DAYS_ORDER.filter(d => byDay[d]).forEach(day => {
    html += `<div class="sched-day-block">
      <div class="sched-day-head"><i class="ti ti-calendar"></i> ${day}</div>
      ${byDay[day].map(s => `
        <div class="sched-slot">
          <div class="sched-slot-time"><i class="ti ti-clock"></i> ${formatTime(s.time)}</div>
          ${s.note ? `<div class="sched-slot-note">${esc(s.note)}</div>` : ''}
          <button class="sched-del-btn" onclick="window.deleteSlot('${s.id}')"><i class="ti ti-trash"></i></button>
        </div>
      `).join('')}
    </div>`;
  });
  c.innerHTML = html;
}

// ── بطاقات الإحصاء ───────────────────────────────────────────
function updateQuickCards() {
  const totalEl = document.getElementById('qTotalSlots');
  const daysEl  = document.getElementById('qTotalDays');
  const nextEl  = document.getElementById('qNextDay');
  if (totalEl) totalEl.textContent = scheduleSlots.length;
  if (daysEl)  daysEl.textContent  = [...new Set(scheduleSlots.map(s => s.day))].length;

  // أقرب موعد
  if (nextEl) {
    const todayIdx = new Date().getDay();
    let nearest = null;
    let minDiff  = 8;
    scheduleSlots.forEach(s => {
      const idx = DAYS_ORDER.indexOf(s.day);
      let diff = (idx - todayIdx + 7) % 7;
      if (diff === 0) diff = 0; // نفس اليوم
      if (diff < minDiff) { minDiff = diff; nearest = s; }
    });
    nextEl.textContent = nearest ? `${nearest.day} ${formatTime(nearest.time)}` : '—';
  }
}

// ── إضافة موعد ───────────────────────────────────────────────
window.showAddSlot = () => {
  const f = document.getElementById('addSlotForm');
  if (f) f.style.display = f.style.display === 'none' ? 'block' : 'none';
};

window.saveSlot = async () => {
  const day  = document.getElementById('slotDay')?.value;
  const time = document.getElementById('slotTime')?.value;
  const note = document.getElementById('slotNote')?.value?.trim() || '';
  if (!day || !time) { alert('اختاري اليوم والوقت'); return; }

  const btn = document.querySelector('.btn-save-slot');
  btn.disabled = true;
  try {
    await addDoc(collection(db, 'teachers', TEACHER_ID, 'schedule'), {
      day, time, note, createdAt: Timestamp.now()
    });
    document.getElementById('addSlotForm').style.display = 'none';
    document.getElementById('slotTime').value = '';
    document.getElementById('slotNote').value = '';
    await loadSchedule();
  } catch(e) { alert('خطأ: ' + e.message); }
  finally { btn.disabled = false; }
};

// ── حذف موعد ─────────────────────────────────────────────────
window.deleteSlot = async (id) => {
  if (!confirm('حذف هذا الموعد؟')) return;
  await deleteDoc(doc(db, 'teachers', TEACHER_ID, 'schedule', id));
  await loadSchedule();
};

// ── مساعدات ──────────────────────────────────────────────────
function formatTime(t) {
  if (!t) return '—';
  const [h, m] = t.split(':');
  const hr = parseInt(h);
  const ampm = hr >= 12 ? 'م' : 'ص';
  const hr12 = hr % 12 || 12;
  return `${hr12}:${m} ${ampm}`;
}

function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── تشغيل بعد auth ────────────────────────────────────────────
onAuthStateChanged(auth, user => {
  if (user && TEACHER_ID) loadSchedule();
});
