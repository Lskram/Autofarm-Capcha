// Frontend Application Logic for MuMu Player Farming Controller

// State Management
const state = {
  connected: false,
  port: '127.0.0.1:16384',
  deviceModel: '-',
  resolution: { width: 1600, height: 900 }, // Default landscape resolution
  autoRefresh: true,
  refreshRate: 2000,
  refreshTimer: null,
  isRefreshingScreen: false,
  pointerStart: null,
  
  // Farming Loop State
  farmingActive: false,
  farmingStep: 'idle',
  farmingLogs: []
};

// Initialize Application on Load
window.addEventListener('DOMContentLoaded', () => {
  initDOMReferences();
  setupEventListeners();
  initApp();
});

// Cache DOM Elements
let el = {};
function initDOMReferences() {
  el = {
    // Status Bar & Config
    statusDot: document.getElementById('status-dot'),
    statusText: document.getElementById('status-text'),
    deviceModel: document.getElementById('device-model'),
    portInput: document.getElementById('port-input'),
    btnConnect: document.getElementById('btn-connect'),
    resBadge: document.getElementById('res-badge'),
    
    // Remote Viewport
    btnRefresh: document.getElementById('btn-refresh'),
    chkAutoRefresh: document.getElementById('chk-auto-refresh'),
    selRefreshRate: document.getElementById('sel-refresh-rate'),
    coordDisplay: document.getElementById('coord-display'),
    screenLoading: document.getElementById('screen-loading'),
    emulatorScreen: document.getElementById('emulator-screen'),
    screenOverlay: document.getElementById('screen-overlay'),
    canvasContainer: document.getElementById('canvas-container'),
    
    // Farming Loop controls
    selPlayMacro: document.getElementById('sel-play-macro'),
    selResetMacro: document.getElementById('sel-reset-macro'),
    btnToggleLoop: document.getElementById('btn-toggle-loop'),
    btnRunPlay: document.getElementById('btn-run-play'),
    btnRunReset: document.getElementById('btn-run-reset'),
    loopStatusCard: document.getElementById('loop-status-card'),
    loopStatusIndicator: document.getElementById('loop-status-indicator'),
    loopStatusText: document.getElementById('loop-status-text'),
    farmingLogs: document.getElementById('farming-logs')
  };
}

// Set up event listeners
function setupEventListeners() {
  // Connect Button
  el.btnConnect.addEventListener('click', handleConnect);

  // Refresh Screen
  el.btnRefresh.addEventListener('click', () => fetchScreenshot(true));
  
  el.chkAutoRefresh.addEventListener('change', (e) => {
    state.autoRefresh = e.target.checked;
    if (state.autoRefresh) {
      startAutoRefresh();
    } else {
      stopAutoRefresh();
    }
  });
  
  el.selRefreshRate.addEventListener('change', (e) => {
    state.refreshRate = parseInt(e.target.value);
    if (state.autoRefresh) {
      stopAutoRefresh();
      startAutoRefresh();
    }
  });

  // Mapped Screen Pointer Events (Clicks and Dragging Swipes)
  el.screenOverlay.addEventListener('pointerdown', handlePointerDown);
  el.screenOverlay.addEventListener('pointermove', handlePointerMove);
  el.screenOverlay.addEventListener('pointerup', handlePointerUp);

  // Farming Loop toggle
  el.btnToggleLoop.addEventListener('click', handleToggleFarmingLoop);

  // Manual Macro Play Buttons
  el.btnRunPlay.addEventListener('click', () => handleRunMacro(el.selPlayMacro.value));
  el.btnRunReset.addEventListener('click', () => handleRunMacro(el.selResetMacro.value));

  // Dynamic Image Load Auto-Orientation Detector
  el.emulatorScreen.addEventListener('load', () => {
    if (el.emulatorScreen.naturalWidth && el.emulatorScreen.naturalHeight) {
      const w = el.emulatorScreen.naturalWidth;
      const h = el.emulatorScreen.naturalHeight;
      if (state.resolution.width !== w || state.resolution.height !== h) {
        state.resolution = { width: w, height: h };
        el.resBadge.textContent = `${w}x${h}`;
        el.canvasContainer.style.aspectRatio = `${w}/${h}`;
      }
    }
  });
}

