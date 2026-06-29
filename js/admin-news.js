/**
 * admin-news.js
 * إدارة الNews + Notificationات فورية للمستخدمين
 */

import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js";
import { getFirestore, collection, addDoc, deleteDoc, doc,
         onSnapshot, query, orderBy, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged }
  from "https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js";
import { FIREBASE_CONFIG } from "./config.js";

const app  = getApps().length ? getApp() : initializeApp(FIREBASE_CONFIG);
const db   = getFirestore(app);
const auth = getAuth(app);

// ── تحقق from the إدارة ──────────────────────────────────────────
onAuthStateChanged(auth, async user => {
  if (!user) return;
  const snap = await import("https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js")
    .then(m => m.getDoc(doc(db,'users',user.uid)));
  if (!snap.exists() || !['admin','supervisor','teacher'].includes(snap.data().role)) return;

  // أضيف Button الNews في Admin
  addNewsButton();
  loadAdminNews();
});

function addNewsButton() {
  // Button موجود في the navbar — not/don't محتاجين floating button
}

// ── Load List/Menu الNews في Admin ───────────────────────────
function loadAdminNews() {
  const q = query(collection(db, 'news'), orderBy('createdAt', 'desc'));
  onSnapshot(q, snap => {
    const list = document.getElementById('adminNewsList');
    if (!list) return;
    if (snap.empty) {
      list.innerHTML = '<div style="text-align:center;padding:24px;color:#999;font-size:13px">لا توجد أخبار</div>';
      return;
    }
    list.innerHTML = snap.docs.map(d => {
      const n = d.data();
      const date = n.createdAt?.toDate?.()?.toLocaleDateString('ar',{day:'numeric',month:'short'}) || '';
      return `
        <div style="display:flex;align-items:center;gap:12px;padding:12px 16px;border-bottom:1px solid #f0ebe0">
          <div style="flex:1;min-width:0">
            <div style="font-size:13.5px;font-weight:700;color:#2c1a0e">${n.title||''}</div>
            <div style="font-size:11.5px;color:#8a6a52;margin-top:2px">${n.tag||''} • ${date}</div>
          </div>
          ${n.pinned ? '<span style="font-size:12px;color:#c9a227">📌</span>' : ''}
          <button onclick="deleteAdminNews('${d.id}')"
            style="background:#fee2e2;border:none;border-radius:8px;padding:5px 10px;color:#8b3a2a;cursor:pointer;font-size:12px;flex-shrink:0">
            <i class="ti ti-trash"></i>
          </button>
        </div>`;
    }).join('');
  });
}

// ── Add خبر جthisد + Notification فوري ─────────────────────────────
window.addNews = async () => {
  const title   = document.getElementById('newsTitle').value.trim();
  const body    = document.getElementById('newsBody').value.trim();
  const tag     = document.getElementById('newsTag').value.trim() || '📢 خبر';
  const pinned  = document.getElementById('newsPinned').checked;

  if (!title || !body) {
    alert('يرجى كتابة العنوان والتفاصيل');
    return;
  }

  const btn = document.querySelector('#newsSection button[onclick="addNews()"]');
  btn.disabled = true;
  btn.innerHTML = '<i class="ti ti-loader-2" style="animation:spin .8s linear infinite;display:inline-block"></i> جارٍ النشر...';

  try {
    // أضيف الخبر في Firestore
    await addDoc(collection(db, 'news'), {
      title, body, tag, pinned,
      createdAt: serverTimestamp(),
    });

    // أبعت Notification فوري لكل Userين النشطين
    await sendNewsNotification(title, body);

    // مسح الحقول
    document.getElementById('newsTitle').value = '';
    document.getElementById('newsBody').value  = '';
    document.getElementById('newsTag').value   = '';
    document.getElementById('newsPinned').checked = false;

    btn.innerHTML = '<i class="ti ti-check"></i> تم النشر بنجاح!';
    btn.style.background = '#2d6a4f';
    setTimeout(() => {
      btn.disabled = false;
      btn.innerHTML = '<i class="ti ti-send"></i> نشر الخبر + إرسال إشعار';
      btn.style.background = '';
    }, 2500);

  } catch(e) {
    alert('حدث خطأ: ' + e.message);
    btn.disabled = false;
    btn.innerHTML = '<i class="ti ti-send"></i> نشر الخبر + إرسال إشعار';
  }
};

// ── Send/Submit Notification فوري لكل Userين ─────────────────────────
// (يشتغل When الموقع مفتوح عنthisم — foreground)
async function sendNewsNotification(title, body) {
  try {
    // خزّن الNotification في notifications collection
    // كل مستخدم يشوفه When يفتح الموقع
    await addDoc(collection(db, 'notifications'), {
      type:      'news',
      title:     `📢 ${title}`,
      body:      body.slice(0, 80),
      url:       '/Mateen/html/news.html',
      createdAt: serverTimestamp(),
      readBy:    [],
    });
  } catch(e) {
    console.warn('notification error:', e.message);
  }
}

