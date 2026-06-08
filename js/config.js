// ===========================
//  Constants & Configuration
// ===========================

export const DAYS = [
  'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'
];

export const HOURS = ['1','2','3','4','5','6','7','8','9','10','11','12'];

export const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));

export const MONTHS_AR = [
  'يناير','فبراير','مارس','أبريل','مايو','يونيو',
  'يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'
];

export const MONTHS_HIJRI = [
  'محرم','صفر','ربيع الأول','ربيع الثاني',
  'جمادى الأولى','جمادى الثانية','رجب','شعبان',
  'رمضان','شوال','ذو القعدة','ذو الحجة'
];

// Current Gregorian year range (±2)
const CUR_YEAR = new Date().getFullYear();
export const YEARS_GREGORIAN = Array.from({ length: 5 }, (_, i) => CUR_YEAR - 1 + i);

// Current Hijri year — anchor: 1 Muharram 1447 = 27 June 2025
function getCurrentHijriYear() {
  const anchor   = new Date(2025, 5, 27);
  const today    = new Date();
  const daysDiff = Math.floor((today - anchor) / 86_400_000);
  return 1447 + Math.floor(daysDiff / 354.367);
}
export const CUR_HIJRI_YEAR  = getCurrentHijriYear();
export const YEARS_HIJRI     = Array.from({ length: 11 }, (_, i) => CUR_HIJRI_YEAR - 5 + i);

// Firebase config
export const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyBIVtK3tNHSnQW6Pfq-cZgSvLmTX6kaeTk",
  authDomain:        "mateen-a122d.firebaseapp.com",
  projectId:         "mateen-a122d",
  storageBucket:     "mateen-a122d.firebasestorage.app",
  messagingSenderId: "90050379590",
  appId:             "1:90050379590:web:a10d71638f09837cef2f47"
};
