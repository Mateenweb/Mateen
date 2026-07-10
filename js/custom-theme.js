// ══════════════════════════════════════════════════════════════
// ثيم مخصص لحساب معيّن — بيتحدد بالإيميل، ويتغيّر من حساب الدعم بس.
// بيغيّر الألوان الأساسية (الأخضر الغامق، الذهبي، البيج) عن طريق
// CSS Variables، فبيطبّق على الموقع كله فورًا من غير ما نلمس أي CSS.
// ══════════════════════════════════════════════════════════════

export function applyCustomTheme(userData) {
  const theme = userData && userData.customTheme;
  if (!theme) return;
  const root = document.documentElement.style;
  if (theme.greenDark) root.setProperty('--green-dark', theme.greenDark);
  if (theme.gold)      root.setProperty('--gold', theme.gold);
  if (theme.beige)     root.setProperty('--beige', theme.beige);
}
