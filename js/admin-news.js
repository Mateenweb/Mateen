/**
 * admin-news.js
 * إدارة الأخبار + إشعارات فورية للمستخدمين
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

// ── تحقق من الإدارة ──────────────────────────────────────────
onAuthStateChanged(auth, async user => {
  if (!user) return;
  const snap = await import("https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js")
    .then(m => m.getDoc(doc(db,'users',user.uid)));
  if (!snap.exists() || !['admin','supervisor','teacher'].includes(snap.data().role)) return;

  // أضيف زرار الأخبار في الأدمن
  addNewsButton();
  loadAdminNews();
});

function addNewsButton() {
  // الزرار موجود في الـ navbar — مش محتاجين floating button
}

// ── تحميل قائمة الأخبار في الأدمن ───────────────────────────
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

// ── إضافة خبر جديد + إشعار فوري ─────────────────────────────
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

    // أبعت إشعار فوري لكل المستخدمين النشطين
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

// ── إرسال إشعار فوري لكل المستخدمين ─────────────────────────
// (يشتغل لما الموقع مفتوح عندهم — foreground)
async function sendNewsNotification(title, body) {
  try {
    // خزّن الإشعار في notifications collection
    // كل مستخدم يشوفه لما يفتح الموقع
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

// ── حذف خبر ──────────────────────────────────────────────────
window.deleteAdminNews = async id => {
  if (!confirm('حذف هذا الخبر نهائياً؟')) return;
  await deleteDoc(doc(db, 'news', id));
};
