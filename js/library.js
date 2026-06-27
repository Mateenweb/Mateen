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
window.openAddLibModal = (section) => {
  const titles = {
    'enrichment': 'إضافة محتوى إثرائي',
    'podcast':    'إضافة حلقة بودكاست',
    'courses':    'إضافة دورة',
  };
  document.getElementById('addLibSection').value = section;
  document.getElementById('addLibModalTitle').textContent = titles[section] || 'إضافة محتوى';
  document.getElementById('addLibTitle').value = '';
  document.getElementById('addLibUrl').value = '';
  document.getElementById('addLibNotes').value = '';
  document.getElementById('addLibErr').style.display = 'none';
  document.getElementById('addLibModal').style.display = 'flex';
};

