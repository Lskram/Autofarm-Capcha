document.addEventListener('DOMContentLoaded', () => {
  const scriptList = document.getElementById('scriptList') || document.querySelector('.macro-list') || document.body;
  const screenImg = document.getElementById('screenImg') || document.querySelector('img');

  async function loadMacros() {
    try {
      const res = await fetch('/api/mumu-macros');
      const macros = await res.json();
      
      const container = document.getElementById('scriptList') || document.querySelector('.script-list') || document.querySelector('.macro-list');
      if (!container) return;

      container.innerHTML = '';

      if (!macros || macros.length === 0) {
        container.innerHTML = '<div class="loading-text">ไม่พบสคริปต์ใน Operation Recorder</div>';
        return;
      }

      macros.forEach((m) => {
        const name = typeof m === 'string' ? m.replace('.mmor', '') : (m.name || m.filename.replace('.mmor', ''));
        const item = document.createElement('div');
        item.className = 'script-item macro-item';
        item.style.display = 'flex';
        item.style.justifyContent = 'space-between';
        item.style.alignItems = 'center';
        item.style.padding = '12px 16px';
        item.style.marginBottom = '8px';
        item.style.background = 'rgba(255, 255, 255, 0.05)';
        item.style.borderRadius = '8px';

        item.innerHTML = `
          <div style="font-weight: 500; font-size: 1rem; color: #fff;">${name}</div>
          <button class="blue-play-btn" data-name="${name}" style="background: #3b82f6; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 1rem;">
            ▶ เล่นสคริปต์
          </button>
        `;

        container.appendChild(item);
      });

      document.querySelectorAll('.blue-play-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const macroName = btn.dataset.name;
          try {
            const r = await fetch('/api/mumu-macros/run', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ macroName })
            });
            const d = await r.json();
            alert(d.message || `เริ่มสคริปต์ ${macroName} เรียบร้อย`);
          } catch (e) {
            alert('ไม่สามารถเริ่มสคริปต์ได้');
          }
        });
      });

    } catch (e) {
      console.error('Error loading macros:', e);
    }
  }

  function refreshScreenshot() {
    if (screenImg) {
      screenImg.src = '/api/screenshot?t=' + Date.now();
    }
  }

  loadMacros();
  setInterval(refreshScreenshot, 3000);
});
