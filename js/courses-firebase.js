import { initializeApp, getApps, getApp }
  from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js";
import { getFirestore, collection, query, orderBy, onSnapshot }
  from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";
import { FIREBASE_CONFIG } from "./config.js";

const app = getApps().length ? getApp() : initializeApp(FIREBASE_CONFIG);
const db  = getFirestore(app);

let allMats = [];

const TYPE_ICONS = {
  محاضرة: '🎙️', ملخص: '📄', واجب: '📝', اختبار: '✅',
  مرجع: '📚', فيديو: '🎬', أخرى: '📎'
};

const LINK_ICONS = {
  youtube: '▶️', drive: '📁', dropbox: '☁️', default: '🔗'
};

function detectLinkType(url) {
  if (!url) return 'default';
  if (url.includes('youtube') || url.includes('youtu.be')) return 'youtube';
  if (url.includes('drive.google')) return 'drive';
  if (url.includes('dropbox')) return 'dropbox';
  return 'default';
}

function renderMats(mats) {
  const container = document.getElementById('matsContainer');
  const section   = document.getElementById('dynamicMatsSection');
  if (!container) return;

  if (mats.length === 0) {
    section.style.display = 'none';
    return;
  }

  section.style.display = 'block';
  container.innerHTML = mats.map(m => `
    <a href="${m.url}" target="_blank" rel="noopener" style="text-decoration:none;">
      <div style="background:var(--white);border:1px solid var(--border);border-radius:12px;padding:16px;transition:all 0.2s;cursor:pointer;"
           onmouseover="this.style.transform='translateY(-3px)';this.style.boxShadow='0 8px 20px rgba(92,61,46,0.12)'"
           onmouseout="this.style.transform='none';this.style.boxShadow='none'">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
          <span style="font-size:22px">${TYPE_ICONS[m.type] || '📎'}</span>
          <div>
            <div style="font-size:13px;font-weight:700;color:var(--green-dark)">${m.title}</div>
            <div style="font-size:11px;color:var(--text-mid);margin-top:2px">${m.course} • ${m.type || ''}</div>
          </div>
        </div>
        ${m.notes ? `<div style="font-size:12px;color:var(--text-mid);background:var(--beige);padding:8px 10px;border-radius:8px;margin-bottom:10px">${m.notes}</div>` : ''}
        <div style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--gold-dark)">
          <span>${LINK_ICONS[detectLinkType(m.url)]}</span>
          <span>فتح الرابط</span>
          <i class="ti ti-external-link"></i>
        </div>
      </div>
    </a>
  `).join('');
}

window.filterMats = () => {
  const val = document.getElementById('filterCourse').value;
  const filtered = val ? allMats.filter(m => m.course === val) : allMats;
  renderMats(filtered);
};

// Load materials from Firestore
onSnapshot(query(collection(db, 'materials'), orderBy('addedAt', 'desc')), snap => {
  allMats = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  window.filterMats();
});
