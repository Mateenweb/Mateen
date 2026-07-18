// ══════════════════════════════════════════════════════════════
// ثيم مخصص لحساب معيّن — ألوان + شكل زخرفي متحرك اختياري، بيتغيّر
// من حساب الدعم بس، وبيتطبّق على كل صفحات الموقع (مش بس الرئيسية).
// ══════════════════════════════════════════════════════════════

// ١٠ ثيمات جاهزة للاختيار السريع — كل واحد بقى ليه نمط زخرفي
// يناسب هويته (بدل ما تكون الأنماط عشوائية بين الثيمات)
export const THEME_PRESETS = [
  { id: 'default',  name: '🟤 الافتراضي',      greenDark: '#5c3d2e', gold: '#c9a227', beige: '#f7efe3', pattern: 'none' },
  { id: 'olive',    name: '🫒 أخضر زيتوني',    greenDark: '#3a4d2e', gold: '#8ba33f', beige: '#f2f5ea', pattern: 'leaves' },
  { id: 'night',    name: '🌙 أزرق ليلي',      greenDark: '#1e2a4a', gold: '#4a90d9', beige: '#eef2fa', pattern: 'stars' },
  { id: 'purple',   name: '💜 موف',            greenDark: '#4a2c5e', gold: '#9b59b6', beige: '#f5eefa', pattern: 'geometric' },
  { id: 'pink',     name: '💗 بينك',           greenDark: '#7a2e4d', gold: '#e07a9e', beige: '#fdeef3', pattern: 'hearts' },
  { id: 'maroon',   name: '🍷 عنابي',          greenDark: '#5c1f2e', gold: '#c9a227', beige: '#f7ece8', pattern: 'none' },
  { id: 'teal',     name: '🩵 تركواز',         greenDark: '#1f4d4d', gold: '#2ea6a6', beige: '#e8f7f7', pattern: 'waves' },
  { id: 'gray',     name: '⚪ رمادي أنيق',     greenDark: '#333333', gold: '#999999', beige: '#f2f2f2', pattern: 'none' },
  { id: 'navygold', name: '⭐ كحلي وذهبي',    greenDark: '#0f1f3d', gold: '#d4af37', beige: '#eef1f7', pattern: 'stars' },
  { id: 'rose',     name: '🌸 وردي فاتح',      greenDark: '#6b3a4a', gold: '#d98ba0', beige: '#fdf3f6', pattern: 'hearts' },
];

// خلفية كل نمط (SVG متكرر) + الإيموجي المستخدم في أنيميشن الترحيب
const PATTERNS = {
  none:      { bg: '', icon: '' },
  stars:     { bg: `url("data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23000' fill-opacity='0.045'%3E%3Cpath d='M20 15l1.5 4.5H26l-3.6 2.8 1.4 4.5-3.8-2.8-3.8 2.8 1.4-4.5L14 19.5h4.5z'/%3E%3C/g%3E%3C/svg%3E")`, icon: '✨' },
  geometric: { bg: `url("data:image/svg+xml,%3Csvg width='44' height='44' viewBox='0 0 44 44' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' stroke='%23000' stroke-opacity='0.05'%3E%3Cpath d='M22 2l20 20-20 20L2 22z'/%3E%3C/g%3E%3C/svg%3E")`, icon: '🔷' },
  circles:   { bg: `url("data:image/svg+xml,%3Csvg width='36' height='36' viewBox='0 0 36 36' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='18' cy='18' r='6' fill='none' stroke='%23000' stroke-opacity='0.05'/%3E%3C/svg%3E")`, icon: '⚪' },
  hearts:    { bg: `url("data:image/svg+xml,%3Csvg width='42' height='42' viewBox='0 0 42 42' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath fill='%23000' fill-opacity='0.05' d='M21 32s-11-7-11-15a6 6 0 0 1 11-3 6 6 0 0 1 11 3c0 8-11 15-11 15z'/%3E%3C/svg%3E")`, icon: '💗' },
  leaves:    { bg: `url("data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath fill='%23000' fill-opacity='0.05' d='M20 6c8 4 10 12 4 22-8-2-14-10-12-18 2-4 5-4 8-4z'/%3E%3C/svg%3E")`, icon: '🍃' },
  waves:     { bg: `url("data:image/svg+xml,%3Csvg width='60' height='20' viewBox='0 0 60 20' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath fill='none' stroke='%23000' stroke-opacity='0.06' stroke-width='2' d='M0 10q7.5-10 15 0t15 0 15 0 15 0'/%3E%3C/svg%3E")`, icon: '🌊' },
};

