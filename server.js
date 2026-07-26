import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { exec, execSync, spawn } from 'child_process';
import { networkInterfaces } from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Path definitions
const DATA_DIR = path.join(__dirname, 'data');
const MACROS_FILE = path.join(DATA_DIR, 'macros.json');
const DECK_FILE = path.join(DATA_DIR, 'deck.json');
const PUBLIC_DIR = path.join(__dirname, 'public');
const LOCAL_SCREENSHOT_PATH = path.join(PUBLIC_DIR, 'screenshot.png');

// Ensure data and public directories exist
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(PUBLIC_DIR)) fs.mkdirSync(PUBLIC_DIR, { recursive: true });

// Initialize files if they don't exist
if (!fs.existsSync(MACROS_FILE)) fs.writeFileSync(MACROS_FILE, JSON.stringify([], null, 2));
if (!fs.existsSync(DECK_FILE)) fs.writeFileSync(DECK_FILE, JSON.stringify([
  { id: 'home', label: 'Home', action: 'key', value: '3', color: 'sapphire' },
  { id: 'back', label: 'Back', action: 'key', value: '4', color: 'sapphire' },
  { id: 'recent', label: 'Recent Apps', action: 'key', value: '187', color: 'sapphire' }
], null, 2));

// ADB Path Auto-Detection
const POSSIBLE_ADB_PATHS = [
  'D:\\Program Files\\Netease\\MuMuPlayer\\nx_main\\adb.exe',
  'C:\\Program Files\\Netease\\MuMuPlayer\\nx_main\\adb.exe',
  'C:\\Program Files (x86)\\Netease\\MuMuPlayer\\nx_main\\adb.exe',
  'adb.exe', // if in local directory
  'adb' // system path
];

let adbPath = 'adb';
for (const p of POSSIBLE_ADB_PATHS) {
  try {
    if (fs.existsSync(p)) {
      adbPath = p;
      console.log(`Detected ADB executable at: ${adbPath}`);
      break;
    }
  } catch (e) {
    // Ignore error
  }
}

// State
let emulatorPort = '127.0.0.1:16384';
let isRunningMacro = false;
let macroLogs = [];
let isStandbyEnabled = true;
let isSolvingCaptcha = false;
let daemonLogs = [];

// Farming Loop State
let isFarmingLoopActive = false;
let farmingLoopStep = 'idle'; // 'idle', 'play', 'captcha', 'reset'
let activeFarmingChildProcess = null;
let selectedPlayMacro = '';
let selectedResetMacro = '';
let farmingLogs = [];

function addFarmingLog(message, type = 'info') {
  const timestamp = new Date().toLocaleTimeString();
  farmingLogs.push({ timestamp, message, type });
  console.log(`[Farming Loop] ${message}`);
  if (farmingLogs.length > 100) farmingLogs.shift();
}

function addDaemonLog(msg) {
  const logMsg = `[${new Date().toLocaleTimeString()}] ${msg}`;
  console.log(logMsg);
  daemonLogs.push(logMsg);
  if (daemonLogs.length > 100) daemonLogs.shift();
}

// Daemon interval (checks every 5 seconds)
setInterval(() => {
  if (!isStandbyEnabled || isSolvingCaptcha || isRunningMacro || isFarmingLoopActive) {
    return;
  }
  
  exec('python "C:/Users/UsEr/.gemini/antigravity/scratch/daemon_check.py"', (error, stdout, stderr) => {
    if (error === null) {
      // Exit code 0 means captcha detected!
      addDaemonLog("⚠️ Captcha detected on screen! Starting auto-solver...");
      isSolvingCaptcha = true;
      
      exec('python "C:/Users/UsEr/.gemini/antigravity/scratch/solve_until_done.py"', (solveErr, solveStdout, solveStderr) => {
        isSolvingCaptcha = false;
        if (solveErr) {
          addDaemonLog(`❌ Solver error: ${solveStderr || solveErr.message}`);
        } else {
          addDaemonLog("✅ Captcha solved successfully!");
        }
      });
    }
  });
}, 5000);

