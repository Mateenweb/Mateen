import { initializeApp } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js";
import { getFirestore, collection, doc, getDoc, getDocs, addDoc, query, where, orderBy, onSnapshot, serverTimestamp, updateDoc, setDoc } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js";
import { FIREBASE_CONFIG } from "./config.js";

const app  = initializeApp(FIREBASE_CONFIG);
const db   = getFirestore(app);
const auth = getAuth(app);

const ROLE_LABELS  = { student: 'طالبة', mateen: 'طالبة متين', teacher: 'معلمة', supervisor: 'مشرفة', admin: 'أدمن' };
const ROLE_AVATARS = { student: '👧', mateen: '🌸', teacher: '👩‍🏫', supervisor: '👩‍💼', admin: '🛡️' };

let currentUser     = null;
let currentUserData = null;
let activeConvId    = null;
let msgUnsub        = null;
let allUsers        = [];
let allConvs        = [];

// ── Auth ──────────────────────────────────────
onAuthStateChanged(auth, async user => {
  if (!user) { window.location.href = 'login.html'; return; }

  const snap = await getDoc(doc(db, 'users', user.uid));
  if (!snap.exists()) { window.location.href = 'login.html'; return; }

  const data   = snap.data();
  if (data.status === 'pending' || data.status === 'suspended') {
    window.location.href = 'home.html'; return;
  }

  currentUser     = user;
  currentUserData = data;

  document.getElementById('authGate').style.display   = 'none';
  document.getElementById('mainContent').style.display = 'block';

  loadConversations();
  loadAllUsers();
});

window.doLogout = () => signOut(auth).then(() => window.location.href = 'login.html');

// ── Conv ID helper ────────────────────────────
function convId(uid1, uid2) {
  return [uid1, uid2].sort().join('__');
}

// ── Load all users (for new conv) ─────────────
async function loadAllUsers() {
  const snap = await getDocs(collection(db, 'users'));
  allUsers = [];
  snap.forEach(d => {
    if (d.id !== currentUser.uid && d.data().status === 'active') {
      allUsers.push({ id: d.id, ...d.data() });
    }
  });
}

// ── Load conversations ────────────────────────
function loadConversations() {
  const q = query(
    collection(db, 'conversations'),
    where('participants', 'array-contains', currentUser.uid),
    orderBy('lastAt', 'desc')
  );

  onSnapshot(q, async snap => {
    allConvs = [];
    const promises = snap.docs.map(async d => {
      const data  = d.data();
      const otherId = data.participants.find(p => p !== currentUser.uid);
      const otherSnap = await getDoc(doc(db, 'users', otherId));
      const other = otherSnap.exists() ? otherSnap.data() : {};
      allConvs.push({ id: d.id, ...data, otherId, otherName: other.name || otherId, otherRole: other.role || '' });
    });
    await Promise.all(promises);
    renderConvList(allConvs);
  });
}

function renderConvList(list) {
  const el = document.getElementById('convList');
  if (!list.length) {
    el.innerHTML = '<div class="empty-state">لا توجد محادثات بعد</div>';
    return;
  }
  el.innerHTML = list.map(c => {
    const avatar = ROLE_AVATARS[c.otherRole] || '👤';
    const role   = ROLE_LABELS[c.otherRole]  || '';
    const time   = c.lastAt?.seconds ? new Date(c.lastAt.seconds * 1000).toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' }) : '';
    const unread = c.unread?.[currentUser.uid] > 0;
    return `
      <div class="conv-item ${activeConvId === c.id ? 'active' : ''}" onclick="openConv('${c.id}','${c.otherId}','${c.otherName}','${c.otherRole}')">
        <div class="conv-avatar">${avatar}</div>
        <div style="flex:1;min-width:0">
          <div class="conv-name">${c.otherName}</div>
          <div class="conv-preview">${c.lastMsg || '...'}</div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">
          <div class="conv-time">${time}</div>
          ${unread ? `<div class="conv-unread">${c.unread[currentUser.uid]}</div>` : ''}
        </div>
      </div>
    `;
  }).join('');
}

