document.addEventListener('DOMContentLoaded', () => {
  const playMacroSelect = document.getElementById('playMacroSelect');
  const resetMacroSelect = document.getElementById('resetMacroSelect');
  const toggleFarmingBtn = document.getElementById('toggleFarmingBtn');
  const runSingleMacroBtn = document.getElementById('runSingleMacroBtn');
  const refreshStreamBtn = document.getElementById('refreshStreamBtn');
  const clearLogsBtn = document.getElementById('clearLogsBtn');
  const logsContainer = document.getElementById('logsContainer');
  const statusBadge = document.getElementById('statusBadge');
  const statusText = document.getElementById('statusText');
  const screenImg = document.getElementById('screenImg');

  let isLoopActive = false;

  // Load Macro Options
  async function loadMacros() {
    try {
      const res = await fetch('/api/mumu-macros');
      const macros = await res.json();

      playMacroSelect.innerHTML = '';
      resetMacroSelect.innerHTML = '';

      if (macros.length === 0) {
        playMacroSelect.innerHTML = '<option value="">ไม่พบสคริปต์มาโคร</option>';
        resetMacroSelect.innerHTML = '<option value="">ไม่พบสคริปต์มาโคร</option>';
        return;
      }

      macros.forEach((m) => {
        const opt1 = document.createElement('option');
        opt1.value = m;
        opt1.textContent = m;
        playMacroSelect.appendChild(opt1);

        const opt2 = document.createElement('option');
        opt2.value = m;
        opt2.textContent = m;
        resetMacroSelect.appendChild(opt2);
      });

      // Default selection if available
      if (macros.includes('oneBox')) playMacroSelect.value = 'oneBox';
      if (macros.includes('Leavetoloby')) resetMacroSelect.value = 'Leavetoloby';

    } catch (e) {
      console.error('Failed to load macros:', e);
    }
  }

  // Refresh Screen Stream
  function refreshScreen() {
    screenImg.src = '/api/screenshot?t=' + Date.now();
  }

  refreshStreamBtn.addEventListener('click', refreshScreen);
  setInterval(refreshScreen, 3000); // Polling screenshot every 3s

  // Poll Loop Status & Logs
  async function pollStatus() {
    try {
      const res = await fetch('/api/farming-loop');
      const data = await res.json();

      isLoopActive = data.active;
      updateUIStatus(data.active, data.step);
      updateLogs(data.logs || []);

    } catch (e) {
      console.error('Status poll error:', e);
    }
  }

  function updateUIStatus(active, step) {
    const btnText = toggleFarmingBtn.querySelector('.btn-text');
    const btnIcon = toggleFarmingBtn.querySelector('.btn-icon');

    if (active) {
      statusBadge.classList.add('active');
      btnIcon.textContent = '⏹';

      let stepLabel = 'กำลังทำงานอัตโนมัติ';
      if (step === 'part1_play') stepLabel = 'Part 1: เล่นสคริปต์ด่าน';
      else if (step === 'part2_detect') stepLabel = 'Part 2: ตรวจจับ & CAPTCHA';
      else if (step === 'part3_reset') stepLabel = 'Part 3: กลับ Lobby';

      statusText.textContent = stepLabel;
      btnText.textContent = 'หยุดทำงานอัตโนมัติ (Stop Loop)';
      toggleFarmingBtn.classList.add('active');
    } else {
      statusBadge.classList.remove('active');
      btnIcon.textContent = '▶';
      statusText.textContent = 'พร้อมใช้งาน';
      btnText.textContent = 'เริ่มทำงานอัตโนมัติ (Start Loop)';
      toggleFarmingBtn.classList.remove('active');
    }
  }

  function updateLogs(logs) {
    logsContainer.innerHTML = '';
    logs.forEach((log) => {
      const div = document.createElement('div');
      div.className = `log-entry ${log.type || 'info'}`;
      div.textContent = `[${log.timestamp}] ${log.message}`;
      logsContainer.appendChild(div);
    });
    logsContainer.scrollTop = logsContainer.scrollHeight;
  }

  clearLogsBtn.addEventListener('click', () => {
    logsContainer.innerHTML = '';
  });

  // Toggle Farming Loop (ปุ่มเดียวแบบง่าย)
  toggleFarmingBtn.addEventListener('click', async () => {
    const playMacro = playMacroSelect.value;
    const resetMacro = resetMacroSelect.value;

    if (!playMacro || !resetMacro) {
      alert('กรุณาเลือกสคริปต์ให้ครบถ้วน');
      return;
    }

    try {
      const res = await fetch('/api/farming-loop/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playMacro, resetMacro })
      });
      const data = await res.json();
      isLoopActive = data.active;
      updateUIStatus(data.active, data.step);
    } catch (e) {
      alert('เกิดข้อผิดพลาดในการเปลี่ยนสถานะ');
    }
  });

  // Run Single Macro Immediately
  runSingleMacroBtn.addEventListener('click', async () => {
    const macroName = playMacroSelect.value;
    if (!macroName) return alert('กรุณาเลือกสคริปต์');

    try {
      const res = await fetch('/api/mumu-macros/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ macroName })
      });
      const data = await res.json();
      if (!res.ok) alert(data.error || 'เกิดข้อผิดพลาด');
    } catch (e) {
      alert('ไม่สามารถเริ่มสคริปต์ได้');
    }
  });

  // Init
  loadMacros();
  setInterval(pollStatus, 2000);
});
