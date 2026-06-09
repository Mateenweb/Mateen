
import { initializeApp }   from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js";
import { getFirestore, collection, addDoc } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js";
import { FIREBASE_CONFIG } from "./config.js";

const app = initializeApp(FIREBASE_CONFIG);
const db  = getFirestore(app);
const auth = getAuth(app);
onAuthStateChanged(auth, async user => {
  if (!user) { window.location.href = 'login.html'; return; }
  const snap = await getDoc(doc(db, 'users', user.uid));
  const role   = snap.exists() ? snap.data().role   : '';
  const status = snap.exists() ? snap.data().status : '';
  if (role !== 'teacher' && role !== 'admin' && role !== 'supervisor') {
    window.location.href = 'home.html'; return;
  }
  if (status === 'pending' || status === 'suspended') {
    window.location.href = 'home.html'; return;
  }
  // المعلمة تشوف بس صفحتها
  if (role === 'teacher' && (snap.data().subject || '') !== 'mutoon') {
    window.location.href = 'home.html'; return;
  }
});

const TEACHER_ID = "mutoon";

window.sendMessage = async () => {
  const name  = document.getElementById('msgName').value.trim();
  const phone = document.getElementById('msgPhone').value.trim();
  const topic = document.getElementById('msgTopic').value;
  const body  = document.getElementById('msgBody').value.trim();

  const errEl = document.getElementById('errMsg');
  const errTx = document.getElementById('errText');
  errEl.classList.remove('show');

  if (!name)  { errTx.textContent = 'يرجى إدخال اسمك'; errEl.classList.add('show'); return; }
  if (!topic) { errTx.textContent = 'يرجى اختيار موضوع الرسالة'; errEl.classList.add('show'); return; }
  if (!body)  { errTx.textContent = 'يرجى كتابة الرسالة'; errEl.classList.add('show'); return; }

  const btn = document.getElementById('sendBtn');
  btn.disabled = true;
  btn.innerHTML = '<i class="ti ti-loader" style="animation:spin .8s linear infinite;display:inline-block"></i> جارٍ الإرسال...';

  try {
    await addDoc(collection(db, 'teachers', TEACHER_ID, 'messages'), {
      name, phone, topic, body,
      teacherId:   TEACHER_ID,
      teacherName: "معلمة المتون",
      subject:     "المتون العلمية",
      sentAt:      Date.now(),
      read:        false,
    });
    document.getElementById('successMsg').classList.add('show');
    document.getElementById('msgName').value  = '';
    document.getElementById('msgPhone').value = '';
    document.getElementById('msgTopic').value = '';
    document.getElementById('msgBody').value  = '';
    btn.innerHTML = '<i class="ti ti-send"></i> إرسال الرسالة';
    btn.disabled  = false;
  } catch(e) {
    errTx.textContent = 'حدث خطأ أثناء الإرسال، حاولي مجدداً';
    errEl.classList.add('show');
    btn.innerHTML = '<i class="ti ti-send"></i> إرسال الرسالة';
    btn.disabled  = false;
  }
};
