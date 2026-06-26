// ── Tour System ────────────────────────────────────────────────────────────
window.MateenTour = {
  current: 0,
  steps: [],
  overlay: null,
  box: null,

  start(steps) {
    this.steps = steps;
    this.current = 0;
    this._createOverlay();
    this._show();
  },

  _createOverlay() {
    if (document.getElementById('tourOverlay')) return;
    const ov = document.createElement('div');
    ov.id = 'tourOverlay';
    ov.style.cssText = 'position:fixed;inset:0;z-index:99998;pointer-events:none;';
    ov.innerHTML = `
      <svg id="tourSvg" style="position:absolute;inset:0;width:100%;height:100%;" xmlns="http://www.w3.org/2000/svg">
        <defs><mask id="tourMask"><rect width="100%" height="100%" fill="white"/><rect id="tourHole" rx="8" fill="black"/></mask></defs>
        <rect width="100%" height="100%" fill="rgba(0,0,0,0.55)" mask="url(#tourMask)"/>
      </svg>
      <div id="tourBox" style="position:absolute;background:white;border-radius:16px;padding:20px;max-width:300px;width:90vw;box-shadow:0 8px 32px rgba(0,0,0,0.3);direction:rtl;font-family:inherit;z-index:99999;pointer-events:all;">
        <div id="tourTitle" style="font-family:Amiri,serif;font-size:18px;color:#2c1a0e;font-weight:700;margin-bottom:8px;"></div>
        <div id="tourDesc" style="font-size:13px;color:#6b4c2a;line-height:1.8;margin-bottom:16px;"></div>
        <div style="display:flex;gap:8px;align-items:center;justify-content:space-between;">
          <button id="tourPrev" style="background:rgba(92,61,46,0.1);border:1px solid rgba(92,61,46,0.2);color:#5c3d2e;border-radius:8px;padding:7px 14px;font-family:inherit;font-size:13px;cursor:pointer;">السابق</button>
          <span id="tourCount" style="font-size:12px;color:#9b8470;"></span>
          <button id="tourNext" style="background:linear-gradient(135deg,#2c1a0e,#5c3d2e);color:#e8c96a;border:none;border-radius:8px;padding:7px 14px;font-family:inherit;font-size:13px;cursor:pointer;font-weight:600;">التالي</button>
        </div>
        <button id="tourSkip" style="position:absolute;top:10px;left:12px;background:none;border:none;color:#aaa;font-size:12px;cursor:pointer;font-family:inherit;">✕ إنهاء</button>
      </div>`;
    document.body.appendChild(ov);
    this.overlay = ov;
    this.box = document.getElementById('tourBox');
    document.getElementById('tourNext').onclick = () => this.next();
    document.getElementById('tourPrev').onclick = () => this.prev();
    document.getElementById('tourSkip').onclick = () => this.end();
    ov.addEventListener('click', e => { if(e.target === ov) this.end(); });
  },

  _show() {
    const s = this.steps[this.current];
    const el = typeof s.el === 'string' ? document.querySelector(s.el) : s.el;
    
    document.getElementById('tourTitle').textContent = s.title;
    document.getElementById('tourDesc').textContent = s.desc;
    document.getElementById('tourCount').textContent = `${this.current+1} / ${this.steps.length}`;
    document.getElementById('tourPrev').style.display = this.current === 0 ? 'none' : '';
    document.getElementById('tourNext').textContent = this.current === this.steps.length-1 ? 'إنهاء ✅' : 'التالي →';

    if (el) {
      const r = el.getBoundingClientRect();
      // لو العنصر مخفي أو حجمه صفر — تخطاه بدون loop
      if (r.width === 0 && r.height === 0) {
        if (this.current < this.steps.length - 1) {
          this.current++;
          this._show();
        } else {
          this.end();
        }
        return;
      }
      el.scrollIntoView({ behavior:'smooth', block:'center' });
      setTimeout(() => this._highlight(el), 400);
    } else {
      this._clearHighlight();
    }
  },

  _highlight(el) {
    const r = el.getBoundingClientRect();
    const pad = 8;
    const hole = document.getElementById('tourHole');
    hole.setAttribute('x', r.left - pad);
    hole.setAttribute('y', r.top - pad);
    hole.setAttribute('width', r.width + pad*2);
    hole.setAttribute('height', r.height + pad*2);

    const box = this.box;
    const bh = box.offsetHeight || 180;
    const bw = box.offsetWidth  || 300;
    const spaceBelow = window.innerHeight - r.bottom - pad;
    const spaceAbove = r.top - pad;

    let top, left;
    if (spaceBelow > bh + 20) top = r.bottom + pad + 10;
    else if (spaceAbove > bh + 20) top = r.top - bh - pad - 10;
    else top = window.innerHeight/2 - bh/2;

    // احسب الـ center بعد الـ scroll
    const newR = el.getBoundingClientRect();
    left = Math.max(10, Math.min(window.innerWidth - bw - 10, newR.left + newR.width/2 - bw/2));
    box.style.top = top + 'px';
    box.style.left = left + 'px';
    box.style.right = 'auto';
  },

  _clearHighlight() {
    const hole = document.getElementById('tourHole');
    hole.setAttribute('x', 0); hole.setAttribute('y', 0);
    hole.setAttribute('width', 0); hole.setAttribute('height', 0);
    this.box.style.top = '50%';
    this.box.style.left = '50%';
    this.box.style.transform = 'translate(-50%,-50%)';
  },

  next() {
    if (this.current < this.steps.length-1) { this.current++; this._show(); }
    else this.end();
  },

  prev() {
    if (this.current > 0) { this.current--; this._show(); }
  },

  end() {
    document.getElementById('tourOverlay')?.remove();
  }
};