// App Initialization
async function initApp() {
  await refreshStatus();
  await loadMuMuMacros();
  
  // Start screenshot looping
  if (state.autoRefresh) {
    startAutoRefresh();
  }
  
  // Start polling farming loop status
  setInterval(pollFarmingLoopStatus, 1500);
}

// Log message to UI panel
function addLog(msg, type = 'info') {
  const line = document.createElement('div');
  line.className = `log-line text-${type}`;
  line.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
  el.farmingLogs.appendChild(line);
  el.farmingLogs.scrollTop = el.farmingLogs.scrollHeight;
}

function addCoinLog(msg, type = 'info') {
  const line = document.createElement('div');
  line.className = `log-line text-${type}`;
  line.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
  el.coinFarmingLogs.appendChild(line);
  el.coinFarmingLogs.scrollTop = el.coinFarmingLogs.scrollHeight;
}

// Refresh connection details from backend
async function refreshStatus() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();
    
    if (data.connected) {
      state.connected = true;
      state.port = data.port;
      state.deviceModel = data.device;
      
      if (data.width && data.height) {
        state.resolution = { width: data.width, height: data.height };
      }
      
      el.statusDot.className = 'status-indicator online';
      el.statusText.textContent = 'Connected';
      el.deviceModel.textContent = data.device;
      el.portInput.value = data.port;
      el.resBadge.textContent = `${state.resolution.width}x${state.resolution.height}`;
      el.resBadge.style.display = 'inline-block';
    } else {
      state.connected = false;
      el.statusDot.className = 'status-indicator offline';
      el.statusText.textContent = 'Disconnected';
      el.deviceModel.textContent = '-';
      el.resBadge.style.display = 'none';
    }
  } catch (err) {
    console.error('Failed to get status:', err);
    state.connected = false;
    el.statusDot.className = 'status-indicator offline';
    el.statusText.textContent = 'Offline';
    el.deviceModel.textContent = '-';
  }
}

// Handle Connect button click
async function handleConnect() {
  const port = el.portInput.value.trim();
  if (!port) return;
  
  addLog(`Connecting to ADB port ${port}...`, 'muted');
  try {
    const res = await fetch('/api/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ port })
    });
    const data = await res.json();
    
    if (data.connected) {
      addLog(`Successfully connected to emulator at ${port}`, 'success');
      await refreshStatus();
      fetchScreenshot(true);
    } else {
      addLog(`Failed to connect. Make sure MuMu Player is running and ADB port is correct.`, 'error');
      await refreshStatus();
    }
  } catch (err) {
    addLog(`Connection request error: ${err.message}`, 'error');
  }
}

// Load MuMu .mmor macro list
async function loadMuMuMacros() {
  try {
    const res = await fetch('/api/mumu-macros');
    const macros = await res.json();
    
    const defaultOptHTML = '<option value="" selected disabled>-- กรุณาเลือกสคริปต์มาโคร --</option>';
    el.selPlayMacro.innerHTML = defaultOptHTML;
    el.selResetMacro.innerHTML = defaultOptHTML;
    
    if (macros && macros.length > 0) {
      macros.forEach(macro => {
        const createOpt = (m) => {
          const opt = document.createElement('option');
          opt.value = `${m}.mmor`;
          opt.textContent = m;
          return opt;
        };

        el.selPlayMacro.appendChild(createOpt(macro));
        el.selResetMacro.appendChild(createOpt(macro));
      });
      addLog(`Loaded ${macros.length} macros from MuMu folder. Select your desired macros manually.`, 'success');
    } else {
      const emptyOpt = '<option value="">No macros found</option>';
      el.selPlayMacro.innerHTML = emptyOpt;
      el.selResetMacro.innerHTML = emptyOpt;
      addLog('No MuMu macros found. Make sure you have recorded scripts in MuMu.', 'warn');
    }
  } catch (err) {
    console.error('Failed to load macros:', err);
    addLog('Error loading macro files list.', 'error');
  }
}

