// nav.js — loads Navigation bar across all pages

function renderNav(activePage) {
  const links = [
    { href: 'home.html',    label: 'الرئيسية' },
    { href: 'about.html',   label: 'عن البرنامج' },
    { href: 'courses.html', label: 'المسارات العلمية' },
    { href: 'library.html', label: 'المكتبة' },
    { href: 'news.html',    label: 'الأخبار' },
    { href: '#contact',     label: 'تواصل معنا' },
  ];

  // Check if user is logged in via Firebase localStorage key
  const isLoggedIn = _navIsLoggedIn();

  const navHTML = `
<nav>
  <a href="home.html" class="nav-logo" style="text-decoration:none">
    <img src="../logo.png" alt="متين" style="width:38px;height:38px;border-radius:50%;object-fit:cover;border:1.5px solid var(--gold);background:#fff;">
    <div>
      <div class="nav-brand">برنامج متين العلمي</div>
      <div class="nav-tagline">نحو بناء علميٍّ متين</div>
    </div>
  </a>
  <div class="nav-shuraka"><img src="../shuraka-logo.png" alt="شركاء الخير" class="nav-shuraka-img"/></div>
  <ul class="nav-links">
    ${links.map(l => `<li><a href="${l.href}"${activePage === l.href ? ' class="active"' : ''}>${l.label}</a></li>`).join('\n    ')}
  </ul>
  <div class="nav-btns"${isLoggedIn ? ' style="display:none"' : ''} id="navBtnsRendered">
    <a href="login.html" class="btn-admin"><i class="ti ti-dashboard"></i> لوحة الإدارة</a>
    <a href="login.html" class="btn-outline"><i class="ti ti-user"></i> تسجيل الدخول</a>
    <button class="btn-solid" onclick="document.getElementById('reg-modal')?.classList.add('open')">التسجيل في البرنامج</button>
  </div>
  <button onclick="typeof startPageTour==='function'&&startPageTour()" title="جولة تعريفية"
    id="navTourBtn"
    style="background:none;border:none;color:rgba(255,255,255,0.85);font-size:18px;cursor:pointer;padding:6px 8px;display:flex;align-items:center;flex-shrink:0;">❓</button>
  <button class="nav-toggle" aria-label="Open sidebar menu" onclick="document.querySelector('.nav-links').classList.toggle('open')">
    <i class="ti ti-menu-2"></i>
  </button>
</nav>`;

  const placeholder = document.getElementById('nav-placeholder');
  if (placeholder) {
    placeholder.outerHTML = navHTML;
  }
  // Hide tour button if page has no tour
  setTimeout(() => {
    const tourBtn = document.getElementById('navTourBtn');
    if (tourBtn && typeof startPageTour !== 'function') tourBtn.style.display = 'none';
  }, 300);
}

function _navIsLoggedIn() {
  // Firebase stores auth session in localStorage with key matching firebaseLocalStorage
  // Key pattern: "firebase:authUser:<API_KEY>:[DEFAULT]"
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('firebase:authUser:')) {
        const val = localStorage.getItem(key);
        if (val && val !== 'null') return true;
      }
    }
  } catch(e) {}
  return false;
}

// Auto-run if nav-placeholder exists and renderNav isn't called manually
document.addEventListener('DOMContentLoaded', function() {
  if (document.getElementById('nav-placeholder')) {
    const page = location.pathname.split('/').pop() || 'home.html';
    renderNav(page);
  }
});
