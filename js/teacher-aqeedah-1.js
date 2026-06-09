

import { initializeApp }   from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js";
import { getFirestore, collection, addDoc, doc, getDoc, query, where, getDocs, onSnapshot, orderBy, updateDoc } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js";
import { FIREBASE_CONFIG } from "./config.js";

const app = initializeApp(FIREBASE_CONFIG);
const db  = getFirestore(app);
const auth = getAuth(app);

const TEACHER_ID = "aqeedah";
const SUBJECT_AR = "العقيدة";

// جلب اسم المعلمة من users collection
async function loadTeacherName() {
  try {
    const q = query(collection(db, 'users'),
      where('role', '==', 'teacher'),
      where('subject', '==', TEACHER_ID),
      where('status', '==', 'active')
    );
    const snap = await getDocs(q);
    if (!snap.empty) {
      const name = snap.docs[0].data().name || 'معلمة العقيدة';
      document.getElementById('teacherName').textContent = name;
      document.getElementById('breadcrumbName').textContent = name;
      document.getElementById('contactTitle').textContent = 'تواصلي مع ' + name;
    }
  } catch(e) {}
}

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
  const subject = snap.data().subject || '';
  if (role === 'teacher' && subject !== 'aqeedah') {
    window.location.href = 'home.html'; return;
  }
  loadTeacherName();
  // لو المعلمة نفسها — أظهر الـ inbox
  if (role === 'teacher' && snap.data().subject === 'aqeedah') {
    document.getElementById('inboxSection').style.display = 'block';
    loadInbox();
  }
});

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

  const teacherName = document.getElementById('teacherName').textContent;

  try {
    await addDoc(collection(db, 'teachers', TEACHER_ID, 'messages'), {
      name, phone, topic, body,
      teacherId:   TEACHER_ID,
      teacherName: teacherName,
      subject:     SUBJECT_AR,
      sentAt:      Date.now(),
      read:        false,
    });
    document.getElementById('successMsg').classList.add('show');
    ['msgName','msgPhone','msgBody'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('msgTopic').value = '';
    btn.innerHTML = '<i class="ti ti-send"></i> إرسال الرسالة';
    btn.disabled  = false;
  } catch(e) {
    errTx.textContent = 'حدث خطأ أثناء الإرسال، حاولي مجدداً';
    errEl.classList.add('show');
    btn.innerHTML = '<i class="ti ti-send"></i> إرسال الرسالة';
    btn.disabled  = false;
  }
};



/* ── Inbox ──────────────────────────────────── */
function loadInbox() {
  const q = query(
    collection(db, 'teachers', 'aqeedah', 'messages'),
    orderBy('sentAt', 'desc')
  );
  onSnapshot(q, snap => {
    const list = document.getElementById('inboxList');
    const badge = document.getElementById('inboxBadge');
    if (snap.empty) {
      list.innerHTML = '<div class="empty-state" style="padding:24px"><i class="ti ti-inbox"></i><span>لا توجد رسائل بعد</span></div>';
      badge.style.display = 'none';
      return;
    }
    const msgs = [];
    snap.forEach(d => msgs.push({ id: d.id, ...d.data() }));
    const unread = msgs.filter(m => !m.read).length;
    badge.textContent = unread;
    badge.style.display = unread ? 'inline-block' : 'none';

    list.innerHTML = msgs.map(m => {
      const date = m.sentAt ? new Date(m.sentAt).toLocaleDateString('ar-SA') : '—';
      return `
        <div class="inbox-row ${m.read ? '' : 'unread'}" onclick="openMsg('${m.id}', '${m.name}', '${m.topic}', \`${m.body}\`, '${m.phone || ''}', '${date}')">
          <div class="inbox-avatar">✉️</div>
          <div style="flex:1">
            <div class="inbox-name">${m.name || '—'}</div>
            <div class="inbox-preview">${m.topic || ''} — ${(m.body || '').slice(0,60)}...</div>
          </div>
          <div class="inbox-date">${date}</div>
          ${!m.read ? '<div class="inbox-dot"></div>' : ''}
        </div>
      `;
    }).join('');
  });
}

window.openMsg = async (id, name, topic, body, phone, date) => {
  await updateDoc(doc(db, 'teachers', 'aqeedah', 'messages', id), { read: true });
  const old = document.getElementById('msgModal');
  if (old) old.remove();
  const modal = document.createElement('div');
  modal.id = 'msgModal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px';
  modal.innerHTML = `
    <div style="background:#fff;border-radius:16px;padding:28px;max-width:500px;width:100%">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <h3 style="margin:0;font-family:Amiri,serif;font-size:18px">${name}</h3>
        <button onclick="document.getElementById('msgModal').remove()" style="background:none;border:none;font-size:20px;cursor:pointer;color:#888">✕</button>
      </div>
      <div style="font-size:12px;color:var(--text-mid);margin-bottom:12px">${date} ${phone ? '· ' + phone : ''}</div>
      <div style="background:var(--beige);border-radius:8px;padding:12px;font-size:13.5px;margin-bottom:16px"><strong>${topic}</strong></div>
      <div style="font-size:14px;line-height:2;color:var(--text-dark)">${body}</div>
    </div>
  `;
  document.body.appendChild(modal);
};