// Toggle farming loop active status
async function handleToggleFarmingLoop() {
  const playMacro = el.selPlayMacro.value;
  const resetMacro = el.selResetMacro.value;
  
  if (!playMacro || !resetMacro) {
    addLog('Please select both a Play macro and a Reset macro.', 'error');
    return;
  }
  
  try {
    const res = await fetch('/api/farming-loop/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playMacro, resetMacro })
    });
    const data = await res.json();
    
    state.farmingActive = data.active;
    updateFarmingButtonState();
  } catch (err) {
    addLog(`Failed to toggle farming loop: ${err.message}`, 'error');
  }
}

// Poll Farming Loop Status
async function pollFarmingLoopStatus() {
  try {
    const res = await fetch('/api/farming-loop');
    const data = await res.json();
    
    state.farmingActive = data.active;
    state.farmingStep = data.step;
    
    updateFarmingButtonState();
    updateFarmingStatusUI(data.step);
    
    // Update logs
    if (data.logs && data.logs.length > 0) {
      el.farmingLogs.innerHTML = '';
      data.logs.forEach(log => {
        const line = document.createElement('div');
        line.className = `log-line text-${log.type || 'info'}`;
        line.textContent = `[${log.timestamp}] ${log.message}`;
        el.farmingLogs.appendChild(line);
      });
      el.farmingLogs.scrollTop = el.farmingLogs.scrollHeight;
    }
  } catch (err) {
    console.error('Farming loop poll failed:', err);
  }
}

// Update loop controller toggle button theme/text
function updateFarmingButtonState() {
  if (state.farmingActive) {
    el.btnToggleLoop.textContent = "🛡️ Farming Loop: ON";
    el.btnToggleLoop.className = "btn w-full btn-loop-on";
  } else {
    el.btnToggleLoop.textContent = "🛡️ Farming Loop: OFF";
    el.btnToggleLoop.className = "btn w-full btn-loop-off";
  }
}

// Update status indicator and label
function updateFarmingStatusUI(step) {
  const ind = el.loopStatusIndicator;
  const txt = el.loopStatusText;
  
  ind.className = 'status-indicator-large';
  
  if (!state.farmingActive) {
    ind.classList.add('idle');
    txt.textContent = 'Farming Loop Stopped';
    return;
  }
  
  switch (step) {
    case 'play':
      ind.classList.add('play');
      txt.textContent = '🎮 Step 1: Playing Game (Running Play Macro)';
      break;
    case 'captcha':
      ind.classList.add('captcha');
      txt.textContent = '🛡️ Step 2: Checking / Solving Captcha';
      break;
    case 'reset':
      ind.classList.add('reset');
      txt.textContent = '🔄 Step 3: Resetting Stage (Running Reset Macro)';
      break;
    case 'idle':
    default:
      ind.classList.add('idle');
      txt.textContent = '⏳ Transitioning...';
      break;
  }
}

// Direct memory screen update loop
async function fetchScreenshot(force = false) {
  if (state.isRefreshingScreen) return;
  
  state.isRefreshingScreen = true;
  const tempImg = new Image();
  const timestamp = Date.now();
  const srcUrl = `/api/screenshot?t=${timestamp}`;
  
  tempImg.onload = () => {
    el.emulatorScreen.src = srcUrl;
    if (el.emulatorScreen.style.display === 'none') {
      el.emulatorScreen.style.display = 'block';
      el.screenLoading.style.display = 'none';
    }
    state.isRefreshingScreen = false;
  };
  
  tempImg.onerror = (err) => {
    console.error('Failed to update screenshot:', err);
    state.isRefreshingScreen = false;
  };
  
  tempImg.src = srcUrl;
}

function startAutoRefresh() {
  stopAutoRefresh();
  state.refreshTimer = setInterval(fetchScreenshot, state.refreshRate);
}

function stopAutoRefresh() {
  if (state.refreshTimer) {
    clearInterval(state.refreshTimer);
    state.refreshTimer = null;
  }
}

