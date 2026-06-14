import { initializeApp } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js";
import { getFirestore, collection, doc, getDoc, getDocs, addDoc, deleteDoc, query, where, orderBy, onSnapshot, serverTimestamp, updateDoc, setDoc } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";
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
let convUnsub       = null;   // unsubscribe للـ conversations listener
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

  // إلغاء أي listeners قديمة قبل إعادة التشغيل (مهم عند الريفريش)
  if (convUnsub) { convUnsub(); convUnsub = null; }
  if (msgUnsub)  { msgUnsub();  msgUnsub  = null; }
  activeConvId = null;

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
    const ud = d.data();
    if (d.id !== currentUser.uid && (ud.status === 'active' || ud.role === 'admin')) {
      allUsers.push({ id: d.id, ...ud });
    }
  });
}

// ── Load conversations ─────────────────────────────────────────────────────
function loadConversations() {
  // بدون orderBy عشان مش محتاجين composite index في Firestore
  // الترتيب بيتعمل في الـ client بعد ما البيانات ترجع
  const q = query(
    collection(db, 'conversations'),
    where('participants', 'array-contains', currentUser.uid)
  );

  convUnsub = onSnapshot(q, async snap => {
    allConvs = [];

    if (snap.empty) {
      renderConvList([]);
      return;
    }

    const promises = snap.docs.map(async d => {
      const data = d.data();

      // تجاهل المحادثات المخفية — إلا لو كانت هي المحادثة المفتوحة حالياً
      if (data.hiddenBy?.[currentUser.uid] && d.id !== activeConvId) return;

      const otherId = data.participants?.find(p => p !== currentUser.uid);
      if (!otherId) return;

      let otherName = 'مستخدم';
      let otherRole = '';
      try {
        const otherSnap = await getDoc(doc(db, 'users', otherId));
        if (otherSnap.exists()) {
          otherName = otherSnap.data().name || 'مستخدم';
          otherRole = otherSnap.data().role  || '';
        }
      } catch(e) { /* مش قادر يجيب بيانات المستخدم — نكمل */ }

      allConvs.push({ id: d.id, ...data, otherId, otherName, otherRole });
    });

    await Promise.all(promises);

    // ترتيب من الأحدث للأقدم في الـ client
    allConvs.sort((a, b) => (b.lastAt?.seconds || 0) - (a.lastAt?.seconds || 0));

    renderConvList(allConvs);

    // افتح أحدث محادثة تلقائياً لو مفيش محادثة مفتوحة
    if (!activeConvId && allConvs.length > 0) {
      const first = allConvs[0];
      openConv(first.id, first.otherId, first.otherName, first.otherRole);
    }
  }, err => {
    console.error('conversations query error:', err);
    document.getElementById('convList').innerHTML = `
      <div class="empty-state">
        <i class="ti ti-wifi-off"></i>
        <p>تعذر تحميل المحادثات</p>
        <p style="font-size:11px;opacity:0.6">${err.message}</p>
      </div>`;
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
        <div class="conv-avatar-wrap">
          ${avatarHtml(c.otherName, c.otherRole, 44)}
        </div>
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
        <button class="conv-delete-btn" title="حذف المحادثة"
          onclick="event.stopPropagation(); deleteConv('${c.id}')">
          <i class="ti ti-trash"></i>
        </button>
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

  // علّم رسائل الطرف الثاني كمقروءة (عشان يعرف المرسل إن رسالته اتقرأت)
  const allMsgsSnap = await getDocs(collection(db, 'conversations', cid, 'messages'));
  const toMark = allMsgsSnap.docs.filter(d => d.data().senderId !== currentUser.uid && !d.data().read);
  await Promise.all(toMark.map(d => updateDoc(d.ref, { read: true })));

  // Listen to messages
  const q = query(collection(db, 'conversations', cid, 'messages'));
  msgUnsub = onSnapshot(q, snap => {
    // ترتيب الرسائل بالوقت في الـ client
    const sorted = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(m => !m.deletedBy?.[currentUser.uid])   // اخفِ الرسائل المحذوفة منك
      .sort((a, b) => (a.sentAt?.seconds || 0) - (b.sentAt?.seconds || 0));
    const bubbles = document.getElementById('msgBubbles');

    // بيانات المحادثة الحالية (للتحقق من unread)
    const convData = allConvs.find(c => c.id === cid);

    // Group by day
    let lastDay = '';
    bubbles.innerHTML = sorted.map(m => {
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

      // تحقق من حالة القراءة: الرسالة مقروءة لو فيها read:true أو لو المستلم فتح المحادثة
      const seen = !mine ? false : (m.read === true);

      return `${dayDivider}
        <div class="msg-row ${mine ? 'mine' : 'theirs'}" data-id="${m.id}">
          ${!mine ? avatarHtml(otherName, otherRole, 28) : ''}
          <div class="msg-bubble-wrap">
            ${!mine ? `<div class="msg-sender-name">${otherName}</div>` : ''}
            <div class="msg-bubble-outer">
              ${mine ? `<button class="msg-delete-btn ${seen ? 'seen' : ''}" title="${seen ? 'لا يمكن الحذف — تمت القراءة' : 'حذف الرسالة'}" onclick="deleteMsg('${activeConvId}','${m.id}',${seen})"><i class="ti ti-trash"></i></button>` : ''}
              <div class="msg-bubble ${mine ? 'mine' : 'theirs'}" title="${fullTime}">
                <span class="msg-text">${escapeHtml(m.text)}</span>
                <span class="msg-time">${time}${mine ? ` <i class="ti ti-${seen ? 'checks' : 'check'}" style="color:${seen ? '#4fc3f7' : '#aaa'}"></i>` : ''}</span>
              </div>
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
    senderName: currentUserData?.name  || currentUser.email || '',
    senderRole: currentUserData?.role  || '',
    sentAt:     serverTimestamp(),
  });

  // اجلب unread الحالي من Firestore مباشرة عشان نضمن الدقة
  const convSnap = await getDoc(doc(db, 'conversations', activeConvId));
  const currentUnread = convSnap.exists()
    ? (convSnap.data().unread?.[otherId] || 0)
    : 0;

  await setDoc(doc(db, 'conversations', activeConvId), {
    participants: [currentUser.uid, otherId].filter(Boolean),
    lastMsg:  text || '',
    lastAt:   serverTimestamp(),
    [`unread.${otherId}`]: currentUnread + 1,
    [`unread.${currentUser.uid}`]: 0,
    // لو أي طرف كان حاذف المحادثة، ترجع تظهر عند إرسال رسالة جديدة
    [`hiddenBy.${currentUser.uid}`]: false,
    [`hiddenBy.${otherId}`]: false,
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
        <div class="user-result-item" onclick="startConv('${u.id}','${escapeAttr(u.name || u.email || 'مستخدم')}','${u.role}')">
          ${avatarHtml(u.name || u.email || 'مستخدم', u.role, 38)}
          <div>
            <div class="user-result-name">${u.name || u.email || 'مستخدم'}</div>
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

// ── حذف رسالة ──────────────────────────────────────────────
window.deleteMsg = async (convId, msgId, seen) => {
  if (seen) {
    alert('لا يمكن حذف هذه الرسالة — تمت قراءتها بالفعل');
    return;
  }
  if (!confirm('هل تريدين حذف هذه الرسالة؟')) return;

  // حذف ناعم — الرسالة تختفي منك فقط والطرف الثاني لا يتأثر
  await updateDoc(doc(db, 'conversations', convId, 'messages', msgId), {
    [`deletedBy.${currentUser.uid}`]: true
  });
};


// ── حذف المحادثة من عند المستخدم فقط ────────────────────────
window.unhideConv = async (cid) => {
  await updateDoc(doc(db, 'conversations', cid), {
    [`hiddenBy.${currentUser.uid}`]: false
  });
};

window.deleteConv = async (cid) => {
  if (!confirm('هل تريدين حذف هذه المحادثة من قائمتك؟\nستختفي منك فقط والطرف الآخر لن يتأثر.')) return;

  await updateDoc(doc(db, 'conversations', cid), {
    [`hiddenBy.${currentUser.uid}`]: true
  });

  // أزلها فوراً من الـ allConvs وأعد الرسم
  allConvs = allConvs.filter(c => c.id !== cid);
  renderConvList(allConvs);

  // لو الشات المفتوح هو اللي اتحذف — أغلقه
  if (activeConvId === cid) {
    activeConvId = null;
    document.getElementById('msgConv').style.display = 'none';
    document.getElementById('msgEmpty').style.display = 'flex';
  }
};

