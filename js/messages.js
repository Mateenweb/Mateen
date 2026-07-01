import { initializeApp } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js";
import { getFirestore, collection, doc, getDoc, getDocs, addDoc, deleteDoc, query, where, orderBy, onSnapshot, serverTimestamp, updateDoc, setDoc, deleteField } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js";
import { FIREBASE_CONFIG } from "./config.js";

const app  = initializeApp(FIREBASE_CONFIG);
const db   = getFirestore(app);
const auth = getAuth(app);

// ── Cloudinary upload instead of Firebase Storage ──
const CLOUD_NAME    = 'dqqtznoqt';
const UPLOAD_PRESET = 'mateen_uploads';

async function uploadMedia(blob, mediaType) {
  const fd = new FormData();
  fd.append('file', blob);
  fd.append('upload_preset', UPLOAD_PRESET);
  const resourceType = mediaType === 'audio' ? 'video' : 'image';
  const res  = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/${resourceType}/upload`,
    { method: 'POST', body: fd }
  );
  const data = await res.json();
  if (!data.secure_url) throw new Error(data.error?.message || 'فشل الرفع');
  return data.secure_url;
}

const ROLE_LABELS = {
  student:    'طالبة',
  mateen:     'طالبة متين',
  teacher:    'معلمة',
  supervisor: 'مشرفة',
  admin:      'إدارة',
  support:    'دعم فني'
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
// أدوار الرسائل:
// teacher/supervisor/admin/support → يراسلوا أي حد
// mateen → تراسل teacher/supervisor/admin/support فقط
// student → تراسل teacher/supervisor/admin فقط
function canMessageRole(myRole, theirRole) {
  const allStaff = ['teacher', 'supervisor', 'admin', 'support'];
  if (allStaff.includes(myRole)) return true;
  if (myRole === 'mateen') return allStaff.includes(theirRole);
  if (myRole === 'student') return ['teacher', 'supervisor', 'admin'].includes(theirRole);
  return false;
}

let currentUser     = null;
let currentUserData = null;
let activeConvId    = null;
let msgUnsub        = null;
let convUnsub       = null;   // unsubscribe for the  conversations listener
let allUsers        = [];
let allConvs        = [];
// استرجع المحادثات المقروءة من sessionStorage
const _storedRead = sessionStorage.getItem('readConvIds');
const readConvIds = new Set(_storedRead ? JSON.parse(_storedRead) : []);
window._readConvIds = readConvIds;

function markConvRead(cid) {
  readConvIds.add(cid);
  sessionStorage.setItem('readConvIds', JSON.stringify([...readConvIds]));
}
let viewOnceMode    = false;

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
  if (myNameEl) myNameEl.textContent = data.name || '';

  // Show Buttons الImage  and the تسجيل — للكل ما عدا Student (f)
  const mediaButtons = document.getElementById('mediaButtons');
  if (mediaButtons) {
    mediaButtons.style.display = 'flex';
    // mateen و student يشوفوا صور وملفات بس — مش تسجيل صوتي
    const isBasic = ['student', 'mateen'].includes(data.role);
    const recordBtn = document.getElementById('recordBtn');
    const viewOnceBtn = document.getElementById('viewOnceBtn');
    if (isBasic) {
      if (recordBtn) recordBtn.style.display = 'none';
      if (viewOnceBtn) viewOnceBtn.style.display = 'none';
    }
  }
  if (convUnsub) { convUnsub(); convUnsub = null; }
  if (msgUnsub)  { msgUnsub();  msgUnsub  = null; }
  activeConvId = null;
  // لا تمسح allConvs So that تفضل Menu/List ظاهرة أثناء إعادة Loading

  loadConversations();
  loadAllUsers();

  // فتح Modal "Message جthisدة" If جاية from the هوم بـ ?compose=1
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
  // بدون orderBy So that not/don't محتاجين composite index في Firestore
  // الSort بيتعمل in the ـ client بعد ما Data ترجع
  const q = query(
    collection(db, 'conversations'),
    where('participants', 'array-contains', currentUser.uid)
  );

  convUnsub = onSnapshot(q, async snap => {
    if (snap.empty) {
      // If Menu/List فاضية but/only عندنا محادثات - ممكن لسه بيتحمّل
      if (allConvs.length === 0) {
        allConvs = [];
        renderConvList([]);
      }
      return;
    }

    // احتفظ بـ cache للأسماء عشان نتجنب طلبات متكررة
    const nameCache = {};
    allConvs.forEach(cv => { if (cv.otherId) nameCache[cv.otherId] = { name: cv.otherName, role: cv.otherRole }; });

    const promises = snap.docs.map(async d => {
      const data = d.data();
      if (data.hiddenBy?.[currentUser.uid] && d.id !== activeConvId) return null;
      const otherId = data.participants?.find(p => p !== currentUser.uid);
      if (!otherId) return null;

      // جيب الاسم من الـ cache أو من Firestore
      let otherName = nameCache[otherId]?.name || 'الإدارة';
      let otherRole = nameCache[otherId]?.role || '';

      if (!nameCache[otherId]) {
        try {
          const otherSnap = await getDoc(doc(db, 'users', otherId));
          if (otherSnap.exists()) {
            otherName = otherSnap.data().name || 'الإدارة';
            otherRole = otherSnap.data().role  || '';
            nameCache[otherId] = { name: otherName, role: otherRole };
          }
        } catch(e) {}
      }

      let conv = { id: d.id, ...data, otherId, otherName, otherRole };
      return conv;
    });

    const results = await Promise.all(promises);
    allConvs = results.filter(Boolean);

    // Sort from the أحدث للأقدم
    const uid = currentUser?.uid || '';
    allConvs.sort((a, b) => {
      const aUnread = a[`unread.${uid}`] ?? a.unread?.[uid] ?? 0;
      const bUnread = b[`unread.${uid}`] ?? b.unread?.[uid] ?? 0;
      if (bUnread > 0 && aUnread === 0) return 1;
      if (aUnread > 0 && bUnread === 0) return -1;
      return (b.lastAt?.seconds || 0) - (a.lastAt?.seconds || 0);
    });

    window._debug_convs = allConvs;
    console.log("[DEBUG] allConvs:", allConvs.map(cv => ({id:cv.id.slice(0,8), unread:cv.unread, flat:cv[`unread.${currentUser?.uid}`]})));
    renderConvList(allConvs);

    // لا تفتح محادثة أوتوماتيك - User يختار بsame style
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
    const uid = currentUser?.uid || '';
    const fv = c[`unread.${uid}`];
    const nv = c.unread?.[uid];
    // اخد الـ unread من Firestore مباشرة بدون تدخل readConvIds
    const unread = fv !== undefined ? Number(fv) : (nv !== undefined ? Number(nv) : 0);
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

  // Mark as read — صفّر الـ unread في Firestore مباشرة
  markConvRead(cid);
  // صفّر flat field والـ nested الاتنين
  const _convSnap2 = await getDoc(doc(db, 'conversations', cid)).catch(()=>null);
  const _nestedUnread = _convSnap2?.data()?.unread || {};
  _nestedUnread[currentUser.uid] = 0;
  await updateDoc(doc(db, 'conversations', cid), {
    [`unread.${currentUser.uid}`]: 0,
    unread: _nestedUnread,
  }).catch(() => {});

  // حدّث الـ local state فوراً
  const convInList = allConvs.find(cv => cv.id === cid);
  if (convInList) {
    convInList[`unread.${currentUser.uid}`] = 0;
    renderConvList(allConvs);
  }

  // علّم Messages الطرف الثاني كمقروءة (So that يعرف المرسل إن رسالته اتقرأت)
  const allMsgsSnap = await getDocs(collection(db, 'conversations', cid, 'messages'));
  const toMark = allMsgsSnap.docs.filter(d => d.data().senderId !== currentUser.uid && !d.data().read);
  await Promise.all(toMark.map(d => updateDoc(d.ref, { read: true })));

  // Listen to messages
  const q = query(collection(db, 'conversations', cid, 'messages'));

  // جيبي وقت الDelete من Firestore So that نفلتر الMessages القthisمة
  const convForDelete = await getDoc(doc(db, 'conversations', cid));
  const deletedAtSec  = convForDelete.exists()
    ? (convForDelete.data().deletedAt?.[currentUser.uid]?.seconds || 0)
    : 0;

  msgUnsub = onSnapshot(q, snap => {
    // Sort الMessages باIfقت in the ـ client
    const sorted = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(m => !m.deletedBy?.[currentUser.uid])          // اخفِ الMessages المحذوفة منك
      .filter(m => (m.sentAt?.seconds || 0) > deletedAtSec)  // اخفِ الMessages قبل وقت الDelete
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

      // تحقق من حالة القراءة: الMessage مقروءة If فيها read:true أو If المستلم فتح المحادثة
      const seen = !mine ? false : (m.read === true);

      return `${dayDivider}
        <div class="msg-row ${mine ? 'mine' : 'theirs'}" data-id="${m.id}">
          ${!mine ? avatarHtml(otherName, otherRole, 28) : ''}
          <div class="msg-bubble-wrap">
            ${!mine ? `<div class="msg-sender-name">${otherName}</div>` : ''}
            <div class="msg-bubble-outer">
              ${mine ? `
              <div class="msg-delete-wrap" style="position:relative;align-self:flex-end;">
                <button class="msg-delete-btn" title="خيارات الحذف" onclick="toggleDeleteMenu(event,'${m.id}')"><i class="ti ti-trash"></i></button>
                <div id="del-menu-${m.id}" style="display:none;position:absolute;${currentUserData?.role==='mateen'?'left':'right'}:0;bottom:28px;background:var(--white);border:1px solid var(--border);border-radius:10px;box-shadow:0 4px 16px rgba(0,0,0,0.12);z-index:100;min-width:160px;overflow:hidden;">
                  <button onclick="deleteMsgMine('${activeConvId}','${m.id}')" style="width:100%;padding:10px 14px;border:none;background:none;font-family:inherit;font-size:13px;cursor:pointer;text-align:right;display:flex;align-items:center;gap:8px;color:var(--text-dark)"><i class="ti ti-eye-off"></i> حذف من عندي فقط</button>
                  ${currentUserData?.role==='admin'||currentUserData?.role==='support'||currentUserData?.role==='teacher' ? `<button onclick="deleteMsgBoth('${activeConvId}','${m.id}')" style="width:100%;padding:10px 14px;border:none;background:none;font-family:inherit;font-size:13px;cursor:pointer;text-align:right;display:flex;align-items:center;gap:8px;color:#c0392b;border-top:1px solid var(--border)"><i class="ti ti-trash"></i> حذف من الاتنين</button>` : ''}
                </div>
              </div>` : ''}
              <div class="msg-bubble ${mine ? 'mine' : 'theirs'}" title="${fullTime}">
                ${m.type === 'image'
  ? (m.viewOnce && !mine && currentUserData?.role === 'mateen'
      ? (m.viewOnceViewedBy?.[currentUser?.uid]
          ? `<span class="view-once-done"><i class="ti ti-eye-off"></i> تمت المشاهدة</span>`
          : `<button class="view-once-btn" onclick="viewOnceOpen('${activeConvId}','${m.id}','${m.url}','image')"><i class="ti ti-eye"></i> اضغطي للمشاهدة مرة واحدة</button>`)
      : `<img class="msg-img" src="${m.url}" alt="صورة" onclick="window.open('${m.url}','_blank')">`)
  : m.type === 'audio'
  ? (m.viewOnce && !mine && currentUserData?.role === 'mateen'
      ? (m.viewOnceViewedBy?.[currentUser?.uid]
          ? `<span class="view-once-done"><i class="ti ti-eye-off"></i> تم الاستماع</span>`
          : `<button class="view-once-btn" onclick="viewOnceOpen('${activeConvId}','${m.id}','${m.url}','audio')"><i class="ti ti-player-play"></i> اضغطي للاستماع مرة واحدة</button>`)
      : `<audio controls controlsList="nodownload" src="${m.url}"></audio>`)
  : m.type === 'file'
  ? `<a href="${m.url}" download="${m.fileName || ''}" target="_blank" rel="noopener"
      style="display:flex;align-items:center;gap:8px;padding:6px 10px;background:rgba(255,255,255,0.15);border-radius:10px;text-decoration:none;color:inherit;max-width:220px">
      <i class="ti ti-file-download" style="font-size:20px;flex-shrink:0"></i>
      <div style="min-width:0">
        <div style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(m.fileName || m.text || 'ملف')}</div>
        <div style="font-size:11px;opacity:0.7">${m.fileSize || ''}</div>
      </div>
    </a>`
  : `<span class="msg-text">${escapeHtml(m.text || '')}</span>`}
                ${m.viewOnce && mine ? `<span class="view-once-tag"><i class="ti ti-flame"></i> مرة واحدة</span>` : ''}
                <span class="msg-time">${time}${mine ? ` <i class="ti ti-${seen ? 'checks' : 'check'}" style="color:${seen ? 'var(--gold,#c9a227)' : 'rgba(255,255,255,0.6)'};font-size:13px"></i>` : ''}</span>
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
    senderName: currentUserData?.role === 'admin' ? 'إدارة متين' : (currentUserData?.name || ''),
    senderRole: currentUserData?.role  || '',
    sentAt:     serverTimestamp(),
  });

  // اجلب unread الحالي من Firestore مباشرة So that نضfrom the دقة
  const convSnap = await getDoc(doc(db, 'conversations', activeConvId));
  const currentUnread = convSnap.exists()
    ? (convSnap.data()[`unread.${otherId}`] ?? convSnap.data().unread?.[otherId] ?? 0)
    : 0;

  await setDoc(doc(db, 'conversations', activeConvId), {
    participants: [currentUser.uid, otherId].filter(Boolean),
    lastMsg:      text || '',
    lastAt:       serverTimestamp(),
    lastSenderId: currentUser.uid,
    [`unread.${otherId}`]: currentUnread + 1,
    [`unread.${currentUser.uid}`]: 0,
    [`hiddenBy.${otherId}`]: false,
    [`hiddenBy.${currentUser.uid}`]: false,
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

  const roleOrder = ['admin', 'support', 'supervisor', 'teacher', 'mateen', 'student'];
  el.innerHTML = roleOrder
    .filter(r => groups[r])
    .map(r => `
      <div class="user-group-label">${ROLE_LABELS[r] || r}</div>
      ${groups[r].map(u => `
        <div class="user-result-item" onclick="startConv('${u.id}','${escapeAttr(u.name || 'مستخدم')}','${u.role}')">
          ${avatarHtml(u.name || 'مستخدم', u.role, 38)}
          <div>
            <div class="user-result-name">${u.role === 'admin' ? 'إدارة متين' : (u.name || 'مستخدم')}</div>
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
    [`hiddenBy.${currentUser.uid}`]: false,
    [`hiddenBy.${otherId}`]: false,
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

// ── Delete Message من عند User only ───────────────────────────
// ── Toggle delete menu ──────────────────────────────────────
window.toggleDeleteMenu = (e, msgId) => {
  e.stopPropagation();
  // أغلق كل القوائم الأخرى
  document.querySelectorAll('[id^="del-menu-"]').forEach(m => {
    if (m.id !== `del-menu-${msgId}`) m.style.display = 'none';
  });
  const menu = document.getElementById(`del-menu-${msgId}`);
  if (menu) menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
};

// أغلق القوائم لما تضغطي برا
document.addEventListener('click', () => {
  document.querySelectorAll('[id^="del-menu-"]').forEach(m => m.style.display = 'none');
});

// ── حذف من عندي فقط ────────────────────────────────────────
window.deleteMsgMine = async (convId, msgId) => {
  if (!confirm('ستختفي هذه الرسالة منك فقط. هل تريدين المتابعة؟')) return;
  await updateDoc(doc(db, 'conversations', convId, 'messages', msgId), {
    [`deletedBy.${currentUser.uid}`]: true
  });
};

// ── حذف من الاتنين (أدمن/سوبرفايزر/سابورت) ───────────────
window.deleteMsgBoth = async (convId, msgId) => {
  if (!confirm('ستُحذف هذه الرسالة نهائياً من عند الاتنين. هل تريدين المتابعة؟')) return;
  // حدّث lastMsg لو كانت آخر رسالة
  try {
    const msgsSnap = await getDocs(
      query(collection(db, 'conversations', convId, 'messages'), orderBy('sentAt', 'desc'))
    );
    const msgs = msgsSnap.docs.filter(d => d.id !== msgId);
    if (msgs.length > 0) {
      const prev = msgs[0].data();
      await updateDoc(doc(db, 'conversations', convId), {
        lastMsg: prev.type === 'image' ? '📷 صورة' : prev.type === 'audio' ? '🎤 صوتية' : (prev.text || ''),
        lastAt: prev.sentAt,
      });
    }
  } catch(e) {}
  await deleteDoc(doc(db, 'conversations', convId, 'messages', msgId));
};


// ── Delete المحادثة من عند User only ────────────────────────
window.unhideConv = async (cid) => {
  await updateDoc(doc(db, 'conversations', cid), {
    [`hiddenBy.${currentUser.uid}`]: false
  });
};

window.deleteConv = async (cid) => {
  if (!confirm('هل تريدين حذف هذه المحادثة؟\nستختفي منك فقط والطرف الآخر لن يتأثر.')) return;

  await updateDoc(doc(db, 'conversations', cid), {
    [`hiddenBy.${currentUser.uid}`]: true,
    [`deletedAt.${currentUser.uid}`]: serverTimestamp(),
  });

  allConvs = allConvs.filter(c => c.id !== cid);
  renderConvList(allConvs);

  if (activeConvId === cid) {
    if (msgUnsub) { msgUnsub(); msgUnsub = null; }
    activeConvId = null;
    document.getElementById('msgConv').style.display  = 'none';
    document.getElementById('msgEmpty').style.display = 'flex';
  }
};


// ── Send/Submit Image ───────────────────────────────────────────────────────────

// ── View Once Open ─────────────────────────────────────────────────────────
window.viewOnceOpen = async (convId, msgId, url, type) => {
  // افتح الميthisا
  if (type === 'image') {
    window.open(url, '_blank');
  } else {
    // شغل الصوت في modal مؤقت
    const a = document.createElement('audio');
    a.src = url; a.controls = true; a.autoplay = true;
    a.controlsList = 'nodownload';
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:9999;flex-direction:column;gap:12px;';
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✕ إغلاق';
    closeBtn.style.cssText = 'background:white;border:none;padding:8px 20px;border-radius:8px;cursor:pointer;font-family:inherit;';
    closeBtn.onclick = () => { a.pause(); document.body.removeChild(overlay); };
    overlay.appendChild(a);
    overlay.appendChild(closeBtn);
    document.body.appendChild(overlay);
  }

  // اDelete الMessage من عند Student (f) بعد ثانية
  setTimeout(async () => {
    try {
      const { deleteDoc, doc: fsDoc } = await import('https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js');
      // not/don't بنDelete الMessage كلها، بنحط viewOnceViewed So that تختفي but/only من عند Student (f)
      const { updateDoc } = await import('https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js');
      await updateDoc(fsDoc(db, 'conversations', convId, 'messages', msgId), {
        [`viewOnceViewedBy.${currentUser.uid}`]: true
      });
    } catch(e) { console.error(e); }
  }, 1000);
};

// ── View Once ─────────────────────────────────────────────────────────────
window.toggleViewOnce = () => {
  viewOnceMode = !viewOnceMode;
  const btn = document.getElementById('viewOnceBtn');
  if (btn) {
    btn.style.opacity = viewOnceMode ? '1' : '0.5';
    btn.style.color   = viewOnceMode ? 'var(--gold)' : '';
    btn.title = viewOnceMode ? 'مرة واحدة (مفعّل)' : 'مرة واحدة';
  }
};

window.sendImage = async (input) => {
  const file = input.files[0];
  if (!file || !activeConvId) return;
  input.value = '';

  const url  = await uploadMedia(file, 'image');

  const otherId = allConvs.find(c => c.id === activeConvId)?.otherId;
  await addDoc(collection(db, 'conversations', activeConvId, 'messages'), {
    type: 'image', url, text: '📷 صورة',
    senderId: currentUser.uid,
    senderName: currentUserData?.role === 'admin' ? 'إدارة متين' : (currentUserData?.name || ''),
    senderRole: currentUserData?.role || '',
    sentAt: serverTimestamp(),
    viewOnce: viewOnceMode,
  });
  if (viewOnceMode) { viewOnceMode = false; const b = document.getElementById('viewOnceBtn'); if(b){b.style.opacity='0.5';b.style.color='';} }
  const convSnap = await getDoc(doc(db, 'conversations', activeConvId));
  const currentUnread = convSnap.exists() ? (convSnap.data()[`unread.${otherId}`] ?? convSnap.data().unread?.[otherId] ?? 0) : 0;
  await setDoc(doc(db, 'conversations', activeConvId), {
    participants: [currentUser.uid, otherId].filter(Boolean),
    lastMsg: '📷 صورة', lastAt: serverTimestamp(), lastSenderId: currentUser.uid,
    [`unread.${otherId}`]: currentUnread + 1,
    [`unread.${currentUser.uid}`]: 0,
    [`hiddenBy.${otherId}`]: false,
  }, { merge: true });
};

// ── تسجيل صوتي ───────────────────────────────────────────────────────────
let mediaRecorder = null;
let audioChunks   = [];
let recordInterval = null;
let recordSeconds  = 0;

// ── إرسال ملف (PDF, Word, Excel, PPT...) ──────────────────────────────────────
window.sendFile = async (input) => {
  const file = input.files[0];
  if (!file || !activeConvId) return;
  input.value = '';

  // تحقق من حجم الملف (max 10MB)
  if (file.size > 10 * 1024 * 1024) {
    alert('حجم الملف كبير جداً — الحد الأقصى 10 ميجا');
    return;
  }

  // رفع الملف على Cloudinary — كل الأنواع على /upload عادي
  const fd = new FormData();
  fd.append('file', file);
  fd.append('upload_preset', UPLOAD_PRESET);
  fd.append('resource_type', 'auto');
  const endpoint = 'auto';
  let data;
  try {
    const res = await fetch(
      `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/${endpoint}/upload`,
      { method: 'POST', body: fd }
    );
    data = await res.json();
  } catch(e) {
    alert('فشل رفع الملف — تحقق من اتصالك بالإنترنت');
    return;
  }
  if (!data.secure_url) { alert('فشل رفع الملف: ' + (data.error?.message || 'خطأ غير معروف')); return; }

  const url      = data.secure_url;
  const fileName = file.name;
  const fileSize = (file.size / 1024).toFixed(1) + ' KB';

  const otherId = allConvs.find(cv => cv.id === activeConvId)?.otherId;
  await addDoc(collection(db, 'conversations', activeConvId, 'messages'), {
    type: 'file', url, text: `📎 ${fileName}`,
    fileName, fileSize,
    senderId:   currentUser.uid,
    senderName: currentUserData?.role === 'admin' ? 'إدارة متين' : (currentUserData?.name || ''),
    senderRole: currentUserData?.role || '',
    sentAt:     serverTimestamp(),
  });

  // تحديث lastMsg + unread
  if (otherId) {
    await setDoc(doc(db, 'conversations', activeConvId), {
      lastMsg: `📎 ${fileName}`,
      lastAt:  serverTimestamp(),
      [`unread.${otherId}`]: (allConvs.find(cv=>cv.id===activeConvId)?.unread?.[otherId] ?? 0) + 1,
      [`unread.${currentUser.uid}`]: 0,
    }, { merge: true });
  }
};

window.toggleRecording = async () => {
  const btn = document.getElementById('recordBtn');
  const indicator = document.getElementById('recordingIndicator');
  const timerEl   = document.getElementById('recordTimer');

  if (mediaRecorder && mediaRecorder.state === 'recording') {
    // إيقاف التسجيل
    mediaRecorder.stop();
    btn.classList.remove('recording');
    btn.innerHTML = '<i class="ti ti-microphone"></i>';
    indicator.style.display = 'none';
    clearInterval(recordInterval);
    recordSeconds = 0;
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioChunks = [];
    mediaRecorder = new MediaRecorder(stream);

    mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
    mediaRecorder.onstop = async () => {
      stream.getTracks().forEach(t => t.stop());
      if (!activeConvId || audioChunks.length === 0) return;

      const blob = new Blob(audioChunks, { type: 'audio/webm' });
      const url  = await uploadMedia(blob, 'audio');

      const otherId = allConvs.find(c => c.id === activeConvId)?.otherId;
      await addDoc(collection(db, 'conversations', activeConvId, 'messages'), {
        type: 'audio', url, text: '🎙️ رسالة صوتية',
        senderId: currentUser.uid,
        senderName: currentUserData?.role === 'admin' ? 'إدارة متين' : (currentUserData?.name || ''),
        senderRole: currentUserData?.role || '',
        sentAt: serverTimestamp(),
        viewOnce: viewOnceMode,
      });
      if (viewOnceMode) { viewOnceMode = false; const b = document.getElementById('viewOnceBtn'); if(b){b.style.opacity='0.5';b.style.color='';} }
      const convSnap = await getDoc(doc(db, 'conversations', activeConvId));
      const currentUnread = convSnap.exists() ? (convSnap.data()[`unread.${otherId}`] ?? convSnap.data().unread?.[otherId] ?? 0) : 0;
      await setDoc(doc(db, 'conversations', activeConvId), {
        participants: [currentUser.uid, otherId].filter(Boolean),
        lastMsg: '🎙️ رسالة صوتية', lastAt: serverTimestamp(), lastSenderId: currentUser.uid,
        [`unread.${otherId}`]: currentUnread + 1,
        [`unread.${currentUser.uid}`]: 0,
        [`hiddenBy.${otherId}`]: false,
      }, { merge: true });
    };

    mediaRecorder.start();
    btn.classList.add('recording');
    btn.innerHTML = '<i class="ti ti-player-stop"></i>';
    indicator.style.display = 'flex';

    // مؤقت
    recordSeconds = 0;
    recordInterval = setInterval(() => {
      recordSeconds++;
      const m = Math.floor(recordSeconds / 60);
      const s = recordSeconds % 60;
      timerEl.textContent = `${m}:${s.toString().padStart(2,'0')}`;
      if (recordSeconds >= 120) window.toggleRecording(); // حد أقصى دقيقتان
    }, 1000);

  } catch(e) {
    alert('لم يتم السماح بالوصول للميكروفون');
  }
};

