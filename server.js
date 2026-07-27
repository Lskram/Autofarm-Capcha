import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { exec, spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Detect ADB Executable
const adbCandidates = [
  'D:\\Program Files\\Netease\\MuMuPlayer\\nx_main\\adb.exe',
  'C:\\Program Files\\Netease\\MuMuPlayer\\nx_main\\adb.exe',
  'adb'
];

let adbPath = 'adb';
for (const p of adbCandidates) {
  try {
    if (fs.existsSync(p)) {
      adbPath = p;
      console.log(`Detected ADB executable at: ${adbPath}`);
      break;
    }
  } catch (e) {}
}

let isFarmingLoopActive = false;
let farmingLoopStep = 'idle'; // 'idle', 'part1_play', 'part2_detect', 'part3_reset'
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

// ----------------------------------------------------
// Farming Loop Sequential Pipeline (Part 1 -> Part 2 -> Part 3)
// ----------------------------------------------------

function runFarmingLoopStep() {
  if (!isFarmingLoopActive) {
    farmingLoopStep = 'idle';
    return;
  }

  // --- PART 1: Play Game Macro ---
  farmingLoopStep = 'part1_play';
  addFarmingLog(`🎮 [Part 1] Starting Play Macro: '${selectedPlayMacro}' via 3-dots Operation Recorder...`, 'info');

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
    if (text) addFarmingLog(`[Part 1 Error] ${text}`, 'error');
  });

  activeFarmingChildProcess.on('close', (code) => {
    activeFarmingChildProcess = null;
    if (!isFarmingLoopActive) return;

    addFarmingLog(`✅ [Part 1 Completed] Play macro finished. Transitioning to Part 2...`, 'success');
    
    // Proceed to PART 2 only after Part 1 finishes!
    runPart2Detection();
  });
}

// --- PART 2: Detection & Success Verification ---
function runPart2Detection() {
  if (!isFarmingLoopActive) return;

  farmingLoopStep = 'part2_detect';
  addFarmingLog(`🔍 [Part 2 Started] Running Success Detection & CAPTCHA Check...`, 'info');

  exec('python "C:/Users/UsEr/.gemini/antigravity/scratch/daemon_check.py"', (error, stdout, stderr) => {
    if (!isFarmingLoopActive) return;

    if (error === null) {
      // CAPTCHA detected! Run solver
      addFarmingLog(`⚠️ [Part 2 Detection] CAPTCHA detected! Running auto-solver...`, 'warn');

      activeFarmingChildProcess = exec('python "C:/Users/UsEr/.gemini/antigravity/scratch/solve_until_done.py"');

      activeFarmingChildProcess.stdout.on('data', (data) => {
        const text = data.toString().trim();
        if (text) addFarmingLog(text, 'muted');
      });

      activeFarmingChildProcess.stderr.on('data', (data) => {
        const text = data.toString().trim();
        if (text) addFarmingLog(`[Solver Error] ${text}`, 'error');
      });

      activeFarmingChildProcess.on('close', (code) => {
        activeFarmingChildProcess = null;
        if (!isFarmingLoopActive) return;

        if (code === 0) {
          addFarmingLog(`✅ [Part 2 Verified] CAPTCHA solved successfully!`, 'success');
        } else {
          addFarmingLog(`⚠️ [Part 2 Verified] CAPTCHA solver ended with code ${code}`, 'warn');
        }

        addFarmingLog(`🏁 [Part 2 Ended] Proceeding to Part 3 (Reset Macro)...`, 'success');
        runPart3Reset();
      });
    } else {
      // No CAPTCHA detected, Part 2 success verified
      addFarmingLog(`✅ [Part 2 Verified] No CAPTCHA detected. Screen state verified clean!`, 'success');
      addFarmingLog(`🏁 [Part 2 Ended] Proceeding to Part 3 (Reset Macro)...`, 'info');
      runPart3Reset();
    }
  });
}

