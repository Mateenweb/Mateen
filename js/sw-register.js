// ── تسجيل Service Worker ──────────────────────────────────────────────────
let deferredInstallPrompt = null;

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/Mateen/firebase-messaging-sw.js', {
    scope: '/Mateen/'
  }).then(reg => {
    console.log('[SW] registered:', reg.scope);
  }).catch(err => {
    console.warn('[SW] registration failed:', err);
  });
}

// ── اعتراض حدث التثبيت ──────────────────────────────────────────────────
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  // أظهر زرار التثبيت فوراً
  const installBtn = document.getElementById('installAppBtn');
  if (installBtn) installBtn.style.display = 'flex';
  showInstallBanner();
});

// أظهر الزرار فوراً بدون انتظار Chrome
window.addEventListener('load', () => {
  // لو مش مثبّت بالفعل
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone;
  if (!isStandalone) {
    setTimeout(() => {
      const installBtn = document.getElementById('installAppBtn');
      if (installBtn) installBtn.style.display = 'flex';
    }, 1000);
  }
});

function showInstallBanner() {
  if (document.getElementById('installBanner')) return;

  const banner = document.createElement('div');
  banner.id = 'installBanner';
  banner.innerHTML = `
    <div style="
      position:fixed; bottom:20px; left:50%; transform:translateX(-50%);
      background:linear-gradient(135deg,#2c1a0e,#5c3d2e);
      color:#e8c96a; border:1px solid #c9a227; border-radius:16px;
      padding:14px 20px; display:flex; align-items:center; gap:12px;
      box-shadow:0 8px 30px rgba(0,0,0,0.35); z-index:9999;
      font-family:'Noto Naskh Arabic',serif; font-size:14px;
      max-width:90vw; direction:rtl;
    ">
      <img src="/Mateen/logo.png" style="width:36px;height:36px;border-radius:50%;border:1px solid #c9a227;">
      <span>أضيفي متين لشاشتك الرئيسية</span>
      <button onclick="installApp()" style="
        background:#c9a227; color:#2c1a0e; border:none; border-radius:10px;
        padding:7px 16px; font-family:inherit; font-weight:700; cursor:pointer; font-size:13px;
      ">تثبيت</button>
      <button onclick="document.getElementById('installBanner').remove()" style="
        background:none; border:none; color:rgba(255,255,255,0.5); cursor:pointer; font-size:18px; padding:0 4px;
      ">✕</button>
    </div>
  `;
  document.body.appendChild(banner);

  // اختفي تلقائياً بعد 12 ثانية
  setTimeout(() => banner.remove(), 12000);
}

window.installApp = async () => {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  const { outcome } = await deferredInstallPrompt.userChoice;
  console.log('[PWA] install outcome:', outcome);
  deferredInstallPrompt = null;
  const banner = document.getElementById('installBanner');
  if (banner) banner.remove();
};

// ── طلب إذن الإشعارات ────────────────────────────────────────────────────
window.addEventListener('load', () => {
  // انتظر 5 ثواني بعد التحميل
  setTimeout(async () => {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'granted') return;
    if (Notification.permission === 'denied') return;

    // تحقق من Firebase Auth
    try {
      const { getAuth } = await import("https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js");
      const auth = getAuth();
      const user = auth.currentUser;
      if (!user) return;
    } catch(e) { return; }

    showNotifBanner();
  }, 5000);
});

function showNotifBanner() {
  if (document.getElementById('notifBanner')) return;
  if (document.getElementById('installBanner')) return; // لا تعرض الاثنين معاً

  const banner = document.createElement('div');
  banner.id = 'notifBanner';
  banner.innerHTML = `
    <div style="
      position:fixed; bottom:20px; left:50%; transform:translateX(-50%);
      background:linear-gradient(135deg,#2c1a0e,#5c3d2e);
      color:#e8c96a; border:1px solid #c9a227; border-radius:16px;
      padding:14px 20px; display:flex; align-items:center; gap:12px;
      box-shadow:0 8px 30px rgba(0,0,0,0.35); z-index:9999;
      font-family:'Noto Naskh Arabic',serif; font-size:14px;
      max-width:90vw; direction:rtl;
    ">
      <span style="font-size:22px">🔔</span>
      <span>فعّلي الإشعارات لتصلك آخر الأخبار</span>
      <button onclick="requestNotifPermission()" style="
        background:#c9a227; color:#2c1a0e; border:none; border-radius:10px;
        padding:7px 16px; font-family:inherit; font-weight:700; cursor:pointer; font-size:13px;
      ">تفعيل</button>
      <button onclick="document.getElementById('notifBanner').remove()" style="
        background:none; border:none; color:rgba(255,255,255,0.5); cursor:pointer; font-size:18px; padding:0 4px;
      ">✕</button>
    </div>
  `;
  document.body.appendChild(banner);
  setTimeout(() => banner.remove(), 12000);
}

window.requestNotifPermission = async () => {
  const banner = document.getElementById('notifBanner');
  if (banner) banner.remove();
  const perm = await Notification.requestPermission();
  console.log('[Notif] permission:', perm);
};

// ── بعد التثبيت ──────────────────────────────────────────────────────────
window.addEventListener('appinstalled', () => {
  console.log('[PWA] installed successfully');
  deferredInstallPrompt = null;
});
