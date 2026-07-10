// ══════════════════════════════════════════════════════════════
// وضع "الاختبار الشامل" — يسمح لحساب دعم واحد (عليه testRoles في
// Firestore) إنه يتنقل بين كل الأدوار (أدمن/معلمة/مشرفة/طالبة)
// وينفذ حاجات حقيقية في كل دور، من غير ما يعمل logout/login.
// الحساب لازم يكون عليه role الأساسي + مصفوفة testRoles في users/{uid}.
// ══════════════════════════════════════════════════════════════

const ROLE_HOME = {
  admin:      '../html/admin.html',
  teacher:    '../html/teacher-tafseer.html',
  supervisor: '../html/supervisor.html',
  student:    '../html/student-general.html'
};

const ROLE_LABELS = {
  admin:      '👑 أدمن',
  teacher:    '📗 معلمة',
  supervisor: '🕊️ مشرفة',
  student:    '🎓 طالبة'
};

// الدور الفعلي اللي المفروض تتعامل بيه الصفحة — بيرجع الدور الحقيقي
// إلا لو الحساب مفعّل عليه وضع الاختبار ومختار دور تاني من القائمة
export function effectiveRole(userData) {
  const testRoles = (userData && userData.testRoles) || [];
  const override = localStorage.getItem('mateenTestRole');
  if (override && testRoles.includes(override)) return override;
  return (userData && userData.role) || '';
}

// بتركّب أداة صغيرة ثابتة في زاوية الشاشة لاختيار الدور — بتظهر بس
// للحسابات اللي معاها testRoles فيها أكتر من دور واحد
export function mountTestModeSwitcher(userData) {
  const testRoles = (userData && userData.testRoles) || [];
  if (testRoles.length < 2) return;
  if (document.getElementById('testModeSwitcher')) return;

  const current = effectiveRole(userData);
  const box = document.createElement('div');
  box.id = 'testModeSwitcher';
  box.style.cssText = `
    position:fixed; bottom:16px; left:16px; z-index:99999;
    background:#1a1a1a; color:#fff; border-radius:12px; padding:10px 14px;
    box-shadow:0 4px 16px rgba(0,0,0,0.35); font-family:inherit; font-size:13px;
    display:flex; align-items:center; gap:8px; direction:rtl;
  `;
  box.innerHTML = `
    <span style="opacity:0.75">🧪 اختبار كـ:</span>
    <select id="testModeSelect" style="background:#2a2a2a;color:#fff;border:1px solid #444;border-radius:6px;padding:4px 8px;font-family:inherit;font-size:13px;cursor:pointer">
      ${testRoles.map(r => `<option value="${r}" ${r === current ? 'selected' : ''}>${ROLE_LABELS[r] || r}</option>`).join('')}
    </select>
  `;
  document.body.appendChild(box);

  document.getElementById('testModeSelect').addEventListener('change', (e) => {
    const chosen = e.target.value;
    localStorage.setItem('mateenTestRole', chosen);
    window.location.href = ROLE_HOME[chosen] || '../html/home.html';
  });
}
