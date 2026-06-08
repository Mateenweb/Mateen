// ===========================
//  UI Rendering
// ===========================

import { DAYS, HOURS, MINUTES } from './config.js';
import { makeDatePicker } from './dateUtils.js';

/** Escape HTML to prevent XSS */
export function escapeHtml(str) {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Show a brief toast notification */
export function showToast(msg) {
  const t = document.createElement('div');
  t.innerText = msg;
  t.style.cssText = [
    'position:fixed', 'bottom:24px', 'left:50%', 'transform:translateX(-50%)',
    'background:#1a3a5c', 'color:white', 'padding:10px 22px',
    'border-radius:12px', 'z-index:9999',
    'font-family:Cairo,sans-serif', 'font-size:14px',
    'box-shadow:0 4px 15px rgba(0,0,0,.3)'
  ].join(';');
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2000);
}

/** Update the 5 stats cards */
export function updateStats(students) {
  document.getElementById('total').innerText        = students.length;
  document.getElementById('interviewed').innerText  = students.filter(s => s.interview === 'done').length;
  document.getElementById('pendingCount').innerText = students.filter(s => s.interview === 'pending').length;
  document.getElementById('accepted').innerText     = students.filter(s => s.accepted === 'accepted').length;
  document.getElementById('rejected').innerText     = students.filter(s => s.accepted === 'rejected').length;
}

// ── Option builders ──────────────────────────────────────────────
function dayOptions(selected) {
  return DAYS.map(d => `<option value="${d}" ${selected === d ? 'selected' : ''}>${d}</option>`).join('');
}

function hourOptions(selected) {
  return HOURS.map(h => `<option value="${h}" ${selected === h ? 'selected' : ''}>${h}</option>`).join('');
}

function minuteOptions(selected) {
  return MINUTES.map(m => `<option value="${m}" ${selected === m ? 'selected' : ''}>${m}</option>`).join('');
}

// ── Row builder ──────────────────────────────────────────────────
function buildRow(s, index) {
  let acceptClass = 'btn-na';
  let acceptText  = '— لم يحدد';
  if (s.accepted === 'accepted') { acceptClass = 'btn-accepted'; acceptText = '✔️ مقبولة'; }
  if (s.accepted === 'rejected') { acceptClass = 'btn-rejected'; acceptText = '✖️ غير مقبولة'; }

  return `
    <tr>
      <td><input type="checkbox" class="row-check" data-id="${s.id}" onchange="onRowCheck()"></td>
      <td>${index + 1}</td>

      <td>
        <div class="name-cell">
          <a class="student-link" href="student.html?id=${s.id}" title="صفحة المتابعة">👤</a>
          <button class="copy-link-btn" onclick="copyStudentLink('${s.id}')" title="نسخ رابط الطالبة">🔗</button>
          <input type="text" value="${escapeHtml(s.name)}"
            oninput="autoSaveName('${s.id}', this.value)">
          <select class="status-select" onchange="updateField('${s.id}','status',this.value)">
            <option value=""   ${!s.status            ? 'selected' : ''}>🏷️ التصنيف</option>
            <option value="mateen" ${s.status==='mateen' ? 'selected' : ''}>📖 بنات متين</option>
            <option value="new"    ${s.status==='new'    ? 'selected' : ''}>✨ المستجدات</option>
          </select>
        </div>
      </td>

      <td>
        <div class="day-date-cell">
          <select class="day-select" onchange="updateField('${s.id}','day',this.value)">
            <option value="">-- اليوم --</option>
            ${dayOptions(s.day)}
          </select>
          ${makeDatePicker(s.id, s.dateH)}
        </div>
      </td>

      <td>
        <div class="time-cell">
          <select class="time-hour" onchange="updateField('${s.id}','hour',this.value)">
            <option value="">ساعة</option>${hourOptions(s.hour)}
          </select>
          <span>:</span>
          <select class="time-minute" onchange="updateField('${s.id}','minute',this.value)">
            <option value="">دقيقة</option>${minuteOptions(s.minute)}
          </select>
          <select class="time-ampm" onchange="updateField('${s.id}','ampm',this.value)">
            <option value="ص" ${s.ampm === 'ص' ? 'selected' : ''}>صباحاً</option>
            <option value="م" ${s.ampm === 'م' ? 'selected' : ''}>مساءً</option>
          </select>
        </div>
      </td>

      <td>
        <button class="btn-interview ${s.interview === 'done' ? 'btn-done' : 'btn-pending'}"
          onclick="toggleInterview('${s.id}','${s.interview}')">
          ${s.interview === 'done' ? '✅ تمت' : '⏳ لم تتم'}
        </button>
      </td>

      <td>
        <button class="btn-accept ${acceptClass}"
          onclick="toggleAcceptance('${s.id}','${s.accepted}','${s.interview}')">
          ${acceptText}
        </button>
      </td>

      <td>
        <button class="btn-delete" onclick="deleteStudent('${s.id}')">🗑️</button>
      </td>
    </tr>`;
}

/** Render filtered student list into the table */
export function renderTable(students, filteredData) {
  const data  = filteredData || students;
  const tbody = document.getElementById('tableBody');

  if (!data.length) {
    tbody.innerHTML = `<tr><td colspan="7" style="padding:30px;text-align:center">لا توجد بيانات</td></tr>`;
    updateStats(students);
    return;
  }

  tbody.innerHTML = data.map((s, i) => buildRow(s, i)).join('');
  updateStats(students);
}