window.filterConvs = () => {
  const q = document.getElementById('convSearch').value.trim().toLowerCase();
  renderConvList(q ? allConvs.filter(c => c.otherName.toLowerCase().includes(q)) : allConvs);
};

// ── Open conversation ─────────────────────────
window.openConv = async (cid, otherId, otherName, otherRole) => {
  activeConvId = cid;
  if (msgUnsub) msgUnsub();

  document.getElementById('msgEmpty').style.display  = 'none';
  document.getElementById('msgConv').style.display   = 'flex';
  document.getElementById('convAvatar').textContent  = ROLE_AVATARS[otherRole] || '👤';
  document.getElementById('convName').textContent    = otherName;
  document.getElementById('convRole').textContent    = ROLE_LABELS[otherRole] || '';

  // Mark as read
  await updateDoc(doc(db, 'conversations', cid), { [`unread.${currentUser.uid}`]: 0 });

  // Listen to messages
  const q = query(collection(db, 'conversations', cid, 'messages'), orderBy('sentAt'));
  msgUnsub = onSnapshot(q, snap => {
    const bubbles = document.getElementById('msgBubbles');
    bubbles.innerHTML = snap.docs.map(d => {
      const m    = d.data();
      const mine = m.senderId === currentUser.uid;
      const time = m.sentAt?.seconds ? new Date(m.sentAt.seconds * 1000).toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' }) : '';
      return `
        <div class="msg-bubble ${mine ? 'mine' : 'theirs'}">
          ${m.text}
          <div class="msg-bubble-time">${time}</div>
        </div>
      `;
    }).join('');
    bubbles.scrollTop = bubbles.scrollHeight;
  });

  renderConvList(allConvs);
};

// ── Send message ──────────────────────────────
window.sendMsg = async () => {
  const input = document.getElementById('msgInput');
  const text  = input.value.trim();
  if (!text || !activeConvId) return;

  input.value = '';

  const otherId = allConvs.find(c => c.id === activeConvId)?.otherId;

  await addDoc(collection(db, 'conversations', activeConvId, 'messages'), {
    text,
    senderId: currentUser.uid,
    senderName: currentUserData.name || currentUser.email,
    sentAt: serverTimestamp(),
  });

  await setDoc(doc(db, 'conversations', activeConvId), {
    participants: [currentUser.uid, otherId].filter(Boolean),
    lastMsg: text,
    lastAt: serverTimestamp(),
    [`unread.${otherId}`]: (allConvs.find(c => c.id === activeConvId)?.unread?.[otherId] || 0) + 1,
    [`unread.${currentUser.uid}`]: 0,
  }, { merge: true });
};

window.handleMsgKey = e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(); }
};

// ── New conversation ──────────────────────────
window.showNewConv = () => {
  document.getElementById('newConvModal').style.display = 'flex';
  document.getElementById('userSearch').value = '';
  document.getElementById('userResults').innerHTML = '';
};

window.searchUsers = () => {
  const q   = document.getElementById('userSearch').value.trim().toLowerCase();
  const el  = document.getElementById('userResults');
  const res = q ? allUsers.filter(u => (u.name || '').toLowerCase().includes(q) || (u.email || '').includes(q)) : allUsers;

  el.innerHTML = res.slice(0, 10).map(u => `
    <div class="user-result-item" onclick="startConv('${u.id}','${u.name || u.email}','${u.role}')">
      <div class="user-result-avatar">${ROLE_AVATARS[u.role] || '👤'}</div>
      <div>
        <div class="user-result-name">${u.name || u.email}</div>
        <div class="user-result-role">${ROLE_LABELS[u.role] || ''}</div>
      </div>
    </div>
  `).join('');
};

window.startConv = async (otherId, otherName, otherRole) => {
  document.getElementById('newConvModal').style.display = 'none';
  const cid = convId(currentUser.uid, otherId);

  // Create conv doc if not exists
  await setDoc(doc(db, 'conversations', cid), {
    participants: [currentUser.uid, otherId],
    lastMsg: '',
    lastAt: serverTimestamp(),
    [`unread.${currentUser.uid}`]: 0,
    [`unread.${otherId}`]: 0,
  }, { merge: true });

  openConv(cid, otherId, otherName, otherRole);
};
