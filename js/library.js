// ══ تبthisل الأقسام ══
function showSection(id, btn) {
  document.querySelectorAll('.lib-section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.lib-tab').forEach(b => b.classList.remove('active'));
  document.getElementById('section-' + id).classList.add('active');
  btn.classList.add('active');
}

// ══ فلتر Library متين ══
window.currentLibFilter = 'all';
window.filterLibMats = (btn, cat) => {
  document.querySelectorAll('.lib-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  window.currentLibFilter = cat;
  window.renderLibMats && window.renderLibMats();
};

// ══ فتح Modal الAdd ══
window.openAddLibModal = (section, courseId) => {
  const titles = {
    'mateen-lib': 'إضافة مادة لمكتبة متين',
    'enrichment': 'إضافة محتوى إثرائي',
    'podcast':    'إضافة حلقة بودكاست',
    'courses':    'إضافة محتوى للدورة',
  };
  document.getElementById('addLibSection').value = section;
  document.getElementById('addLibCourseId').value = courseId || '';
  document.getElementById('addLibModalTitle').textContent = titles[section] || 'إضافة محتوى';
  document.getElementById('addLibTitle').value = '';
  document.getElementById('addLibUrl').value = '';
  document.getElementById('addLibNotes').value = '';
  document.getElementById('addLibErr').style.display = 'none';

  // حقل "المادة" يظهر بس لمكتبة متين
  const subjWrap = document.getElementById('libSubjectWrap');
  if (subjWrap) subjWrap.style.display = section === 'mateen-lib' ? 'block' : 'none';
  if (section === 'mateen-lib') {
    document.getElementById('addLibSubject').value =
      (window.currentLibFilter && window.currentLibFilter !== 'all') ? window.currentLibFilter : '';
  }

  // حقل "رقم المحاضرة" يظهر لمكتبة متين والدورات (مش للإثرائي/البودكاست)
  const lecWrap = document.getElementById('libLectureWrap');
  if (lecWrap) lecWrap.style.display = (section === 'mateen-lib' || section === 'courses') ? 'block' : 'none';
  if (window.updateLibLectureOptions) window.updateLibLectureOptions();

  document.getElementById('addLibModal').style.display = 'flex';
};

