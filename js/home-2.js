import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js";
import { getFirestore, doc, getDoc, getDocs, addDoc, setDoc,
         collection, query, where, orderBy, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";
import { FIREBASE_CONFIG } from "./config.js";

// ملاحظة: منطق السايدبار (auth state, روابط الأدمن، الخروج) بالكامل
// أصبح في home-1.js فقط — هذا الملف مسؤول عن نموذج التواصل فقط
// لمنع التكرار وتعارض عرض السايدبار.

const app  = getApps().length ? getApp() : initializeApp(FIREBASE_CONFIG);
const auth = getAuth(app);
const db   = getFirestore(app);

// ملء اسم المستخدمة تلقائياً في نموذج التواصل (لو مسجلة دخول)
auth.onAuthStateChanged(async user => {
  if (!user) return;
  const ctName = document.getElementById('ctName');
  if (!ctName) return;
  const snap = await getDoc(doc(db, 'users', user.uid));
  const name = user.displayName || user.email.split('@')[0];
  ctName.value = (snap.exists() && snap.data().name) ? snap.data().name : name;
});

// ── تحميل المستلمين من Firebase ──────────────
async function loadRecipients() {
  const select = document.getElementById('ctRecipient');
  if (!select) return;

  try {
    // جيبي الإدارة والمعلمات النشطين فقط
    const [adminSnap, teacherSnap] = await Promise.all([
      getDocs(query(collection(db,'users'), where('role','==','admin'))),
      getDocs(query(collection(db,'users'), where('role','==','teacher'), where('status','==','active')))
    ]);

    let html = '<option value="">اختاري الجهة</option>';

    // الإدارة
    if (!adminSnap.empty) {
      html += '<optgroup label="── الإدارة ──">';
      adminSnap.forEach(d => {
        html += `<option value="${d.id}">${d.data().name || 'الإدارة العامة'}</option>`;
      });
      html += '</optgroup>';
    }

    // المعلمات
    if (!teacherSnap.empty) {
      html += '<optgroup label="── المعلمات ──">';
      teacherSnap.forEach(d => {
        const data = d.data();
        html += `<option value="${d.id}">${data.name || 'معلمة'}</option>`;
      });
      html += '</optgroup>';
    }

    if (adminSnap.empty && teacherSnap.empty) {
      html = '<option value="">لا يوجد مستلمون متاحون</option>';
    }

    select.innerHTML = html;
  } catch(e) {
    console.error('loadRecipients error:', e);
    select.innerHTML = '<option value="">تعذر التحميل</option>';
  }
}

// تحميل المستلمين عند فتح الصفحة
loadRecipients();

// ── إرسال الرسالة ─────────────────────────────
window.submitContactNew = async () => {
  const nameEl      = document.getElementById('ctName');
  const recipientEl = document.getElementById('ctRecipient');
  const topicEl     = document.getElementById('ctTopic');
  const bodyEl      = document.getElementById('ctBody');
  const btn         = document.getElementById('ctBtn');
  const successEl   = document.getElementById('ctSuccess');

  // تحقق من الحقول المطلوبة
  let valid = true;
  [nameEl, recipientEl, topicEl, bodyEl].forEach(el => {
    if (!el || !el.value.trim()) { if(el) el.style.borderColor='#c0392b'; valid=false; }
    else el.style.borderColor='';
  });

  const recipientUid = recipientEl.value;
  const bodyText     = `[${topicEl.value}]\n${bodyEl.value.trim()}`;

  btn.disabled = true;
  btn.innerHTML = '<i class="ti ti-loader ti-spin"></i> جارٍ الإرسال...';

  try {
    const user = auth.currentUser;
    if (!user) { alert('يجب تسجيل الدخول أولاً'); btn.disabled=false; btn.innerHTML='<i class="ti ti-send"></i> إرسال الرسالة'; return; }

    // جيبي اسم المرسلة من Firestore أو استخدمي ما كتبته
    const senderSnap = await getDoc(doc(db,'users',user.uid));
    const senderName = (senderSnap.exists() && senderSnap.data().name)
      ? senderSnap.data().name
      : (nameEl.value.trim() || user.email || '');
    const senderRole = (senderSnap.exists() && senderSnap.data().role) || 'student';

    // إنشاء أو تحديث المحادثة
    const cid = [user.uid, recipientUid].sort().join('__');
    await setDoc(doc(db,'conversations',cid), {
      participants: [user.uid, recipientUid],
      lastMsg:  bodyText.slice(0,60) || '',
      lastAt:   serverTimestamp(),
      [`unread.${recipientUid}`]: 1,
      [`unread.${user.uid}`]:     0,
    }, { merge: true });

    // إضافة الرسالة
    await addDoc(collection(db,'conversations',cid,'messages'), {
      text:       bodyText     || '',
      senderId:   user.uid     || '',
      senderName: senderName   || '',
      senderRole: senderRole   || '',
      sentAt:     serverTimestamp(),
    });

    // إشعار Firestore للمستلم
    if (recipientUid) {
      await addDoc(collection(db,'notifications',recipientUid,'pending'), {
        title:     `💬 ${senderName}`,
        body:      bodyText.slice(0, 80),
        url:       'https://mateenweb.github.io/Mateen/html/messages.html',
        senderId:  user.uid,
        createdAt: serverTimestamp(),
      });
    }

    // نجاح
    btn.innerHTML = '<i class="ti ti-check"></i> تم الإرسال بنجاح!';
    btn.style.background = 'var(--green-mid)';
    if (successEl) successEl.style.display = 'block';
    [nameEl, recipientEl, topicEl, bodyEl].forEach(el => { if(el) el.value=''; });
    // إعادة تحميل الخيارات
    loadRecipients();

    setTimeout(() => {
      btn.disabled=false;
      btn.innerHTML='<i class="ti ti-send"></i> إرسال الرسالة';
      btn.style.background='';
      if (successEl) successEl.style.display='none';
    }, 3500);

  } catch(e) {
    console.error(e);
    btn.disabled=false;
    btn.innerHTML='<i class="ti ti-send"></i> إرسال الرسالة';
    alert('حدث خطأ أثناء الإرسال: ' + e.message);
  }
};

