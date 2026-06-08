
    // Show helpful error if module fails to load (e.g. opened via file://)
    window.addEventListener('error', function(e) {
      if (e.message && e.message.includes('addRow') || e.message.includes('is not defined')) {
        document.body.insertAdjacentHTML('afterbegin',
          '<div style="position:fixed;top:0;left:0;right:0;z-index:9999;background:#c0392b;color:white;padding:12px 20px;font-family:sans-serif;font-size:14px;text-align:center">' +
          '⚠️ الملف يحتاج خادم محلي للعمل. شغّله عبر: <b>npx serve</b> أو VS Code Live Server أو رفعه على الإنترنت.' +
          '</div>'
        );
      }
    });
  