// Farming Loop State Machine Functions
function runFarmingLoopStep() {
  if (!isFarmingLoopActive) {
    farmingLoopStep = 'idle';
    return;
  }
  
  // Start Part 1: Play Game Macro
  farmingLoopStep = 'play';
  addFarmingLog(`Starting play macro: ${selectedPlayMacro}...`, 'info');
  
  fs.writeFileSync('C:/Users/UsEr/.gemini/antigravity/scratch/current_macro.txt', Buffer.from(selectedPlayMacro, 'utf8'));
  activeFarmingChildProcess = spawn('python', [
    "C:/Users/UsEr/.gemini/antigravity/scratch/play_mumu_macro_gui.py",
    "--from-file"
  ]);
  
  activeFarmingChildProcess.stdout.on('data', (data) => {
    const text = data.toString().trim();
    if (text) addFarmingLog(text, 'muted');
  });
  
  activeFarmingChildProcess.stderr.on('data', (data) => {
    const text = data.toString().trim();
    if (text) addFarmingLog(`[Play Macro Error] ${text}`, 'error');
  });
  
  activeFarmingChildProcess.on('close', (code) => {
    activeFarmingChildProcess = null;
    if (!isFarmingLoopActive) return;
    
    addFarmingLog(`Play macro finished. Checking for CAPTCHA...`, 'success');
    
    // Go to Part 2: CAPTCHA Check
    farmingLoopStep = 'captcha';
    checkAndSolveCaptcha();
  });
}

function checkAndSolveCaptcha() {
  addFarmingLog(`Scanning screen for CAPTCHA...`, 'muted');
  
  exec('python "C:/Users/UsEr/.gemini/antigravity/scratch/daemon_check.py"', (error, stdout, stderr) => {
    if (!isFarmingLoopActive) return;
    
    if (error === null) {
      // Captcha detected! Run solver!
      addFarmingLog(`⚠️ CAPTCHA detected! Starting auto-solver...`, 'warn');
      
      activeFarmingChildProcess = exec('python "C:/Users/UsEr/.gemini/antigravity/scratch/solve_until_done.py"');
      
      activeFarmingChildProcess.stdout.on('data', (data) => {
        const text = data.toString().trim();
        if (text) addFarmingLog(text);
      });
      
      activeFarmingChildProcess.stderr.on('data', (data) => {
        const text = data.toString().trim();
        if (text) addFarmingLog(`[Solver Error] ${text}`, 'error');
      });
      
      activeFarmingChildProcess.on('close', (code) => {
        activeFarmingChildProcess = null;
        if (!isFarmingLoopActive) return;
        
        if (code === 0) {
          addFarmingLog(`✅ CAPTCHA solved successfully!`, 'success');
        } else {
          addFarmingLog(`⚠️ CAPTCHA solver ended with code ${code}`, 'warn');
        }
        
        // Go to Part 3: Reset
        startResetMacro();
      });
    } else {
      // No Captcha detected! Go straight to Part 3: Reset
      addFarmingLog(`No CAPTCHA detected. Proceeding to reset macro...`, 'info');
      startResetMacro();
    }
  });
}

function startResetMacro() {
  farmingLoopStep = 'reset';
  addFarmingLog(`Starting reset macro: ${selectedResetMacro}...`, 'info');
  
  fs.writeFileSync('C:/Users/UsEr/.gemini/antigravity/scratch/current_macro.txt', Buffer.from(selectedResetMacro, 'utf8'));
  activeFarmingChildProcess = spawn('python', [
    "C:/Users/UsEr/.gemini/antigravity/scratch/play_mumu_macro_gui.py",
    "--from-file"
  ]);
  
  activeFarmingChildProcess.stdout.on('data', (data) => {
    const text = data.toString().trim();
    if (text) addFarmingLog(text, 'muted');
  });
  
  activeFarmingChildProcess.stderr.on('data', (data) => {
    const text = data.toString().trim();
    if (text) addFarmingLog(`[Reset Macro Error] ${text}`, 'error');
  });
  
  activeFarmingChildProcess.on('close', (code) => {
    activeFarmingChildProcess = null;
    if (!isFarmingLoopActive) return;
    
    addFarmingLog(`Reset macro finished. Restarting farming loop...`, 'success');
    
    // Loop back to Part 1
    farmingLoopStep = 'idle';
    setTimeout(runFarmingLoopStep, 2000); // 2s delay between loops to let emulator settle
  });
}

function stopFarmingLoop() {
  isFarmingLoopActive = false;
  farmingLoopStep = 'idle';
  addFarmingLog(`Farming loop stopped.`, 'warn');
  
  if (activeFarmingChildProcess) {
    try {
      activeFarmingChildProcess.kill();
    } catch (e) {
      console.error("Failed to kill active farming child process:", e);
    }
    activeFarmingChildProcess = null;
  }
}