// ── Tour Steps لكل صفحة ────────────────────────────────────────────────────
window.TOUR_STEPS = {

  admin: [
    { el:'#mainContent .stat-card:first-child', title:'إحصائيات المواد', desc:'هنا تشوفي إجمالي المواد والمحتوى المضاف على المنصة' },
    { el:'#addBtn', title:'إضافة مادة', desc:'اضغطي هنا لإضافة محتوى جديد - محاضرة، فيديو، أو ملف' },
    { el:'#fUrl', title:'رابط المادة', desc:'الصقي رابط الملف من Google Drive أو أي مصدر آخر' },
    { el:'#fCourse', title:'المادة', desc:'اختاري المادة التي ينتمي لها المحتوى' },
    { el:'#fType', title:'نوع المحتوى', desc:'حددي نوع الملف: محاضرة، فيديو، PDF، أو غيرها' },
    { el:'#pendingSection', title:'الحسابات المعلقة', desc:'هنا تظهر الحسابات الجديدة التي تحتاج موافقتك للتفعيل' },
    { el:'#allUsersSection', title:'كل المستخدمين', desc:'اطلعي على جميع الحسابات وعدّليها أو أوقفيها' },
    { el:'#usersSearch', title:'البحث', desc:'ابحثي عن أي مستخدم بالاسم أو البريد الإلكتروني' },
    { el:'#usersFilterRole', title:'فلترة بالدور', desc:'فلتري المستخدمين حسب دورهم: طالبة، معلمة، مشرفة' },
    { el:'#studentsSection', title:'قاعدة بيانات الطالبات', desc:'سجلات الطالبات التفصيلية ومتابعة تقدمهن' },
  ],

  home: [
    { el:'nav', title:'شريط التنقل', desc:'من هنا تنتقلي بين أقسام الموقع بسهولة' },
    { el:'.hero', title:'الصفحة الرئيسية', desc:'ترحيب بكِ في برنامج متين العلمي' },
    { el:'.path-section', title:'المواد العلمية', desc:'اضغطي على أي مادة للاطلاع على محتواها' },
    { el:'.nav-msg-btn[href="messages.html"]', title:'رسائلي', desc:'من هنا تصلين لرسائلك مع المعلمات والإدارة' },
    { el:'a[href="news.html"]', title:'الأخبار', desc:'متابعة آخر أخبار وإعلانات البرنامج' },
  ],

  messages: [
    { el:'.compose-btn', title:'محادثة جديدة', desc:'اضغطي هنا لبدء محادثة جديدة مع معلمة أو الإدارة' },
    { el:'#convList', title:'قائمة المحادثات', desc:'هنا تظهر جميع محادثاتك - اضغطي على أي محادثة لفتحها' },
    { el:'#convSearch', title:'البحث', desc:'ابحثي في محادثاتك باسم الشخص' },
    { el:'.msg-input', title:'كتابة رسالة', desc:'اكتبي رسالتك هنا ثم اضغطي إرسال أو Enter' },
  ],

  news: [
    { el:'#newsList', title:'الأخبار', desc:'آخر الأخبار والإعلانات من برنامج متين' },
    { el:'#addNewsBtn', title:'إضافة خبر', desc:'اضغطي هنا لنشر خبر أو إعلان جديد' },
  ],

  courses: [
    { el:'.subjects-grid', title:'المواد العلمية', desc:'جميع المواد المتاحة في البرنامج' },
    { el:'.subject-card:first-child', title:'المادة', desc:'اضغطي على أي مادة لرؤية تفاصيلها ومحتواها' },
  ],

};

// تشغيل الـ tour بناءً على الصفحة الحالية
window.startPageTour = () => {
  const page = window.location.pathname.split('/').pop().replace('.html','');
  const steps = window.TOUR_STEPS[page] || window.TOUR_STEPS.home;
  if (steps) MateenTour.start(steps);
};

// صفحات المعلمات
const teacherSteps = [
  { el:'.teacher-hero', title:'صفحتك كمعلمة', desc:'هذه صفحتك الشخصية التي تراها الطالبات' },
  { el:'.teacher-name', title:'اسمك', desc:'اسمك كما يظهر للطالبات في صفحة المادة' },
  { el:'.breadcrumb', title:'التنقل', desc:'من هنا تعرفي موقعك في الموقع وترجعي للرئيسية' },
  { el:'.modal-topics-title', title:'المحاور الرئيسية', desc:'المحاور الأساسية لمادتك التي تراها الطالبات' },
  { el:'.btn-add-content', title:'إضافة محتوى', desc:'اضغطي هنا لإضافة محاضرة أو فيديو جديد لمادتك' },
];

['teacher-quran1','teacher-quran2','teacher-aqeedah','teacher-fiqh','teacher-hadeeth','teacher-tafseer'].forEach(p => {
  window.TOUR_STEPS[p] = teacherSteps;
});

window.TOUR_STEPS['student'] = [
  { el:'.profile-header', title:'ملفك الشخصي', desc:'معلوماتك الشخصية وصورتك ومستواك الدراسي' },
  { el:'.enrolled-subjects', title:'موادك المسجلة', desc:'المواد التي سجلتِ فيها في البرنامج' },
];
