// ══════════════════════════════════════════════════════════════
// ثيم مخصص لحساب معيّن — ألوان + شكل زخرفي اختياري، بيتغيّر من
// حساب الدعم بس، وبيتطبّق على كل صفحات الموقع (مش بس الرئيسية).
// ══════════════════════════════════════════════════════════════

// ١٠ ثيمات جاهزة للاختيار السريع
export const THEME_PRESETS = [
  { id: 'default',  name: '🟤 الافتراضي',      greenDark: '#5c3d2e', gold: '#c9a227', beige: '#f7efe3', pattern: 'none' },
  { id: 'olive',    name: '🫒 أخضر زيتوني',    greenDark: '#3a4d2e', gold: '#8ba33f', beige: '#f2f5ea', pattern: 'geometric' },
  { id: 'night',    name: '🌙 أزرق ليلي',      greenDark: '#1e2a4a', gold: '#4a90d9', beige: '#eef2fa', pattern: 'stars' },
  { id: 'purple',   name: '💜 موف',            greenDark: '#4a2c5e', gold: '#9b59b6', beige: '#f5eefa', pattern: 'geometric' },
  { id: 'pink',     name: '💗 بينك',           greenDark: '#7a2e4d', gold: '#e07a9e', beige: '#fdeef3', pattern: 'circles' },
  { id: 'maroon',   name: '🍷 عنابي',          greenDark: '#5c1f2e', gold: '#c9a227', beige: '#f7ece8', pattern: 'none' },
  { id: 'teal',     name: '🩵 تركواز',         greenDark: '#1f4d4d', gold: '#2ea6a6', beige: '#e8f7f7', pattern: 'circles' },
  { id: 'gray',     name: '⚪ رمادي أنيق',     greenDark: '#333333', gold: '#999999', beige: '#f2f2f2', pattern: 'none' },
  { id: 'navygold', name: '⭐ كحلي وذهبي',    greenDark: '#0f1f3d', gold: '#d4af37', beige: '#eef1f7', pattern: 'stars' },
  { id: 'rose',     name: '🌸 وردي فاتح',      greenDark: '#6b3a4a', gold: '#d98ba0', beige: '#fdf3f6', pattern: 'circles' },
];

const PATTERNS = {
  none: '',
  stars: `url("data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23000' fill-opacity='0.045'%3E%3Cpath d='M20 15l1.5 4.5H26l-3.6 2.8 1.4 4.5-3.8-2.8-3.8 2.8 1.4-4.5L14 19.5h4.5z'/%3E%3C/g%3E%3C/svg%3E")`,
  geometric: `url("data:image/svg+xml,%3Csvg width='44' height='44' viewBox='0 0 44 44' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' stroke='%23000' stroke-opacity='0.05'%3E%3Cpath d='M22 2l20 20-20 20L2 22z'/%3E%3C/g%3E%3C/svg%3E")`,
  circles: `url("data:image/svg+xml,%3Csvg width='36' height='36' viewBox='0 0 36 36' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='18' cy='18' r='6' fill='none' stroke='%23000' stroke-opacity='0.05'/%3E%3C/svg%3E")`,
};

function applyThemeObject(theme) {
  if (!theme) return;
  const root = document.documentElement.style;
  if (theme.greenDark) root.setProperty('--green-dark', theme.greenDark);
  if (theme.gold)      root.setProperty('--gold', theme.gold);
  if (theme.beige)     root.setProperty('--beige', theme.beige);

  const bg = PATTERNS[theme.pattern] || '';
  if (bg) {
    document.body.style.backgroundImage = bg;
    document.body.style.backgroundRepeat = 'repeat';
  } else {
    document.body.style.backgroundImage = '';
  }
}

// بتتنادى بعد ما نجيب بيانات المستخدم من Firestore — وبتخزن نسخة في
// localStorage عشان الصفحات التانية تطبّق الثيم فورًا من غير ما تستنى Firestore
export function applyCustomTheme(userData) {
  const theme = userData && userData.customTheme;
  if (!theme || Object.keys(theme).length === 0) {
    localStorage.removeItem('mateenCustomTheme');
    return;
  }
  localStorage.setItem('mateenCustomTheme', JSON.stringify(theme));
  applyThemeObject(theme);
}

// بتتنادى فورًا في أول تحميل لأي صفحة (قبل حتى ما نجيب بيانات Firestore)
// عشان الثيم يظهر على طول من غير أي فليكر
export function applyCachedThemeEarly() {
  try {
    const cached = JSON.parse(localStorage.getItem('mateenCustomTheme') || 'null');
    if (cached) applyThemeObject(cached);
  } catch (e) {}
}
