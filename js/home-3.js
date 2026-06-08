
function submitContact(btn) {
  const inputs = btn.closest('.contact-form').querySelectorAll('input, select, textarea');
  let valid = true;
  inputs.forEach(el => { if (!el.value.trim()) { el.style.borderColor = '#c0392b'; valid = false; } else el.style.borderColor = ''; });
  if (!valid) return;
  btn.disabled = true;
  btn.innerHTML = '<i class="ti ti-loader ti-spin"></i> جارٍ الإرسال...';
  setTimeout(() => {
    btn.innerHTML = '<i class="ti ti-check"></i> تم الإرسال بنجاح!';
    btn.style.background = 'var(--green-mid)';
    inputs.forEach(el => el.value = '');
    setTimeout(() => {
      btn.disabled = false;
      btn.innerHTML = '<i class="ti ti-send"></i> إرسال الرسالة';
      btn.style.background = '';
    }, 3000);
  }, 1200);
}

function submitReg(btn) {
  const modal = document.getElementById('reg-modal');
  const inputs = modal.querySelectorAll('input, select');
  let valid = true;
  inputs.forEach(el => { if (!el.value.trim()) { el.style.borderColor = '#c0392b'; valid = false; } else el.style.borderColor = ''; });
  if (!valid) return;
  btn.disabled = true;
  btn.innerHTML = '<i class="ti ti-loader ti-spin"></i> جارٍ الإرسال...';
  setTimeout(() => {
    btn.innerHTML = '<i class="ti ti-check"></i> تم التسجيل بنجاح!';
    btn.style.background = 'var(--green-mid)';
    setTimeout(() => {
      modal.classList.remove('open');
      btn.disabled = false;
      btn.innerHTML = '<i class="ti ti-send"></i> إرسال طلب التسجيل';
      btn.style.background = '';
      inputs.forEach(el => el.value = '');
    }, 2500);
  }, 1500);
}