// Helper function to run ADB commands
function runAdb(args) {
  return new Promise((resolve, reject) => {
    const cmd = `"${adbPath}" ${args}`;
    exec(cmd, (error, stdout, stderr) => {
      if (error) {
        resolve({ success: false, error: stderr.trim() || error.message, stdout: stdout.trim() });
      } else {
        resolve({ success: true, stdout: stdout.trim(), stderr: stderr.trim() });
      }
    });
  });
}

// Sync helper for simple tasks
function runAdbSync(args) {
  try {
    const cmd = `"${adbPath}" ${args}`;
    const stdout = execSync(cmd, { stdio: 'pipe' });
    return { success: true, stdout: stdout.toString().trim() };
  } catch (error) {
    return { success: false, error: error.stderr ? error.stderr.toString().trim() : error.message };
  }
}

// Connect to emulator
async function ensureConnected() {
  console.log(`Connecting to ADB port: ${emulatorPort}`);
  await runAdb(`connect ${emulatorPort}`);
  const devices = await runAdb('devices');
  console.log('Connected devices list:\n', devices.stdout);
  return devices.stdout.includes(emulatorPort);
}

// Sleep helper
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Execute a macro step-by-step
async function executeMacro(steps) {
  isRunningMacro = true;
  macroLogs = [];
  addMacroLog('Macro started execution.');

  try {
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      addMacroLog(`Executing step ${i + 1}/${steps.length}: ${step.type}`);

      switch (step.type) {
        case 'tap':
          const tapRes = await runAdb(`-s ${emulatorPort} shell input tap ${step.x} ${step.y}`);
          addMacroLog(`Tap at (${step.x}, ${step.y}): ${tapRes.success ? 'Success' : 'Failed - ' + tapRes.error}`);
          break;
        case 'swipe':
          const duration = step.duration || 300;
          const swipeRes = await runAdb(`-s ${emulatorPort} shell input swipe ${step.x1} ${step.y1} ${step.x2} ${step.y2} ${duration}`);
          addMacroLog(`Swipe from (${step.x1}, ${step.y1}) to (${step.x2}, ${step.y2}): ${swipeRes.success ? 'Success' : 'Failed - ' + swipeRes.error}`);
          break;
        case 'text':
          // ADB input text spaces are replaced with %s
          const escapedText = step.text.replace(/ /g, '%s');
          const textRes = await runAdb(`-s ${emulatorPort} shell input text "${escapedText}"`);
          addMacroLog(`Type text "${step.text}": ${textRes.success ? 'Success' : 'Failed - ' + textRes.error}`);
          break;
        case 'key':
          const keyRes = await runAdb(`-s ${emulatorPort} shell input keyevent ${step.keycode}`);
          addMacroLog(`Keyevent ${step.keycode}: ${keyRes.success ? 'Success' : 'Failed - ' + keyRes.error}`);
          break;
        case 'wait':
          const delay = step.delay || 1000;
          addMacroLog(`Waiting for ${delay}ms...`);
          await sleep(delay);
          break;
        default:
          addMacroLog(`Unknown step type: ${step.type}`);
      }

      // Small delay between steps to ensure emulator handles them
      await sleep(100);
    }
    addMacroLog('Macro completed successfully.');
  } catch (err) {
    addMacroLog(`Error executing macro: ${err.message}`);
  } finally {
    isRunningMacro = false;
  }
}

function addMacroLog(msg) {
  const logMsg = `[${new Date().toLocaleTimeString()}] ${msg}`;
  console.log(logMsg);
  macroLogs.push(logMsg);
  if (macroLogs.length > 100) macroLogs.shift();
}

// API Routes

// 1. Get status & auto-connect
app.get('/api/status', async (req, res) => {
  const connected = await ensureConnected();
  if (!connected) {
    return res.json({ connected: false, message: `Could not connect to ${emulatorPort}. Make sure MuMu Player is running.` });
  }

  // Get screen size
  const sizeRes = await runAdb(`-s ${emulatorPort} shell wm size`);
  let width = 0, height = 0;
  if (sizeRes.success && sizeRes.stdout) {
    const match = sizeRes.stdout.match(/Physical size: (\d+)x(\d+)/);
    if (match) {
      width = parseInt(match[1]);
      height = parseInt(match[2]);
    }
  }

  // Get model
  const modelRes = await runAdb(`-s ${emulatorPort} shell getprop ro.product.model`);

  res.json({
    connected: true,
    port: emulatorPort,
    device: modelRes.success ? modelRes.stdout : 'Unknown Device',
    resolution: `${width}x${height}`,
    width,
    height,
    adbPath
  });
});

