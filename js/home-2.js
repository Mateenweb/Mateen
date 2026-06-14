
import { initializeApp, getApps, getApp }   from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js";
import { getFirestore, doc, getDoc, collection, addDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";
import { FIREBASE_CONFIG } from "./config.js";

const app  = getApps().length ? getApp() : initializeApp(FIREBASE_CONFIG);
const auth = getAuth(app);
const db   = getFirestore(app);

// ── Sidebar auth state ────────────────────────
onAuthStateChanged(auth, async user => {
  const guest   = document.getElementById('sidebar-guest');
  const userDiv = document.getElementById('sidebar-user');
  if (!user) { guest.style.display='block'; userDiv.style.display='none'; return; }
  guest.style.display='none'; userDiv.style.display='flex'; userDiv.classList.add('show-user');

  // إخفاء زراير تسجيل الدخول/التسجيل لما تكون مسجلة دخول
  ['heroBtns','navBtns','mobNavBtns'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.classList.remove('d-flex','d-lg-flex'); el.classList.add('d-none'); }
  });
  const snap = await getDoc(doc(db, 'users', user.uid));
  const role = snap.exists() ? snap.data().role : 'student';
  const name = user.displayName || user.email.split('@')[0];
  document.getElementById('sidebarName').textContent = 'مرحباً، ' + name;
  document.getElementById('sidebarRole').textContent = role === 'admin' ? 'مشرفة / معلمة' : 'الطالبة';
  if (role === 'admin') {
    const nav = userDiv.querySelector('.sidebar-nav');
    if (nav && !nav.querySelector('.admin-link')) {
      const d = document.createElement('div'); d.className='sidebar-divider'; nav.appendChild(d);
      const a = document.createElement('a'); a.href='admin.html'; a.className='admin-link';
      a.innerHTML='<i class="ti ti-shield"></i> لوحة الإداريات'; nav.appendChild(a);
    }
  }
});
window.doLogout = () => signOut(auth).then(() => window.location.href='../html/login.html');

// ── إرسال رسالة من نموذج تواصل الهوم إلى Firestore ───────────────────────
const SUBJECT_ROLE = { admin:'admin', tafseer:'teacher', fiqh:'teacher', aqeedah:'teacher', hadeeth:'teacher', quran1:'teacher', quran2:'teacher' };

window.submitContactNew = async () => {
  const nameEl      = document.getElementById('ctName');
  const recipientEl = document.getElementById('ctRecipient');
  const topicEl     = document.getElementById('ctTopic');
  const bodyEl      = document.getElementById('ctBody');
  const btn         = document.getElementById('ctBtn');
  const successEl   = document.getElementById('ctSuccess');

  // التحقق من الحقول
  let valid = true;
  [nameEl, recipientEl, topicEl, bodyEl].forEach(el => {
    if (!el.value.trim()) { el.style.borderColor='#c0392b'; valid=false; }
    else el.style.borderColor='';
  });
  if (!valid) return;

  const subject  = recipientEl.value;
  const bodyText = `[${topicEl.value}]\n${bodyEl.value.trim()}`;

  btn.disabled = true;
  btn.innerHTML = '<i class="ti ti-loader ti-spin"></i> جارٍ الإرسال...';

  try {
    // جلب أول مستخدم بـ role/subject مطابق
    const { getDocs, query, where, collection: col } = await import('https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js');
    const user = auth.currentUser;
    if (!user) { alert('يجب تسجيل الدخول أولاً'); btn.disabled=false; btn.innerHTML='<i class="ti ti-send"></i> إرسال الرسالة'; return; }

    let recipientUid = null;
    if (subject === 'admin') {
      const snap = await getDocs(query(col(db,'users'), where('role','==','admin')));
      if (!snap.empty) recipientUid = snap.docs[0].id;
    } else {
      const snap = await getDocs(query(col(db,'users'), where('role','==','teacher'), where('subject','==',subject)));
      if (!snap.empty) recipientUid = snap.docs[0].id;
    }

    if (!recipientUid) throw new Error('لم يتم إيجاد المستلم في قاعدة البيانات');

    // إنشاء أو تحديث المحادثة
    const cid = [user.uid, recipientUid].sort().join('__');
    await setDoc(doc(db,'conversations',cid), {
      participants: [user.uid, recipientUid],
      lastMsg: bodyText.slice(0,60),
      lastAt: serverTimestamp(),
      [`unread.${recipientUid}`]: 1,
      [`unread.${user.uid}`]: 0,
    }, { merge: true });

    // إضافة الرسالة
    const senderSnap = await getDoc(doc(db,'users',user.uid));
    const senderName = senderSnap.exists() ? senderSnap.data().name : (nameEl.value.trim());
    await addDoc(collection(db,'conversations',cid,'messages'), {
      text: bodyText,
      senderId:   user.uid,
      senderName: senderName,
      senderRole: senderSnap.exists() ? senderSnap.data().role : 'student',
      sentAt: serverTimestamp(),
    });

    // نجاح
    btn.innerHTML = '<i class="ti ti-check"></i> تم الإرسال بنجاح!';
    btn.style.background = 'var(--green-mid)';
    if (successEl) successEl.style.display = 'block';
    [nameEl, recipientEl, topicEl, bodyEl].forEach(el => el.value='');
    setTimeout(() => {
      btn.disabled=false; btn.innerHTML='<i class="ti ti-send"></i> إرسال الرسالة';
      btn.style.background=''; if (successEl) successEl.style.display='none';
    }, 3500);

  } catch(e) {
    console.error(e);
    btn.disabled=false;
    btn.innerHTML='<i class="ti ti-send"></i> إرسال الرسالة';
    alert('حدث خطأ أثناء الإرسال: ' + e.message);
  }
};