// Mapped coordinates helper
function getMappedCoordinates(e) {
  const rect = el.emulatorScreen.getBoundingClientRect();
  const clickX = e.clientX - rect.left;
  const clickY = e.clientY - rect.top;
  
  const mappedX = Math.round((clickX / rect.width) * state.resolution.width);
  const mappedY = Math.round((clickY / rect.height) * state.resolution.height);
  
  const x = Math.max(0, Math.min(state.resolution.width, mappedX));
  const y = Math.max(0, Math.min(state.resolution.height, mappedY));
  
  return { x, y };
}

function handlePointerDown(e) {
  e.preventDefault();
  state.pointerStart = getMappedCoordinates(e);
  el.coordDisplay.textContent = `X: ${state.pointerStart.x}, Y: ${state.pointerStart.y}`;
}

function handlePointerMove(e) {
  if (!state.pointerStart) return;
  const current = getMappedCoordinates(e);
  el.coordDisplay.textContent = `X: ${current.x}, Y: ${current.y} (Dragging)`;
}

async function handlePointerUp(e) {
  if (!state.pointerStart) return;
  
  const start = state.pointerStart;
  const end = getMappedCoordinates(e);
  state.pointerStart = null;
  
  const distance = Math.sqrt(Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2));
  
  if (distance < 10) {
    // Live emulator TAP
    el.coordDisplay.textContent = `Tapped at (${start.x}, ${start.y})`;
    try {
      await fetch('/api/tap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ x: start.x, y: start.y })
      });
      setTimeout(fetchScreenshot, 500);
    } catch (err) {
      console.error('Tap failed:', err);
    }
  } else {
    // Live emulator SWIPE
    el.coordDisplay.textContent = `Swiped (${start.x}, ${start.y}) ➔ (${end.x}, ${end.y})`;
    try {
      await fetch('/api/swipe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ x1: start.x, y1: start.y, x2: end.x, y2: end.y, duration: 300 })
      });
      setTimeout(fetchScreenshot, 800);
    } catch (err) {
      console.error('Swipe failed:', err);
    }
  }
}

// Trigger macro manually
async function handleRunMacro(macroName) {
  if (!macroName) {
    addLog('Please select a macro first', 'error');
    return;
  }
  if (state.farmingActive || state.coinFarmingActive) {
    addLog('Cannot run macro manually while a Farming Loop is active. Turn it OFF first.', 'warn');
    return;
  }
  
  addLog(`Triggering macro manually: ${macroName}...`, 'info');
  try {
    const res = await fetch('/api/mumu-macros/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ macroName })
    });
    const data = await res.json();
    if (res.ok) {
      addLog(`Macro "${macroName}" execution started.`, 'success');
    } else {
      addLog(`Failed to run macro: ${data.error}`, 'error');
    }
  } catch (err) {
    addLog(`Error triggering macro: ${err.message}`, 'error');
  }
}

// Trigger macro manually from Coin Farming panel (logs to Coin Farming log)
async function handleCoinRunMacro(macroName) {
  if (!macroName) {
    addCoinLog('Please select a macro first', 'error');
    return;
  }
  if (state.farmingActive || state.coinFarmingActive) {
    addCoinLog('Cannot run macro manually while a Farming Loop is active. Turn it OFF first.', 'warn');
    return;
  }
  
  addCoinLog(`Triggering macro manually: ${macroName}...`, 'info');
  try {
    const res = await fetch('/api/mumu-macros/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ macroName })
    });
    const data = await res.json();
    if (res.ok) {
      addCoinLog(`Macro "${macroName}" execution started.`, 'success');
    } else {
      addCoinLog(`Failed to run macro: ${data.error}`, 'error');
    }
  } catch (err) {
    addCoinLog(`Error triggering macro: ${err.message}`, 'error');
  }
}

