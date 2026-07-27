document.addEventListener('DOMContentLoaded', () => {
  const scriptList = document.getElementById('scriptList');
  const toggleFarmingBtn = document.getElementById('toggleFarmingBtn');
  const stopMacroBtn = document.getElementById('stopMacroBtn');
  const refreshScriptsBtn = document.getElementById('refreshScriptsBtn');
  const refreshStreamBtn = document.getElementById('refreshStreamBtn');
  const clearLogsBtn = document.getElementById('clearLogsBtn');
  const logsContainer = document.getElementById('logsContainer');
  const statusBadge = document.getElementById('statusBadge');
  const statusText = document.getElementById('statusText');
  const screenImg = document.getElementById('screenImg');

  const progressMacroName = document.getElementById('progressMacroName');
  const progressTextInfo = document.getElementById('progressTextInfo');
  const progressBarFill = document.getElementById('progressBarFill');
  const progressPercentText = document.getElementById('progressPercentText');

  let selectedPlayMacro = 'oneBox';
  let selectedResetMacro = 'Leavetoloby';
  let isLoopActive = false;

  // Load Detailed Script List from Operation Recorder
  async function loadScripts() {
    if (!scriptList) return;
    scriptList.innerHTML = '<div class="loading-text">กำลังโหลดรายการสคริปต์...</div>';

    try {
      const res = await fetch('/api/mumu-macros');
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const macros = await res.json();

      scriptList.innerHTML = '';

      if (!macros || macros.length === 0) {
        scriptList.innerHTML = '<div class="loading-text">ไม่พบสคริปต์ใน Operation Recorder</div>';
        return;
      }

      macros.forEach((m) => {
        const item = document.createElement('div');
        item.className = 'script-item';

        const isPlayActive = m.name === selectedPlayMacro;
        const isResetActive = m.name === selectedResetMacro;

        item.innerHTML = `
          <div class="script-info">
            <div class="script-name">${m.name}</div>
            <div class="script-meta">Executed 1 time(${m.durationText}) | ${m.resolution}</div>
          </div>
          <div class="script-actions">
            <div class="role-select-group">
              <button class="role-btn ${isPlayActive ? 'active-play' : ''}" data-role="play" data-name="${m.name}">
                ${isPlayActive ? '🎮 Part 1 (ด่าน)' : 'Part 1'}
              </button>
              <button class="role-btn ${isResetActive ? 'active-reset' : ''}" data-role="reset" data-name="${m.name}">
                ${isResetActive ? '🔄 Part 3 (Lobby)' : 'Part 3'}
              </button>
            </div>
            <button class="blue-play-btn" data-run="${m.name}" title="เล่นสคริปต์ ${m.name}">
              ▶
            </button>
          </div>
        `;

        scriptList.appendChild(item);
      });

      bindScriptEvents();

    } catch (e) {
      console.error('Failed to load scripts:', e);
      scriptList.innerHTML = `
        <div class="loading-text error-text">
          เกิดข้อผิดพลาดในการโหลดรายการสคริปต์ (${e.message})
          <br><button class="btn btn-sm btn-outline" style="margin-top:8px" onclick="location.reload()">🔄 กดเพื่อโหลดใหม่</button>
        </div>
      `;
    }
  }

  function bindScriptEvents() {
    document.querySelectorAll('.blue-play-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const macroName = btn.dataset.run;
        if (!macroName) return;

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
    });

    document.querySelectorAll('.role-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const role = btn.dataset.role;
        const name = btn.dataset.name;

        if (role === 'play') selectedPlayMacro = name;
        if (role === 'reset') selectedResetMacro = name;

        loadScripts();
      });
    });
  }

  // Stop Macro Action
  if (stopMacroBtn) {
    stopMacroBtn.addEventListener('click', async () => {
      try {
        const res = await fetch('/api/mumu-macros/stop', { method: 'POST' });
        const data = await res.json();
        console.log('Macro stopped:', data);
      } catch (e) {
        alert('เกิดข้อผิดพลาดในการหยุดสคริปต์');
      }
    });
  }

  // Refresh Screen Stream safely
  function refreshScreen() {
    if (screenImg) {
      screenImg.src = '/api/screenshot?t=' + Date.now();
    }
  }

  if (refreshStreamBtn) refreshStreamBtn.addEventListener('click', refreshScreen);
  if (refreshScriptsBtn) refreshScriptsBtn.addEventListener('click', loadScripts);

  setInterval(refreshScreen, 3000);

  // Poll Loop Status, Logs & Real-time Progress
  async function pollStatus() {
    try {
      const res = await fetch('/api/farming-loop');
      const data = await res.json();

      isLoopActive = data.active;
      if (data.playMacro) selectedPlayMacro = data.playMacro;
      if (data.resetMacro) selectedResetMacro = data.resetMacro;

      updateUIStatus(data.active, data.step);
      updateProgress(data.macroProgress);
      updateLogs(data.logs || []);

    } catch (e) {
      console.error('Status poll error:', e);
    }
  }

  function updateUIStatus(active, step) {
    if (!toggleFarmingBtn) return;
    const btnText = toggleFarmingBtn.querySelector('.btn-text');
    const btnIcon = toggleFarmingBtn.querySelector('.btn-icon');

    if (active) {
      if (statusBadge) statusBadge.classList.add('active');
      if (btnIcon) btnIcon.textContent = '⏹';

      let stepLabel = 'กำลังทำงานอัตโนมัติ';
      if (step === 'part1_play') stepLabel = 'Part 1: เล่นสคริปต์ด่าน';
      else if (step === 'part2_detect') stepLabel = 'Part 2: ตรวจจับ & CAPTCHA';
      else if (step === 'part3_reset') stepLabel = 'Part 3: กลับ Lobby';

      if (statusText) statusText.textContent = stepLabel;
      if (btnText) btnText.textContent = 'หยุดทำงานอัตโนมัติ';
      toggleFarmingBtn.classList.add('active');
    } else {
      if (statusBadge) statusBadge.classList.remove('active');
      if (btnIcon) btnIcon.textContent = '▶';
      if (statusText) statusText.textContent = 'พร้อมใช้งาน';
      if (btnText) btnText.textContent = 'เริ่มทำงานอัตโนมัติ (Start Loop)';
      toggleFarmingBtn.classList.remove('active');
    }
  }

  function updateProgress(prog) {
    if (!prog) return;

    const percent = prog.percent || 0;
    const activeMacro = prog.activeMacro || '';
    const textInfo = prog.text || '0.0s / 0.0s';

    if (progressBarFill) progressBarFill.style.width = `${percent}%`;
    if (progressPercentText) progressPercentText.textContent = `${percent}%`;
    if (progressTextInfo) progressTextInfo.textContent = textInfo;

    if (progressMacroName) {
      if (activeMacro) {
        progressMacroName.textContent = `กำลังเล่นสคริปต์ '${activeMacro}'`;
        if (stopMacroBtn) stopMacroBtn.disabled = false;
      } else {
        if (percent === 100) {
          progressMacroName.textContent = 'สคริปต์เล่นเสร็จสมบูรณ์ 100%';
        } else {
          progressMacroName.textContent = 'ไม่มีสคริปต์กำลังรัน';
        }
        if (stopMacroBtn) stopMacroBtn.disabled = true;
      }
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

  // Toggle Farming Loop
  if (toggleFarmingBtn) {
    toggleFarmingBtn.addEventListener('click', async () => {
      try {
        const res = await fetch('/api/farming-loop/toggle', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ playMacro: selectedPlayMacro, resetMacro: selectedResetMacro })
        });
        const data = await res.json();
        isLoopActive = data.active;
        updateUIStatus(data.active, data.step);
      } catch (e) {
        alert('เกิดข้อผิดพลาดในการเปลี่ยนสถานะ');
      }
    });
  }

  // Init
  loadScripts();
  setInterval(pollStatus, 500);
});
