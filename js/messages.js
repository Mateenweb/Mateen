import { initializeApp } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js";
import { getFirestore, collection, doc, getDoc, getDocs, addDoc, query, where, orderBy, onSnapshot, serverTimestamp, updateDoc, setDoc } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js";
import { FIREBASE_CONFIG } from "./config.js";

const app  = initializeApp(FIREBASE_CONFIG);
const db   = getFirestore(app);
const auth = getAuth(app);

const ROLE_LABELS = {
  student:    'طالبة',
  mateen:     'طالبة متين',
  teacher:    'معلمة',
  supervisor: 'مشرفة',
  admin:      'إدارة'
};

const ROLE_COLORS = {
  student:    '#2d6a4f',
  mateen:     '#40916c',
  teacher:    '#1b4332',
  supervisor: '#c9a227',
  admin:      '#6b2737'
};

const ROLE_INITIALS_BG = {
  student:    '#d8f3dc',
  mateen:     '#b7e4c7',
  teacher:    '#e9f5db',
  supervisor: '#fff3cd',
  admin:      '#f8d7da'
};

// ── Messaging permissions ──────────────────────────────────────────────────
// student/mateen → can message: teacher, supervisor, admin
// teacher/supervisor/admin → can message: anyone
function canMessageRole(myRole, theirRole) {
  const elevated = ['teacher', 'supervisor', 'admin'];
  if (elevated.includes(myRole)) return true;           // staff → anyone
  if (['student','mateen'].includes(myRole)) {
    return elevated.includes(theirRole);                // students → staff only
  }
  return false;
}

let currentUser     = null;
let currentUserData = null;
let activeConvId    = null;
let msgUnsub        = null;
let allUsers        = [];
let allConvs        = [];

// ── Auth ───────────────────────────────────────────────────────────────────
onAuthStateChanged(auth, async user => {
  if (!user) { window.location.href = '../html/login.html'; return; }

  const snap = await getDoc(doc(db, 'users', user.uid));
  if (!snap.exists()) { window.location.href = '../html/login.html'; return; }

  const data = snap.data();
  if (data.status === 'pending' || data.status === 'suspended') {
    window.location.href = '../html/home.html'; return;
  }

  currentUser     = user;
  currentUserData = data;

  document.getElementById('authGate').style.display   = 'none';
  document.getElementById('mainContent').style.display = 'block';

  // Show role badge in header
  const roleBadge = document.getElementById('myRoleBadge');
  if (roleBadge) {
    roleBadge.textContent = ROLE_LABELS[data.role] || data.role;
    roleBadge.style.background = ROLE_INITIALS_BG[data.role] || '#f0f0f0';
    roleBadge.style.color = ROLE_COLORS[data.role] || '#333';
  }
  const myNameEl = document.getElementById('myName');
  if (myNameEl) myNameEl.textContent = data.name || currentUser.email;

  loadConversations();
  loadAllUsers();

  // فتح مودال "رسالة جديدة" لو جاية من الهوم بـ ?compose=1
  const params = new URLSearchParams(window.location.search);
  if (params.get('compose') === '1') {
    setTimeout(() => window.showNewConv && window.showNewConv(), 600);
  }
});

window.doLogout = () => signOut(auth).then(() => window.location.href = '../html/login.html');

// ── Conv ID helper ─────────────────────────────────────────────────────────
function convId(uid1, uid2) { return [uid1, uid2].sort().join('__'); }

// ── Initials avatar ────────────────────────────────────────────────────────
function makeInitials(name, role) {
  if (!name) return '؟';
  const parts = name.trim().split(/\s+/);
  return parts.length >= 2
    ? parts[0][0] + parts[1][0]
    : parts[0].slice(0, 2);
}

function avatarHtml(name, role, size = 42) {
  const initials = makeInitials(name, role);
  const bg  = ROLE_INITIALS_BG[role] || '#e8e8e8';
  const col = ROLE_COLORS[role]      || '#555';
  return `<div class="conv-avatar" style="width:${size}px;height:${size}px;background:${bg};color:${col};font-size:${Math.round(size*0.35)}px">${initials}</div>`;
}

// ── Format timestamp ───────────────────────────────────────────────────────
function fmtTime(seconds) {
  if (!seconds) return '';
  const d = new Date(seconds * 1000);
  const now = new Date();
  const diffDays = Math.floor((now - d) / 86400000);
  if (diffDays === 0) return d.toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' });
  if (diffDays === 1) return 'أمس';
  if (diffDays < 7)  return d.toLocaleDateString('ar', { weekday: 'short' });
  return d.toLocaleDateString('ar', { day: 'numeric', month: 'short' });
}

function fmtFullTime(seconds) {
  if (!seconds) return '';
  return new Date(seconds * 1000).toLocaleString('ar', {
    hour: '2-digit', minute: '2-digit',
    day: 'numeric', month: 'short'
  });
}