// Tab navigation switcher
function switchTab(tabId) {
  if (state.currentTab === tabId) return;
  state.currentTab = tabId;

  // Update navigation items active state
  el.navItems.forEach(item => {
    if (item.getAttribute('data-tab') === tabId) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });

  // Switch panels
  if (tabId === 'remote') {
    el.farmingControllerPanel.style.display = 'block';
    el.coinFarmingControllerPanel.style.display = 'none';
    el.currentTabTitle.textContent = "Farming Controller";
    el.currentTabDesc.textContent = "Automate your game farming loop with MuMu macros and auto-captcha solving.";
  } else if (tabId === 'coin-farming') {
    el.farmingControllerPanel.style.display = 'none';
    el.coinFarmingControllerPanel.style.display = 'block';
    el.currentTabTitle.textContent = "Coin Farming Controller";
    el.currentTabDesc.textContent = "Automate Coin Farming: Click Play, purchase Double Coins boost, play the stage, check captcha, and repeat.";
  }
}

// Toggle coin farming loop active status
async function handleToggleCoinFarmingLoop() {
  const part1Macro = el.selCoinPart1Macro.value;
  const part3Macro = el.selCoinPart3Macro.value;
  const part5Macro = el.selCoinPart5Macro.value;
  
  if (!part1Macro || !part3Macro || !part5Macro) {
    addCoinLog('Please configure macros for Part 1, Part 3, and Part 5.', 'error');
    return;
  }
  
  try {
    const res = await fetch('/api/coin-farming-loop/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ part1Macro, part3Macro, part5Macro })
    });
    const data = await res.json();
    
    state.coinFarmingActive = data.active;
    updateCoinFarmingButtonState();
  } catch (err) {
    addCoinLog(`Failed to toggle coin farming loop: ${err.message}`, 'error');
  }
}

// Poll Coin Farming Loop Status
async function pollCoinFarmingLoopStatus() {
  try {
    const res = await fetch('/api/coin-farming-loop');
    const data = await res.json();
    
    state.coinFarmingActive = data.active;
    state.coinFarmingStep = data.step;
    
    updateCoinFarmingButtonState();
    updateCoinFarmingStatusUI(data.step);
    
    // Update logs
    if (data.logs && data.logs.length > 0) {
      el.coinFarmingLogs.innerHTML = '';
      data.logs.forEach(log => {
        const line = document.createElement('div');
        line.className = `log-line text-${log.type || 'info'}`;
        line.textContent = `[${log.timestamp}] ${log.message}`;
        el.coinFarmingLogs.appendChild(line);
      });
      el.coinFarmingLogs.scrollTop = el.coinFarmingLogs.scrollHeight;
    }
  } catch (err) {
    console.error('Coin Farming loop poll failed:', err);
  }
}

// Update Coin Farming toggle button UI
function updateCoinFarmingButtonState() {
  if (state.coinFarmingActive) {
    el.btnCoinToggleLoop.textContent = "🛡️ Coin Farming Loop: ON";
    el.btnCoinToggleLoop.className = "btn w-full btn-loop-on";
  } else {
    el.btnCoinToggleLoop.textContent = "🛡️ Coin Farming Loop: OFF";
    el.btnCoinToggleLoop.className = "btn w-full btn-loop-off";
  }
}

// Update Coin Farming status card UI
function updateCoinFarmingStatusUI(step) {
  const ind = el.coinLoopStatusIndicator;
  const txt = el.coinLoopStatusText;
  
  ind.className = 'status-indicator-large';
  
  if (!state.coinFarmingActive) {
    ind.classList.add('idle');
    txt.textContent = 'Coin Farming Loop Stopped';
    return;
  }
  
  switch (step) {
    case 'part1':
      ind.classList.add('play');
      txt.textContent = '🎮 Step 1: Navigating to Lobby (Running Part 1 Macro)';
      break;
    case 'part2':
      ind.classList.add('captcha');
      txt.textContent = '💰 Step 2: Buying Double Coins Boost';
      break;
    case 'part3':
      ind.classList.add('play');
      txt.textContent = '🎮 Step 3: Playing Stage (Running Part 3 Macro)';
      break;
    case 'part4':
      ind.classList.add('captcha');
      txt.textContent = '🛡️ Step 4: Checking / Solving Captcha';
      break;
    case 'part5':
      ind.classList.add('reset');
      txt.textContent = '🔄 Step 5: Resetting Stage (Running Part 5 Macro)';
      break;
    case 'idle':
    default:
      ind.classList.add('idle');
      txt.textContent = '⏳ Transitioning...';
      break;
  }
}