const REDUCED_MOTION = () =>
  window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let styleInjected = false;
function ensureAnimationStyles() {
  if (styleInjected) return;
  styleInjected = true;
  const style = document.createElement('style');
  style.id = 'mateenThemeAnimStyles';
  style.textContent = `
    @keyframes mateenBgDrift { from { background-position: 0 0; } to { background-position: 240px 240px; } }
    .mateen-theme-bg-anim { animation: mateenBgDrift 90s linear infinite; }
    .mateen-theme-burst { position: fixed; inset: 0; pointer-events: none; z-index: 99999; overflow: hidden; }
    .mateen-theme-burst-particle {
      position: absolute; bottom: -40px; font-size: 22px; opacity: 0;
      animation: mateenBurstFloat 2.2s ease-in forwards;
    }
    @keyframes mateenBurstFloat {
      0%   { transform: translateY(0) scale(0.6); opacity: 0; }
      15%  { opacity: 0.9; }
      100% { transform: translateY(-70vh) scale(1.1); opacity: 0; }
    }
    @media (prefers-reduced-motion: reduce) {
      .mateen-theme-bg-anim { animation: none; }
    }
  `;
  document.head.appendChild(style);
}

function applyThemeObject(theme) {
  if (!theme) return;
  const root = document.documentElement.style;
  if (theme.greenDark) root.setProperty('--green-dark', theme.greenDark);
  if (theme.gold)      root.setProperty('--gold', theme.gold);
  if (theme.beige)     root.setProperty('--beige', theme.beige);

  const pattern = PATTERNS[theme.pattern] || PATTERNS.none;
  if (pattern.bg) {
    ensureAnimationStyles();
    document.body.style.backgroundImage = pattern.bg;
    document.body.style.backgroundRepeat = 'repeat';
    document.body.classList.toggle('mateen-theme-bg-anim', !REDUCED_MOTION());
  } else {
    document.body.style.backgroundImage = '';
    document.body.classList.remove('mateen-theme-bg-anim');
  }
}

// أنيميشن ترحيبي قصير (~2 ثانية) بيظهر مرة واحدة بس أول ما ثيم جديد
// يتطبق على الحساب (مش في كل تحميل صفحة عادي) — بيحترم إعداد تقليل الحركة
function playThemeWelcomeBurst(pattern) {
  if (REDUCED_MOTION()) return;
  const info = PATTERNS[pattern];
  if (!info || !info.icon) return;
  ensureAnimationStyles();

  const wrap = document.createElement('div');
  wrap.className = 'mateen-theme-burst';
  const count = 10;
  for (let i = 0; i < count; i++) {
    const span = document.createElement('span');
    span.className = 'mateen-theme-burst-particle';
    span.textContent = info.icon;
    span.style.left = (Math.random() * 92 + 2) + 'vw';
    span.style.animationDelay = (Math.random() * 0.8) + 's';
    wrap.appendChild(span);
  }
  document.body.appendChild(wrap);
  setTimeout(() => wrap.remove(), 3200);
}

// بتتنادى بعد ما نجيب بيانات المستخدم من Firestore — وبتخزن نسخة في
// localStorage عشان الصفحات التانية تطبّق الثيم فورًا من غير ما تستنى Firestore
export function applyCustomTheme(userData) {
  const theme = userData && userData.customTheme;
  const prevRaw = localStorage.getItem('mateenCustomTheme');

  if (!theme || Object.keys(theme).length === 0) {
    localStorage.removeItem('mateenCustomTheme');
    return;
  }

  const newRaw = JSON.stringify(theme);
  const isNewOrChanged = prevRaw !== newRaw;

  localStorage.setItem('mateenCustomTheme', newRaw);
  applyThemeObject(theme);

  // الأنيميشن الترحيبي بيظهر بس لما الثيم يكون اتغيّر فعلاً عن آخر مرة
  // اتخزن فيها على الجهاز ده (يعني مش هيتكرر في كل تحميل صفحة عادي)
  if (isNewOrChanged && prevRaw !== null) {
    playThemeWelcomeBurst(theme.pattern);
  }
}

// بتتنادى فورًا في أول تحميل لأي صفحة (قبل حتى ما نجيب بيانات Firestore)
// عشان الثيم يظهر على طول من غير أي فليكر
export function applyCachedThemeEarly() {
  try {
    const cached = JSON.parse(localStorage.getItem('mateenCustomTheme') || 'null');
    if (cached) applyThemeObject(cached);
  } catch (e) {}
}