// ── Load all users ─────────────────────────────────────────────────────────
async function loadAllUsers() {
  const snap = await getDocs(collection(db, 'users'));
  allUsers = [];
  snap.forEach(d => {
    if (d.id !== currentUser.uid && d.data().status === 'active') {
      allUsers.push({ id: d.id, ...d.data() });
    }
  });
}

// ── Load conversations ─────────────────────────────────────────────────────
function loadConversations() {
  const q = query(
    collection(db, 'conversations'),
    where('participants', 'array-contains', currentUser.uid),
    orderBy('lastAt', 'desc')
  );

  onSnapshot(q, async snap => {
    allConvs = [];
    const promises = snap.docs.map(async d => {
      const data    = d.data();
      const otherId = data.participants.find(p => p !== currentUser.uid);
      const otherSnap = await getDoc(doc(db, 'users', otherId));
      const other = otherSnap.exists() ? otherSnap.data() : {};
      allConvs.push({ id: d.id, ...data, otherId, otherName: other.name || otherId, otherRole: other.role || '' });
    });
    await Promise.all(promises);
    allConvs.sort((a, b) => (b.lastAt?.seconds || 0) - (a.lastAt?.seconds || 0));
    renderConvList(allConvs);
  });
}

function renderConvList(list) {
  const el = document.getElementById('convList');
  if (!list.length) {
    el.innerHTML = `
      <div class="empty-state">
        <i class="ti ti-message-off"></i>
        <p>لا توجد محادثات بعد</p>
      </div>`;
    return;
  }
  el.innerHTML = list.map(c => {
    const time   = fmtTime(c.lastAt?.seconds);
    const unread = c.unread?.[currentUser.uid] > 0 ? c.unread[currentUser.uid] : 0;
    const roleLabel = ROLE_LABELS[c.otherRole] || '';
    const isActive = activeConvId === c.id;

    // Truncate last message
    const preview = (c.lastMsg || '').length > 45
      ? c.lastMsg.slice(0, 45) + '…'
      : (c.lastMsg || 'ابدئي المحادثة');

    return `
      <div class="conv-item ${isActive ? 'active' : ''} ${unread ? 'unread' : ''}"
           onclick="openConv('${c.id}','${c.otherId}','${c.otherName}','${c.otherRole}')">
        ${avatarHtml(c.otherName, c.otherRole, 44)}
        <div class="conv-meta">
          <div class="conv-top-row">
            <span class="conv-name">${c.otherName}</span>
            <span class="conv-time">${time}</span>
          </div>
          <div class="conv-bottom-row">
            <span class="conv-preview">${preview}</span>
            ${unread ? `<span class="conv-unread">${unread > 9 ? '9+' : unread}</span>` : ''}
          </div>
          <span class="conv-role-pill" style="background:${ROLE_INITIALS_BG[c.otherRole]||'#eee'};color:${ROLE_COLORS[c.otherRole]||'#555'}">${roleLabel}</span>
        </div>
      </div>`;
  }).join('');
}

window.filterConvs = () => {
  const q = document.getElementById('convSearch').value.trim().toLowerCase();
  renderConvList(q ? allConvs.filter(c => c.otherName.toLowerCase().includes(q)) : allConvs);
};

// ── Open conversation ──────────────────────────────────────────────────────
window.openConv = async (cid, otherId, otherName, otherRole) => {
  activeConvId = cid;
  if (msgUnsub) msgUnsub();

  document.getElementById('msgEmpty').style.display = 'none';
  const convEl = document.getElementById('msgConv');
  convEl.style.display = 'flex';

  // Header
  document.getElementById('convHeaderAvatar').innerHTML = avatarHtml(otherName, otherRole, 38);
  document.getElementById('convName').textContent  = otherName;
  document.getElementById('convRole').textContent  = ROLE_LABELS[otherRole] || otherRole;
  document.getElementById('convRole').style.color  = ROLE_COLORS[otherRole] || 'var(--text-mid)';

  // Mark as read
  await updateDoc(doc(db, 'conversations', cid), { [`unread.${currentUser.uid}`]: 0 });

  // Listen to messages
  const q = query(collection(db, 'conversations', cid, 'messages'), orderBy('sentAt'));
  msgUnsub = onSnapshot(q, snap => {
    const bubbles = document.getElementById('msgBubbles');

    // Group by day
    let lastDay = '';
    bubbles.innerHTML = snap.docs.map(d => {
      const m    = d.data();
      const mine = m.senderId === currentUser.uid;
      const sec  = m.sentAt?.seconds;
      const time = sec ? new Date(sec * 1000).toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' }) : '';
      const fullTime = fmtFullTime(sec);

      const dayStr = sec ? new Date(sec * 1000).toLocaleDateString('ar', { weekday:'long', day:'numeric', month:'long' }) : '';
      let dayDivider = '';
      if (dayStr && dayStr !== lastDay) {
        lastDay = dayStr;
        dayDivider = `<div class="msg-day-divider"><span>${dayStr}</span></div>`;
      }

      return `${dayDivider}
        <div class="msg-row ${mine ? 'mine' : 'theirs'}">
          ${!mine ? avatarHtml(otherName, otherRole, 28) : ''}
          <div class="msg-bubble-wrap">
            ${!mine ? `<div class="msg-sender-name">${otherName}</div>` : ''}
            <div class="msg-bubble ${mine ? 'mine' : 'theirs'}" title="${fullTime}">
              <span class="msg-text">${escapeHtml(m.text)}</span>
              <span class="msg-time">${time}${mine ? ' <i class="ti ti-check"></i>' : ''}</span>
            </div>
          </div>
        </div>`;
    }).join('');

    bubbles.scrollTop = bubbles.scrollHeight;
  });

  renderConvList(allConvs);
};

