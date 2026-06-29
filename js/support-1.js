import { initializeApp }   from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut }
  from "https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js";
import { getFirestore, doc, getDoc, getDocs, collection,
         addDoc, serverTimestamp, query, orderBy }
  from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";
import { FIREBASE_CONFIG } from "./config.js";

const app  = initializeApp(FIREBASE_CONFIG);
const auth = getAuth(app);
const db   = getFirestore(app);

const ROLE_LABELS = {
  mateen: 'بنت متين', teacher: 'معلمة', supervisor: 'مشرفة',
  admin: 'إدارية', support: 'الدعم الفني', student: 'طالبة'
};
const ROLE_EMOJI = {
  mateen: '🧕', teacher: '📚', supervisor: '🎓',
  admin: '👑', support: '🛠️', student: '🌸'
};

let allUsers = [];
let currentFilter = 'all';
let selectedUser  = null;

// ── Auth Gate ──
onAuthStateChanged(auth, async user => {
  if (!user) { window.location.href = '../html/login.html'; return; }

  const snap = await getDoc(doc(db, 'users', user.uid));
  const role = snap.exists() ? snap.data().role : '';

  if (role !== 'support' && role !== 'admin') {
    window.location.href = '../html/home.html'; return;
  }

  const name = snap.exists() ? snap.data().name || user.email : user.email;
  const nameEl = document.getElementById('navUserName');
  if (nameEl) nameEl.textContent = name;

  document.getElementById('authGate').style.display = 'none';
  document.getElementById('mainContent').classList.remove('main-content-hidden');

  loadUsers();
});

// ── Load Users ──
async function loadUsers() {
  try {
    const snap = await getDocs(query(collection(db, 'users'), orderBy('createdAt', 'desc')));
    allUsers = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    updateStats();
    renderUsers();
  } catch(e) {
    console.error('خطأ في تحميل المستخدمين:', e);
  }
}

function updateStats() {
  document.getElementById('sTotal').textContent     = allUsers.length;
  document.getElementById('sActive').textContent    = allUsers.filter(u => u.status === 'active').length;
  document.getElementById('sPending').textContent   = allUsers.filter(u => u.status === 'pending').length;
  document.getElementById('sSuspended').textContent = allUsers.filter(u => u.status === 'suspended').length;
}

// ── Render ──
window.renderUsers = function() {
  const search = (document.getElementById('searchInput').value || '').trim().toLowerCase();
  let list = allUsers.filter(u => {
    const matchSearch = !search ||
      (u.name  || '').toLowerCase().includes(search) ||
      (u.email || '').toLowerCase().includes(search);

    let matchFilter = true;
    if (currentFilter === 'active')   matchFilter = u.status === 'active';
    else if (currentFilter === 'pending') matchFilter = u.status === 'pending';
    else if (['mateen','teacher','supervisor'].includes(currentFilter)) matchFilter = u.role === currentFilter;

    return matchSearch && matchFilter;
  });

  const grid = document.getElementById('usersGrid');
  if (!list.length) {
    grid.innerHTML = '<div class="empty-state"><i class="ti ti-mood-empty"></i> لا توجد نتائج</div>';
    return;
  }

  grid.innerHTML = list.map(u => {
    const statusClass = u.status === 'active' ? 'badge-status-active' :
                        u.status === 'pending' ? 'badge-status-pending' : 'badge-status-suspended';
    const statusLabel = u.status === 'active' ? 'نشطة' :
                        u.status === 'pending' ? 'معلقة' : 'موقوفة';
    return `
    <div class="user-card" onclick="openUser('${u.id}')">
      <div class="user-avatar">${ROLE_EMOJI[u.role] || '🌸'}</div>
      <div class="user-info">
        <div class="user-name">${u.name || '—'}</div>
        <div class="user-email">${u.email || '—'}</div>
        <div class="user-meta">
          <span class="badge-role">${ROLE_LABELS[u.role] || u.role || '—'}</span>
          <span class="badge-role ${statusClass}">${statusLabel}</span>
        </div>
      </div>
      <i class="ti ti-chevron-left" style="color:var(--text-mid);font-size:16px;"></i>
    </div>`;
  }).join('');
};

window.setFilter = function(filter, el) {
  currentFilter = filter;
  document.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
  el.classList.add('active');
  renderUsers();
};

// ── Modal ──
window.openUser = function(uid) {
  selectedUser = allUsers.find(u => u.id === uid);
  if (!selectedUser) return;

  document.getElementById('modalName').textContent = selectedUser.name || '—';
  document.getElementById('modalDetails').innerHTML = `
    <div class="detail-row"><span class="detail-label">البريد الإلكتروني</span><span class="detail-value">${selectedUser.email || '—'}</span></div>
    <div class="detail-row"><span class="detail-label">الدور</span><span class="detail-value">${ROLE_LABELS[selectedUser.role] || selectedUser.role || '—'}</span></div>
    <div class="detail-row"><span class="detail-label">الحالة</span><span class="detail-value">${selectedUser.status || '—'}</span></div>
    <div class="detail-row"><span class="detail-label">رقم الجوال</span><span class="detail-value">${selectedUser.phone || '—'}</span></div>
    ${selectedUser.subject ? `<div class="detail-row"><span class="detail-label">المادة</span><span class="detail-value">${selectedUser.subject}</span></div>` : ''}
  `;
  document.getElementById('msgText').value = '';
  document.getElementById('userModal').classList.add('show');
};

window.closeModal = function() {
  document.getElementById('userModal').classList.remove('show');
  selectedUser = null;
};

// ── Send Message ──
window.sendMessage = async function() {
  if (!selectedUser) return;
  const text = document.getElementById('msgText').value.trim();
  if (!text) { alert('اكتبي الرسالة أولاً'); return; }

  const btn = document.getElementById('sendBtn');
  btn.disabled = true;
  btn.innerHTML = '<i class="ti ti-loader ti-spin"></i> جارٍ الإرسال...';

  try {
    const user = auth.currentUser;
    const senderSnap = await getDoc(doc(db, 'users', user.uid));
    const senderName = senderSnap.exists() ? senderSnap.data().name || 'الدعم الفني' : 'الدعم الفني';

    await addDoc(collection(db, 'messages'), {
      senderId:     user.uid,
      senderName,
      senderRole:   'support',
      recipientId:  selectedUser.id,
      recipientName: selectedUser.name || '',
      text,
      createdAt:    serverTimestamp(),
      read:         false,
    });

    // إشعار للمستخدم
    await addDoc(collection(db, 'userNotifications', selectedUser.id, 'items'), {
      type:      'message',
      title:     '📩 رسالة من الدعم الفني',
      body:      text.length > 60 ? text.slice(0, 60) + '...' : text,
      url:       'messages.html',
      read:      false,
      createdAt: serverTimestamp(),
    });

    closeModal();
    alert('✅ تم إرسال الرسالة بنجاح');
  } catch(e) {
    console.error(e);
    alert('حدث خطأ، حاولي مجدداً');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="ti ti-send"></i> إرسال';
  }
};

// ── Logout ──
window.doLogout = () => signOut(auth).then(() => window.location.href = '../html/login.html');

// Close modal on overlay click
document.getElementById('userModal').addEventListener('click', function(e) {
  if (e.target === this) closeModal();
});
