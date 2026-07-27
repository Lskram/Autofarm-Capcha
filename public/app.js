document.addEventListener('DOMContentLoaded', () => {
  const toggleSolverBtn = document.getElementById('toggleSolverBtn');
  const solveOnceBtn = document.getElementById('solveOnceBtn');
  const refreshStreamBtn = document.getElementById('refreshStreamBtn');
  const clearLogsBtn = document.getElementById('clearLogsBtn');
  const logsContainer = document.getElementById('logsContainer');
  const statusBadge = document.getElementById('statusBadge');
  const statusText = document.getElementById('statusText');
  const screenImg = document.getElementById('screenImg');

  let isSolverActive = false;

  // Refresh Screen Stream - Locked at 0.3 Seconds (300ms)
  function refreshScreen() {
    if (screenImg) {
      screenImg.src = '/api/screenshot?t=' + Date.now();
    }
  }

  if (refreshStreamBtn) refreshStreamBtn.addEventListener('click', refreshScreen);
  
  // Locked refresh rate at exactly 0.3s (300ms)
  setInterval(refreshScreen, 300);

  async function pollStatus() {
    try {
      const res = await fetch('/api/captcha-solver/status');
      const data = await res.json();

      isSolverActive = data.active;
      updateUIStatus(data.active);
      updateLogs(data.logs || []);
    } catch (e) {
      console.error('Status poll error:', e);
    }
  }

  function updateUIStatus(active) {
    if (!toggleSolverBtn) return;
    const btnText = toggleSolverBtn.querySelector('.btn-text');
    const btnIcon = toggleSolverBtn.querySelector('.btn-icon');

    if (active) {
      if (statusBadge) statusBadge.classList.add('active');
      if (statusText) statusText.textContent = 'กำลังสแกนแก้ CAPTCHA อัตโนมัติ';
      if (btnIcon) btnIcon.textContent = '⏹';
      if (btnText) btnText.textContent = 'หยุดระบบแก้ CAPTCHA อัตโนมัติ';
      toggleSolverBtn.classList.add('active');
    } else {
      if (statusBadge) statusBadge.classList.remove('active');
      if (statusText) statusText.textContent = 'พร้อมใช้งาน';
      if (btnIcon) btnIcon.textContent = '▶';
      if (btnText) btnText.textContent = 'เปิดระบบแก้ CAPTCHA อัตโนมัติ';
      toggleSolverBtn.classList.remove('active');
    }
  }

  function updateLogs(logs) {
    if (!logsContainer) return;
    logsContainer.innerHTML = '';
    logs.forEach((log) => {
      const div = document.createElement('div');
      div.className = `log-entry ${log.type || 'info'}`;
      div.textContent = `[${log.timestamp}] ${log.message}`;
      logsContainer.appendChild(div);
    });
    logsContainer.scrollTop = logsContainer.scrollHeight;
  }

  if (clearLogsBtn) {
    clearLogsBtn.addEventListener('click', () => {
      if (logsContainer) logsContainer.innerHTML = '';
    });
  }

  if (toggleSolverBtn) {
    toggleSolverBtn.addEventListener('click', async () => {
      try {
        const res = await fetch('/api/captcha-solver/toggle', { method: 'POST' });
        const data = await res.json();
        isSolverActive = data.active;
        updateUIStatus(data.active);
      } catch (e) {
        alert('เกิดข้อผิดพลาดในการเปิด/ปิดระบบ');
      }
    });
  }

  if (solveOnceBtn) {
    solveOnceBtn.addEventListener('click', async () => {
      try {
        const res = await fetch('/api/captcha-solver/solve-once', { method: 'POST' });
        const data = await res.json();
        console.log('Manual solve:', data);
      } catch (e) {
        alert('เกิดข้อผิดพลาดในการแก้ CAPTCHA');
      }
    });
  }

  setInterval(pollStatus, 500);
});