// --- PART 3: Reset Macro / Leave to Lobby ---
function runPart3Reset() {
  if (!isFarmingLoopActive) return;

  farmingLoopStep = 'part3_reset';
  addFarmingLog(`🔄 [Part 3 Started] Running Reset Macro: '${selectedResetMacro}' via 3-dots Operation Recorder...`, 'info');

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
    if (text) addFarmingLog(`[Part 3 Error] ${text}`, 'error');
  });

  activeFarmingChildProcess.on('close', (code) => {
    activeFarmingChildProcess = null;
    if (!isFarmingLoopActive) return;

    addFarmingLog(`✅ [Part 3 Completed] Reset Macro finished. Restarting Farming Loop...`, 'success');

    // Loop back to Part 1
    setTimeout(() => {
      if (isFarmingLoopActive) runFarmingLoopStep();
    }, 1500);
  });
}

function stopFarmingLoop() {
  isFarmingLoopActive = false;
  farmingLoopStep = 'idle';
  if (activeFarmingChildProcess) {
    try { activeFarmingChildProcess.kill(); } catch (e) {}
    activeFarmingChildProcess = null;
  }
  addFarmingLog(`🛑 Farming Loop STOPPED.`, 'warn');
}

// API Endpoints
app.get('/api/status', (req, res) => {
  res.json({ connected: true });
});

app.get('/api/screenshot', (req, res) => {
  exec(`"${adbPath}" -s 127.0.0.1:16384 exec-out screencap -p`, { encoding: 'buffer', maxBuffer: 10 * 1024 * 1024 }, (err, stdout) => {
    if (err || !stdout) return res.status(500).send('Screenshot error');
    res.contentType('image/png');
    res.send(stdout);
  });
});

app.get('/api/mumu-macros', (req, res) => {
  const macroDir = 'C:/Users/UsEr/AppData/Roaming/Netease/MuMuPlayerGlobal/data/gameScript';
  try {
    if (!fs.existsSync(macroDir)) return res.json([]);
    const files = fs.readdirSync(macroDir);
    const macros = files
      .filter(f => f.endsWith('.mmor'))
      .map(f => f.replace('.mmor', ''))
      .sort((a, b) => a.localeCompare(b, 'th'));
    res.json(macros);
  } catch (err) {
    res.status(500).json({ error: 'Failed to list macros' });
  }
});

app.post('/api/mumu-macros/run', (req, res) => {
  const { macroName } = req.body;
  if (!macroName) return res.status(400).json({ error: 'macroName is required' });

  if (isFarmingLoopActive) {
    return res.status(409).json({ error: 'Cannot run manual macro while farming loop is ON' });
  }

  if (activeFarmingChildProcess) {
    try { activeFarmingChildProcess.kill(); } catch (e) {}
    activeFarmingChildProcess = null;
  }

  addFarmingLog(`Manually triggering macro: '${macroName}'...`, 'info');

  fs.writeFileSync('C:/Users/UsEr/.gemini/antigravity/scratch/current_macro.txt', Buffer.from(macroName, 'utf8'));

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
    if (text) addFarmingLog(`[Manual Macro Error] ${text}`, 'error');
  });

  activeFarmingChildProcess.on('close', (code) => {
    activeFarmingChildProcess = null;
    addFarmingLog(`Manual macro finished with exit code ${code}`, code === 0 ? 'success' : 'warn');
  });

  res.json({ success: true, message: `Macro '${macroName}' started` });
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
    isFarmingLoopActive = true;
    farmingLoopStep = 'idle';
    addFarmingLog(`🚀 Farming Loop STARTED! Play: '${selectedPlayMacro}', Reset: '${selectedResetMacro}'`, 'success');
    runFarmingLoopStep();
  }

  res.json({
    active: isFarmingLoopActive,
    step: farmingLoopStep,
    playMacro: selectedPlayMacro,
    resetMacro: selectedResetMacro
  });
});

app.listen(PORT, () => {
  console.log(`=========================================`);
  console.log(` MuMu Farming Controller Server Active! `);
  console.log(` Local URL: http://localhost:${PORT} `);
  console.log(`=========================================`);
});
