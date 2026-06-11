
import { initializeApp, getApps, getApp }   from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js";
import { getFirestore, doc, getDoc, collection, addDoc } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";
import { FIREBASE_CONFIG } from "./config.js";

const app  = getApps().length ? getApp() : initializeApp(FIREBASE_CONFIG);
const auth = getAuth(app);
const db   = getFirestore(app);

// ── Sidebar auth state ────────────────────────
onAuthStateChanged(auth, async user => {
  const guest   = document.getElementById('sidebar-guest');
  const userDiv = document.getElementById('sidebar-user');
  if (!user) { guest.style.display='block'; userDiv.style.display='none'; return; }
  guest.style.display='none'; userDiv.style.display='block';
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

// ── Contact form with Firebase ────────────────
const RECIPIENTS = {
  admin:   'الإدارة العامة',
  tafseer: 'دكتورة عبير عقلان',
  fiqh:    'دكتورة أماني عقلان',
  aqeedah: 'أستاذة رشا حمدي',
  hadeeth: 'دكتورة حصة بنت عبدالعزيز',
  seera:   'معلمة السيرة النبوية',
  nahw:    'معلمة النحو والصرف',
  tajweed: 'معلمة التجويد',
  mutoon:  'معلمة المتون',
  quran1:  'أستاذة رميساء محمد',
  quran2:  'أستاذة أسماء محمد',
  tarbawi: 'معلمة البرامج التربوية',
};

window.submitContactNew = async () => {
  const name      = document.getElementById('ctName').value.trim();
  const phone     = document.getElementById('ctPhone').value.trim();
  const recipient = document.getElementById('ctRecipient').value;
  const topic     = document.getElementById('ctTopic').value;
  const body      = document.getElementById('ctBody').value.trim();
  if (!name || !recipient || !body) {
    alert('يرجى تعبئة الاسم والجهة المستقبِلة والرسالة');
    return;
  }
  const btn = document.getElementById('ctBtn');
  btn.disabled = true;
  btn.innerHTML = '<i class="ti ti-loader" style="animation:spin .8s linear infinite;display:inline-block"></i> جارٍ الإرسال...';
  try {
    const colPath = recipient === 'admin'
      ? collection(db, 'messages', 'admin', 'inbox')
      : collection(db, 'teachers', recipient, 'messages');
    await addDoc(colPath, {
      name, phone, topic, body,
      recipientId:   recipient,
      recipientName: RECIPIENTS[recipient] || recipient,
      sentAt: Date.now(), read: false,
    });
    document.getElementById('ctSuccess').style.display = 'block';
    ['ctName','ctPhone','ctBody'].forEach(id => document.getElementById(id).value='');
    document.getElementById('ctRecipient').value='';
    document.getElementById('ctTopic').value='';
    setTimeout(()=>document.getElementById('ctSuccess').style.display='none', 4000);
  } catch(e) { alert('حدث خطأ، حاولي مجدداً'); }
  btn.disabled = false;
  btn.innerHTML = '<i class="ti ti-send"></i> إرسال الرسالة';
};
