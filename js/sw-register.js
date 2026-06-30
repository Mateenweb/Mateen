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

// أظهر الزرار فوراً لو الموقع مش مثبّت بالفعل (بدون انتظار beforeinstallprompt)
window.addEventListener('load', () => {
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone;
  if (!isStandalone) {
    const installBtn = document.getElementById('installAppBtn');
    if (installBtn) installBtn.style.display = 'flex';
    if (!localStorage.getItem('installBannerDismissed')) {
      setTimeout(showInstallBanner, 4000);
    }
  }
});

function showInstallBanner() {
  if (document.getElementById('installBanner')) return;

  const banner = document.createElement('div');
  banner.id = 'installBanner';
  banner.innerHTML = `
    <div style="
      position:fixed; top:80px; right:16px; left:auto; transform:none;
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

// ── طلب إذن الNotificationات ────────────────────────────────────────────────────
window.addEventListener('load', () => {
  // انتظر 5 ثواني بعد Loading
  setTimeout(async () => {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'granted') return;
    if (Notification.permission === 'denied') return;

    // only If User مسجّل دخول (وجود firebase auth)
    const isLoggedIn = document.cookie.includes('loggedIn') ||
      localStorage.getItem('mateenUser');
    if (!isLoggedIn) return;

    showNotifBanner();
  }, 5000);
});

function showNotifBanner() {
  if (document.getElementById('notifBanner')) return;
  if (document.getElementById('installBanner')) return; // لا تWidth/Display الاثنين معاً

  const banner = document.createElement('div');
  banner.id = 'notifBanner';
  banner.innerHTML = `
    <div style="
      position:fixed; top:80px; right:16px; left:auto; transform:none;
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

// ── بانر iOS (Safari) ────────────────────────────────────────────────────
window.addEventListener('load', () => {
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isSafari = /safari/i.test(navigator.userAgent) && !/chrome/i.test(navigator.userAgent);
  const isStandalone = window.navigator.standalone === true;
  const dismissed = localStorage.getItem('iosBannerDismissed');
  const visitCount = parseInt(localStorage.getItem('visitCount') || '0') + 1;
  localStorage.setItem('visitCount', visitCount);

  // اWidth/Display البانر from the زيارة الثانية فصاعداً If not/don't مضافة وIf ما اتعملش dismiss
  if (!isIOS || !isSafari || isStandalone || dismissed) return;
  if (visitCount < 2) return;

  setTimeout(() => showIOSBanner(), 3000);
});

function showIOSBanner() {
  if (document.getElementById('iosBanner')) return;

  const banner = document.createElement('div');
  banner.id = 'iosBanner';
  banner.innerHTML = `
    <div style="
      position:fixed; bottom:0; left:0; right:0;
      background:linear-gradient(135deg,#2c1a0e,#5c3d2e);
      color:#e8c96a; border-top:2px solid #c9a227;
      padding:16px 20px 24px;
      box-shadow:0 -6px 30px rgba(0,0,0,0.4); z-index:9999;
      font-family:'Noto Naskh Arabic',serif; direction:rtl;
    ">
      <button onclick="document.getElementById('iosBanner').remove();localStorage.setItem('iosBannerDismissed','1')" style="
        position:absolute; top:10px; left:14px;
        background:none; border:none; color:rgba(255,255,255,0.5);
        cursor:pointer; font-size:20px; line-height:1;
      ">✕</button>

      <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
        <img src="/Mateen/logo.png" style="width:40px;height:40px;border-radius:50%;border:1.5px solid #c9a227;">
        <div>
          <div style="font-weight:700;font-size:15px;">أضيفي متين لشاشتك الرئيسية</div>
          <div style="font-size:12px;color:rgba(255,255,255,0.6);margin-top:2px;">للوصول السريع في أي وقت</div>
        </div>
      </div>

      <div style="display:flex;flex-direction:column;gap:8px;">
        <div style="display:flex;align-items:center;gap:10px;background:rgba(255,255,255,0.07);border-radius:10px;padding:10px 12px;">
          <span style="font-size:22px;">⬆️</span>
          <span style="font-size:13px;">اضغطي على زر <b style="color:#c9a227;">المشاركة</b> في أسفل Safari</span>
        </div>
        <div style="display:flex;align-items:center;gap:10px;background:rgba(255,255,255,0.07);border-radius:10px;padding:10px 12px;">
          <span style="font-size:22px;">➕</span>
          <span style="font-size:13px;">اختاري <b style="color:#c9a227;">"أضف إلى الشاشة الرئيسية"</b></span>
        </div>
        <div style="display:flex;align-items:center;gap:10px;background:rgba(255,255,255,0.07);border-radius:10px;padding:10px 12px;">
          <span style="font-size:22px;">✅</span>
          <span style="font-size:13px;">اضغطي <b style="color:#c9a227;">"إضافة"</b> وتم!</span>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(banner);
}