// 2. Configure target port
app.post('/api/connect', async (req, res) => {
  const { port } = req.body;
  if (!port) return res.status(400).json({ error: 'Port is required' });
  
  emulatorPort = port;
  const connected = await ensureConnected();
  res.json({ connected, port: emulatorPort });
});

// 3. Capture screen (Pipes the exec-out binary PNG stream directly from emulator to browser)
app.get('/api/screenshot', (req, res) => {
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  
  const adbProcess = spawn(adbPath, ['-s', emulatorPort, 'exec-out', 'screencap', '-p']);
  adbProcess.stdout.pipe(res);
  
  adbProcess.on('error', (err) => {
    console.error('Screenshot spawn error:', err);
    if (!res.headersSent) {
      res.status(500).end();
    }
  });
});

// 4. Tap action
app.post('/api/tap', async (req, res) => {
  const { x, y } = req.body;
  if (x === undefined || y === undefined) return res.status(400).json({ error: 'x and y coordinates are required' });

  const result = await runAdb(`-s ${emulatorPort} shell input tap ${x} ${y}`);
  res.json(result);
});

// 5. Swipe action
app.post('/api/swipe', async (req, res) => {
  const { x1, y1, x2, y2, duration } = req.body;
  if (x1 === undefined || y1 === undefined || x2 === undefined || y2 === undefined) {
    return res.status(400).json({ error: 'Coordinates x1, y1, x2, y2 are required' });
  }

  const d = duration || 300;
  const result = await runAdb(`-s ${emulatorPort} shell input swipe ${x1} ${y1} ${x2} ${y2} ${d}`);
  res.json(result);
});

// 6. Keyevent action
app.post('/api/key', async (req, res) => {
  const { keycode } = req.body;
  if (keycode === undefined) return res.status(400).json({ error: 'keycode is required' });

  const result = await runAdb(`-s ${emulatorPort} shell input keyevent ${keycode}`);
  res.json(result);
});

// 7. Input Text
app.post('/api/text', async (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'text is required' });

  const escapedText = text.replace(/ /g, '%s');
  const result = await runAdb(`-s ${emulatorPort} shell input text "${escapedText}"`);
  res.json(result);
});

// 8. Custom Shell command
app.post('/api/shell', async (req, res) => {
  const { command } = req.body;
  if (!command) return res.status(400).json({ error: 'command is required' });

  const result = await runAdb(`-s ${emulatorPort} shell ${command}`);
  res.json(result);
});

// 8.5 Solve Captcha using Python script
app.post('/api/solve-captcha', (req, res) => {
  console.log("Triggering Python captcha solver...");
  exec('python "C:/Users/UsEr/.gemini/antigravity/scratch/solve_until_done.py"', (error, stdout, stderr) => {
    if (error) {
      console.error("Solver failed:", stderr || error.message);
      return res.json({ success: false, error: stderr.trim() || error.message });
    }
    console.log("Solver succeeded:", stdout.trim());
    res.json({ success: true, log: stdout.trim() });
  });
});

// 8.6 Captcha Daemon Endpoints
app.get('/api/captcha-daemon', (req, res) => {
  res.json({ enabled: isStandbyEnabled, isSolving: isSolvingCaptcha, logs: daemonLogs });
});

app.post('/api/captcha-daemon/toggle', (req, res) => {
  isStandbyEnabled = !isStandbyEnabled;
  addDaemonLog(`Standby Mode turned ${isStandbyEnabled ? 'ON' : 'OFF'}`);
  res.json({ enabled: isStandbyEnabled, isSolving: isSolvingCaptcha });
});