// ── Send message ───────────────────────────────────────────────────────────
window.sendMsg = async () => {
  const input = document.getElementById('msgInput');
  const text  = input.value.trim();
  if (!text || !activeConvId) return;

  input.value = '';
  input.style.height = 'auto';

  const otherId = allConvs.find(c => c.id === activeConvId)?.otherId;

  await addDoc(collection(db, 'conversations', activeConvId, 'messages'), {
    text,
    senderId:   currentUser.uid,
    senderName: currentUserData.name || currentUser.email,
    senderRole: currentUserData.role || '',
    sentAt:     serverTimestamp(),
  });

  await setDoc(doc(db, 'conversations', activeConvId), {
    participants: [currentUser.uid, otherId].filter(Boolean),
    lastMsg:  text,
    lastAt:   serverTimestamp(),
    [`unread.${otherId}`]: (allConvs.find(c => c.id === activeConvId)?.unread?.[otherId] || 0) + 1,
    [`unread.${currentUser.uid}`]: 0,
  }, { merge: true });
};

window.handleMsgKey = e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(); }
};

// Auto-grow textarea
window.autoGrow = el => {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 120) + 'px';
};

// ── New conversation ───────────────────────────────────────────────────────
window.showNewConv = () => {
  document.getElementById('newConvModal').style.display = 'flex';
  document.getElementById('userSearch').value = '';
  searchUsers();
};

window.closeNewConv = () => {
  document.getElementById('newConvModal').style.display = 'none';
};

window.searchUsers = () => {
  const q   = document.getElementById('userSearch').value.trim().toLowerCase();
  const el  = document.getElementById('userResults');

  // Filter by permission AND search term
  const myRole = currentUserData?.role || '';
  const res = allUsers
    .filter(u => canMessageRole(myRole, u.role))
    .filter(u => !q || (u.name || '').toLowerCase().includes(q) || (u.email || '').includes(q));

  if (!res.length) {
    el.innerHTML = `<div class="empty-state" style="padding:20px"><i class="ti ti-user-off"></i><p>${q ? 'لا نتائج' : 'لا يوجد مستخدمون متاحون'}</p></div>`;
    return;
  }

  // Group by role
  const groups = {};
  res.forEach(u => {
    const r = u.role || 'other';
    if (!groups[r]) groups[r] = [];
    groups[r].push(u);
  });

  const roleOrder = ['admin', 'supervisor', 'teacher', 'mateen', 'student'];
  el.innerHTML = roleOrder
    .filter(r => groups[r])
    .map(r => `
      <div class="user-group-label">${ROLE_LABELS[r] || r}</div>
      ${groups[r].map(u => `
        <div class="user-result-item" onclick="startConv('${u.id}','${escapeAttr(u.name || u.email)}','${u.role}')">
          ${avatarHtml(u.name || u.email, u.role, 38)}
          <div>
            <div class="user-result-name">${u.name || u.email}</div>
            <div class="user-result-role" style="color:${ROLE_COLORS[u.role]||'#888'}">${ROLE_LABELS[u.role] || ''}</div>
          </div>
        </div>`).join('')}
    `).join('');
};

window.startConv = async (otherId, otherName, otherRole) => {
  closeNewConv();
  const cid = convId(currentUser.uid, otherId);
  await setDoc(doc(db, 'conversations', cid), {
    participants: [currentUser.uid, otherId],
    lastMsg: '',
    lastAt:  serverTimestamp(),
    [`unread.${currentUser.uid}`]: 0,
    [`unread.${otherId}`]: 0,
  }, { merge: true });
  openConv(cid, otherId, otherName, otherRole);
};

// ── Helpers ────────────────────────────────────────────────────────────────
function escapeHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;')
    .replace(/\n/g,'<br>');
}
function escapeAttr(str) {
  return String(str).replace(/'/g,"\\'").replace(/"/g,'\\"');
}

