// ══════════════════════════════════════════════════════════════
// وضع "الاختبار الشامل" — حساب دعم محدد بالإيميل (مكتوب في الكود
// مباشرة، مش زرار ظاهر في لوحة الأدمن) يقدر يتنقل بين كل الأدوار
// (أدمن/معلمة/مشرفة/طالبة) وينفذ حاجات حقيقية في كل دور، من غير
// ما يعمل logout/login.
// ══════════════════════════════════════════════════════════════

// الحسابات المسموح لها بوضع الاختبار — الإضافة هنا في الكود بس،
// مفيش أي واجهة أو زرار في لوحة الأدمن يفعّلها أو يوريها لحد.
const TEST_MODE_EMAILS = [
  'ra7matest@gmail.com',
];

const TEST_MODE_ROLES = ['admin', 'teacher', 'supervisor', 'mateen'];

const ROLE_HOME = {
  admin:      '../html/admin.html',
  teacher:    '../html/teacher-tafseer.html',
  supervisor: '../html/supervisor.html',
  mateen:     '../html/home.html'
};

const ROLE_LABELS = {
  admin:      '👑 أدمن',
  teacher:    '📗 معلمة',
  supervisor: '🕊️ مشرفة',
  mateen:     '🧕 بنت متين'
};

function isTestAccount(email) {
  return !!email && TEST_MODE_EMAILS.includes(email.toLowerCase());
}

// الدور الفعلي اللي المفروض تتعامل بيه الصفحة — بيرجع الدور الحقيقي
// إلا لو الإيميل من ضمن حسابات الاختبار ومختار دور تاني من القائمة
export function effectiveRole(userData, email) {
  const realRole = (userData && userData.role) || '';
  if (!isTestAccount(email)) return realRole;
  const override = localStorage.getItem('mateenTestRole');
  if (override && TEST_MODE_ROLES.includes(override)) return override;
  return realRole;
}

// بتركّب أداة صغيرة ثابتة في زاوية الشاشة لاختيار الدور — بتظهر بس
// لحسابات الاختبار المحددة بالإيميل في الكود فوق
export function mountTestModeSwitcher(userData, email) {
  if (!isTestAccount(email)) return;
  if (document.getElementById('testModeSwitcher')) return;

  const current = effectiveRole(userData, email);
  const box = document.createElement('div');
  box.id = 'testModeSwitcher';
  // !important عشان محدش يقدر يكسر الـ fixed حتى لو حاجة تانية في الصفحة
  // (زي القائمة الجانبية وقت ما بتتفتح) بتعمل transform على عنصر أعلى منها
  box.setAttribute('style', `
    position:fixed !important; bottom:16px !important; left:16px !important;
    z-index:2147483647 !important;
    background:#1a1a1a; color:#fff; border-radius:12px; padding:10px 14px;
    box-shadow:0 4px 16px rgba(0,0,0,0.35); font-family:inherit; font-size:13px;
    display:flex; align-items:center; gap:8px; direction:rtl;
  `);
  box.innerHTML = `
    <span style="opacity:0.75">🧪 اختبار كـ:</span>
    <select id="testModeSelect" style="background:#2a2a2a;color:#fff;border:1px solid #444;border-radius:6px;padding:4px 8px;font-family:inherit;font-size:13px;cursor:pointer">
      ${TEST_MODE_ROLES.map(r => `<option value="${r}" ${r === current ? 'selected' : ''}>${ROLE_LABELS[r] || r}</option>`).join('')}
    </select>
  `;
  // بتتلزّق مباشرة في <html> مش في <body>، عشان لو الـ body نفسه بيتعمله
  // transform (زي وقت فتح القائمة الجانبية) الأداة تفضل ملزّقة صح في الشاشة
  document.documentElement.appendChild(box);

  document.getElementById('testModeSelect').addEventListener('change', (e) => {
    const chosen = e.target.value;
    localStorage.setItem('mateenTestRole', chosen);
    window.location.href = ROLE_HOME[chosen] || '../html/home.html';
  });
}