// 8.7 Farming Loop Endpoints
app.get('/api/mumu-macros', (req, res) => {
  const mumuMacroDir = 'C:/Users/UsEr/AppData/Roaming/Netease/MuMuPlayerGlobal/data/gameScript';
  try {
    if (!fs.existsSync(mumuMacroDir)) {
      return res.json([]);
    }
    const files = fs.readdirSync(mumuMacroDir, { encoding: 'utf8' });
    const mmorFiles = files
      .filter(file => file.endsWith('.mmor'))
      .map(file => file.replace('.mmor', ''));
    // Force UTF-8 charset so Thai names survive JSON transport
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(mmorFiles));
  } catch (err) {
    console.error("Failed to read MuMu macro directory:", err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/farming-loop', (req, res) => {
  res.json({
    active: isFarmingLoopActive,
    step: farmingLoopStep,
    playMacro: selectedPlayMacro,
    resetMacro: selectedResetMacro,
    logs: farmingLogs
  });
});

app.post('/api/farming-loop/toggle', (req, res) => {
  const { playMacro, resetMacro } = req.body;
  
  if (playMacro) selectedPlayMacro = playMacro;
  if (resetMacro) selectedResetMacro = resetMacro;
  
  if (isFarmingLoopActive) {
    stopFarmingLoop();
  } else {
    // Stop coin farming first
    if (isCoinFarmingLoopActive) {
      stopCoinFarmingLoop();
    }
    isFarmingLoopActive = true;
    farmingLoopStep = 'idle';
    addFarmingLog(`Farming loop STARTED. Play: ${selectedPlayMacro}, Reset: ${selectedResetMacro}`, 'success');
    runFarmingLoopStep();
  }
  
  res.json({
    active: isFarmingLoopActive,
    step: farmingLoopStep,
    playMacro: selectedPlayMacro,
    resetMacro: selectedResetMacro
  });
});



app.post('/api/mumu-macros/run', (req, res) => {
  const { macroName } = req.body;
  if (!macroName) return res.status(400).json({ error: 'macroName is required' });
  
  if (isFarmingLoopActive) {
    return res.status(409).json({ error: 'Cannot run manual macro while farming loop is active' });
  }
  
  addFarmingLog(`Manually triggering macro: ${macroName}...`, 'info');
  
  // Write macro name as UTF-8 Buffer to preserve Thai characters
  fs.writeFileSync('C:/Users/UsEr/.gemini/antigravity/scratch/current_macro.txt',
    Buffer.from(macroName, 'utf8'));
  
  const process = spawn('python', [
    "C:/Users/UsEr/.gemini/antigravity/scratch/play_mumu_macro_gui.py",
    "--from-file"
  ]);
  
  process.stdout.on('data', (data) => {
    const text = data.toString('utf8').trim();
    if (text) addFarmingLog(text, 'muted');
  });
  
  process.stderr.on('data', (data) => {
    const text = data.toString('utf8').trim();
    if (text) addFarmingLog(`[Macro Error] ${text}`, 'error');
  });
  
  process.on('close', (code) => {
    addFarmingLog(`Manual macro finished with exit code ${code}`, code === 0 ? 'success' : 'warn');
  });
  
  res.json({ success: true, message: `Macro ${macroName} started` });
});

// 9. Macro Endpoints
app.get('/api/macros', (req, res) => {
  const data = JSON.parse(fs.readFileSync(MACROS_FILE));
  res.json(data);
});

app.post('/api/macros', (req, res) => {
  const macros = req.body;
  if (!Array.isArray(macros)) return res.status(400).json({ error: 'Macros must be an array' });
  
  fs.writeFileSync(MACROS_FILE, JSON.stringify(macros, null, 2));
  res.json({ success: true, count: macros.length });
});

app.get('/api/macros/status', (req, res) => {
  res.json({ isRunning: isRunningMacro, logs: macroLogs });
});

app.post('/api/macros/run', async (req, res) => {
  const { steps } = req.body;
  if (!steps || !Array.isArray(steps)) return res.status(400).json({ error: 'steps array is required' });

  if (isRunningMacro) {
    return res.status(409).json({ error: 'A macro is already running' });
  }

  // Run asynchronously
  executeMacro(steps);

  res.json({ success: true, message: 'Macro started' });
});

// 10. Virtual Deck Endpoints
app.get('/api/deck', (req, res) => {
  const data = JSON.parse(fs.readFileSync(DECK_FILE));
  res.json(data);
});

app.post('/api/deck', (req, res) => {
  const deck = req.body;
  if (!Array.isArray(deck)) return res.status(400).json({ error: 'Deck must be an array' });

  fs.writeFileSync(DECK_FILE, JSON.stringify(deck, null, 2));
  res.json({ success: true });
});

// Serve Frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

// Start Server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`=========================================`);
  console.log(`MuMu Remote Controller Server Started!`);
  console.log(`Local Access: http://localhost:${PORT}`);
  // Print local IP addresses to make phone connection easier
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      // Skip over non-IPv4 and internal (i.e. 127.0.0.1) addresses
      if (net.family === 'IPv4' && !net.internal) {
        console.log(`Network Access: http://${net.address}:${PORT}`);
      }
    }
  }
  console.log(`=========================================`);
});
