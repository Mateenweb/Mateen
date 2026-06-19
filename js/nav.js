// nav.js — يحمّل شريط التنقل في جميع الصفحات

function renderNav(activePage) {
  const links = [
    { href: 'home.html',    label: 'الرئيسية' },
    { href: 'about.html',   label: 'عن البرنامج' },
    { href: 'courses.html', label: 'المسارات العلمية' },
    { href: 'library.html', label: 'المكتبة' },
    { href: 'news.html',    label: 'الأخبار' },
    { href: '#contact',     label: 'تواصل معنا' },
  ];

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
  <div class="nav-btns">
    <a href="login.html" class="btn-admin"><i class="ti ti-dashboard"></i> لوحة الإدارة</a>
    <a href="login.html" class="btn-outline"><i class="ti ti-user"></i> تسجيل الدخول</a>
    <button class="btn-solid">التسجيل في البرنامج</button>
  </div>
  <button class="nav-toggle" onclick="document.querySelector('.nav-links').classList.toggle('open')">
    <i class="ti ti-menu-2"></i>
  </button>
</nav>`;

  // Support both nav-placeholder div and direct injection at top of body
  const placeholder = document.getElementById('nav-placeholder');
  if (placeholder) {
    placeholder.outerHTML = navHTML;
  }
}

// Auto-run if nav-placeholder exists and renderNav isn't called manually
document.addEventListener('DOMContentLoaded', function() {
  if (document.getElementById('nav-placeholder')) {
    const page = location.pathname.split('/').pop() || 'home.html';
    renderNav(page);
  }
});
