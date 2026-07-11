import { initializeApp, getApps, getApp }   from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut }
  from "https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js";
import { getFirestore, doc, getDoc, getDocs, collection,
         addDoc, serverTimestamp, query, orderBy, updateDoc }
  from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";
import { FIREBASE_CONFIG } from "./config.js";
import { effectiveRole, mountTestModeSwitcher } from "./test-mode.js";
import { applyCustomTheme, THEME_PRESETS } from "./custom-theme.js";

const app  = getApps().length ? getApp() : initializeApp(FIREBASE_CONFIG);
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
let currentViewerEmail = '';

// ── Auth Gate ──
onAuthStateChanged(auth, async user => {
  if (!user) { window.location.href = '../html/login.html'; return; }

  const snap = await getDoc(doc(db, 'users', user.uid));
  const userData = snap.exists() ? snap.data() : {};
  const role = effectiveRole(userData, user.email);
  currentViewerEmail = (user.email || '').toLowerCase();

  if (role !== 'support' && role !== 'admin') {
    window.location.href = '../html/home.html'; return;
  }
  mountTestModeSwitcher(userData, user.email);
  applyCustomTheme(userData);

  const name = userData.name || user.email;
  const nameEl = document.getElementById('navUserName');
  if (nameEl) nameEl.textContent = name;

  document.getElementById('authGate').style.display = 'none';
  document.getElementById('mainContent').classList.remove('main-content-hidden');

  loadUsers();
});

// ── Load Users ──
async function loadUsers() {
  try {
    const snap = await getDocs(collection(db, 'users'));
    allUsers = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    // الترتيب هنا بدل الاستعلام عشان أي حساب مالوش createdAt يفضل ظاهر
    allUsers.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
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

  const themeBtn = document.getElementById('themeBtnInModal');
  if (themeBtn) themeBtn.style.display = (currentViewerEmail === 'ra7matest@gmail.com') ? 'inline-block' : 'none';

  document.getElementById('userModal').classList.add('show');
};

// ── الثيم المخصص ──
window.openThemeModalForSelected = function() {
  if (!selectedUser) return;
  document.getElementById('customThemeModal')?.remove();
  const t = selectedUser.customTheme || {};
  const modal = document.createElement('div');
  modal.id = 'customThemeModal';
  modal.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:100000;display:flex;align-items:center;justify-content:center;`;
  modal.innerHTML = `
    <div style="background:#fff;border-radius:14px;padding:22px;min-width:300px;max-width:90vw;max-height:85vh;overflow-y:auto;direction:rtl">
      <h3 style="margin:0 0 14px;font-size:16px">🎨 ثيم مخصص لـ ${selectedUser.name || selectedUser.email}</h3>

      <label style="display:block;margin-bottom:14px;font-size:13px">
        ثيم جاهز (اختيار سريع)<br>
        <select id="themePreset" onchange="applyPresetToModal(this.value)" style="width:100%;padding:8px;border-radius:8px;border:1px solid #ddd;margin-top:4px;font-size:13px">
          <option value="">— اختاري ثيم أو عدّلي يدويًا تحت —</option>
          ${THEME_PRESETS.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}
        </select>
      </label>

      <label style="display:block;margin-bottom:10px;font-size:13px">
        اللون الغامق (أساسي)<br>
        <input type="color" id="themeGreenDark" value="${t.greenDark || '#5c3d2e'}" style="width:100%;height:36px;border:none;cursor:pointer">
      </label>
      <label style="display:block;margin-bottom:10px;font-size:13px">
        اللون الذهبي (التمييز)<br>
        <input type="color" id="themeGold" value="${t.gold || '#c9a227'}" style="width:100%;height:36px;border:none;cursor:pointer">
      </label>
      <label style="display:block;margin-bottom:10px;font-size:13px">
        لون الخلفية (البيج)<br>
        <input type="color" id="themeBeige" value="${t.beige || '#f7efe3'}" style="width:100%;height:36px;border:none;cursor:pointer">
      </label>
      <label style="display:block;margin-bottom:16px;font-size:13px">
        شكل زخرفي في الخلفية<br>
        <select id="themePattern" style="width:100%;padding:8px;border-radius:8px;border:1px solid #ddd;margin-top:4px;font-size:13px">
          <option value="none" ${(!t.pattern || t.pattern === 'none') ? 'selected' : ''}>بدون</option>
          <option value="stars" ${t.pattern === 'stars' ? 'selected' : ''}>⭐ نجوم</option>
          <option value="geometric" ${t.pattern === 'geometric' ? 'selected' : ''}>🔷 هندسي</option>
          <option value="circles" ${t.pattern === 'circles' ? 'selected' : ''}>⚪ دوائر</option>
        </select>
      </label>

      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button onclick="resetCustomTheme()" style="padding:8px 14px;font-size:13px;background:#fff0f0;color:#c0392b;border:1px solid #f5c6c6;border-radius:8px;cursor:pointer">استرجاع الافتراضي</button>
        <button onclick="document.getElementById('customThemeModal').remove()" style="padding:8px 14px;font-size:13px;background:#f0f0f0;border:1px solid #ddd;border-radius:8px;cursor:pointer">إلغاء</button>
        <button onclick="saveCustomTheme()" style="padding:8px 14px;font-size:13px;background:var(--green-dark,#5c3d2e);color:#fff;border:none;border-radius:8px;cursor:pointer">حفظ</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
};

window.applyPresetToModal = function(presetId) {
  const p = THEME_PRESETS.find(x => x.id === presetId);
  if (!p) return;
  document.getElementById('themeGreenDark').value = p.greenDark;
  document.getElementById('themeGold').value = p.gold;
  document.getElementById('themeBeige').value = p.beige;
  document.getElementById('themePattern').value = p.pattern;
};

window.saveCustomTheme = async function() {
  if (!selectedUser) return;
  const customTheme = {
    greenDark: document.getElementById('themeGreenDark').value,
    gold: document.getElementById('themeGold').value,
    beige: document.getElementById('themeBeige').value,
    pattern: document.getElementById('themePattern').value,
  };
  await updateDoc(doc(db, 'users', selectedUser.id), { customTheme });
  selectedUser.customTheme = customTheme;
  document.getElementById('customThemeModal')?.remove();
  alert('✅ اتحفظ الثيم — هيظهر للحساب أول ما يسجل دخول تاني');
};

window.resetCustomTheme = async function() {
  if (!selectedUser) return;
  await updateDoc(doc(db, 'users', selectedUser.id), { customTheme: {} });
  selectedUser.customTheme = {};
  document.getElementById('customThemeModal')?.remove();
  alert('تم استرجاع الألوان الافتراضية');
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