// ── Delete خبر ──────────────────────────────────────────────────
window.deleteAdminNews = async id => {
  if (!confirm('حذف هذا الخبر نهائياً؟')) return;
  await deleteDoc(doc(db, 'news', id));
};
// ── مودال إضافة خبر جديد ──────────────────────────────────────
window.openAddNewsModal = () => {
  // إنشاء المودال لو مش موجود
  if (!document.getElementById('addNewsModalAdmin')) {
    const modal = document.createElement('div');
    modal.id = 'addNewsModalAdmin';
    modal.className = 'm-overlay';
    modal.innerHTML = `
      <div class="m-box-news">
        <div class="m-head-news">
          <div class="m-title-news">📰 خبر جديد</div>
          <button class="m-close-news" onclick="document.getElementById('addNewsModalAdmin').classList.remove('show')">✕</button>
        </div>
        <div class="m-form-stack">
          <div>
            <label class="m-field-label">العنوان *</label>
            <input id="newsTitle" type="text" placeholder="عنوان الخبر أو الإعلان" class="m-text-input"/>
          </div>
          <div>
            <label class="m-field-label">التفاصيل</label>
            <textarea id="newsBody" rows="4" placeholder="تفاصيل الخبر..." class="m-textarea"></textarea>
          </div>
          <div class="m-row-gap10">
            <div class="m-col-flex1">
              <label class="m-field-label">التصنيف</label>
              <select id="newsTag" class="m-select-news">
                <option value="📢 إعلان">📢 إعلان</option>
                <option value="📝 خبر">📝 خبر</option>
                <option value="⚠️ تنبيه">⚠️ تنبيه</option>
                <option value="🎉 مناسبة">🎉 مناسبة</option>
                <option value="📅 موعد">📅 موعد</option>
              </select>
            </div>
            <div class="m-col-flex1">
              <label class="m-field-label">الظهور</label>
              <select id="newsVisibility" class="m-select-news">
                <option value="public">🌐 للجميع (بدون تسجيل)</option>
                <option value="members">👥 للمسجلات فقط</option>
              </select>
            </div>
          </div>
          <div class="m-pin-wrap">
            <label class="m-pin-label">
              <input type="checkbox" id="newsPinned" class="m-pin-checkbox"/> 📌 تثبيت الخبر في الأعلى
            </label>
          </div>
          <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:8px">
            <button class="m-btn-cancel" onclick="document.getElementById('addNewsModalAdmin').classList.remove('show')">إلغاء</button>
            <button class="m-btn-pub" onclick="addNews()"><i class="ti ti-send"></i> نشر</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(modal);
  }
  document.getElementById('addNewsModalAdmin').classList.add('show');
  document.getElementById('newsTitle').value = '';
  document.getElementById('newsBody').value  = '';
};

// ── مودال إضافة موعد مهم ───────────────────────────────────────
window.openAddEventModal = () => {
  if (!document.getElementById('addEventModalAdmin')) {
    const modal = document.createElement('div');
    modal.id = 'addEventModalAdmin';
    modal.className = 'm-overlay';
    modal.innerHTML = `
      <div class="m-box-news">
        <div class="m-head-news">
          <div class="m-title-news">📅 موعد مهم جديد</div>
          <button class="m-close-news" onclick="document.getElementById('addEventModalAdmin').classList.remove('show')">✕</button>
        </div>
        <div class="m-form-stack">
          <div>
            <label class="m-field-label">اسم الموعد / الحدث *</label>
            <input id="eventTitle" type="text" placeholder="مثال: اختبار التفسير" class="m-text-input"/>
          </div>
          <div>
            <label class="m-field-label">التاريخ (مثال: الأحد 19 صفر)</label>
            <input id="eventDate" type="text" placeholder="مثال: الأحد 19 صفر" class="m-text-input"/>
          </div>
          <div class="m-pin-wrap">
            <label class="m-pin-label">
              <input type="checkbox" id="eventHighlight" class="m-pin-checkbox"/> 🌟 تمييز بالذهبي (حدث مهم)
            </label>
          </div>
          <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:8px">
            <button class="m-btn-cancel" onclick="document.getElementById('addEventModalAdmin').classList.remove('show')">إلغاء</button>
            <button class="m-btn-pub" onclick="addEvent()"><i class="ti ti-calendar-plus"></i> حفظ</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(modal);
  }
  document.getElementById('addEventModalAdmin').classList.add('show');
  document.getElementById('eventTitle').value = '';
  document.getElementById('eventDate').value  = '';
};

window.addEvent = async () => {
  const title     = document.getElementById('eventTitle').value.trim();
  const date      = document.getElementById('eventDate').value.trim();
  const highlight = document.getElementById('eventHighlight').checked;
  if (!title) { alert('أدخلي اسم الموعد'); return; }
  await addDoc(collection(db, 'events'), { title, date, highlight, createdAt: serverTimestamp() });
  document.getElementById('addEventModalAdmin').classList.remove('show');
};
