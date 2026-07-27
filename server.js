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

const MACRO_DIR = 'C:/Users/UsEr/AppData/Roaming/Netease/MuMuPlayerGlobal/data/gameScript';

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
let selectedPlayMacro = 'oneBox';
let selectedResetMacro = 'Leavetoloby';
let farmingLogs = [];

function addFarmingLog(message, type = 'info') {
  const timestamp = new Date().toLocaleTimeString();
  farmingLogs.push({ timestamp, message, type });
  console.log(`[Farming Loop] ${message}`);
  if (farmingLogs.length > 100) farmingLogs.shift();
}

function formatDuration(ms) {
  if (!ms || ms <= 0) return '0 วินาที';
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec} วินาที`;
  const min = Math.floor(sec / 60);
  const remSec = sec % 60;
  return remSec > 0 ? `${min} นาที ${remSec} วินาที` : `${min} นาที`;
}

// Read Detailed Macro Info
function getDetailedMacros() {
  if (!fs.existsSync(MACRO_DIR)) return [];
  
  const files = fs.readdirSync(MACRO_DIR).filter(f => f.endsWith('.mmor'));
  const list = [];

  for (const f of files) {
    const filePath = path.join(MACRO_DIR, f);
    const cleanName = f.replace('.mmor', '');
    let durationMs = 0;
    let resX = 1600;
    let resY = 900;
    let createTime = 0;

    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const info = data.info || {};
      durationMs = info.total_running_time || 0;
      resX = info.resolution_x || 1600;
      resY = info.resolution_y || 900;
      createTime = info.create_time || 0;
    } catch (e) {}

    list.push({
      filename: f,
      name: cleanName,
      durationMs,
      durationText: formatDuration(durationMs),
      resolution: `${resX} × ${resY}`,
      createTime
    });
  }

  // Sort newest first
  list.sort((a, b) => b.createTime - a.createTime);
  return list;
}

// Pipeline: Part 1 -> Part 2 -> Part 3
function runFarmingLoopStep() {
  if (!isFarmingLoopActive) {
    farmingLoopStep = 'idle';
    return;
  }

  // --- PART 1 ---
  farmingLoopStep = 'part1_play';
  addFarmingLog(`🎮 [Part 1 Started] Playing Macro: '${selectedPlayMacro}'...`, 'info');

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
    runPart2Detection();
  });
}

function runPart2Detection() {
  if (!isFarmingLoopActive) return;

  farmingLoopStep = 'part2_detect';
  addFarmingLog(`🔍 [Part 2 Started] Running Success Detection & CAPTCHA Check...`, 'info');

  exec('python "C:/Users/UsEr/.gemini/antigravity/scratch/daemon_check.py"', (error, stdout, stderr) => {
    if (!isFarmingLoopActive) return;

    if (error === null) {
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
      addFarmingLog(`✅ [Part 2 Verified] Screen state verified clean!`, 'success');
      addFarmingLog(`🏁 [Part 2 Ended] Proceeding to Part 3 (Reset Macro)...`, 'info');
      runPart3Reset();
    }
  });
}

function runPart3Reset() {
  if (!isFarmingLoopActive) return;

  farmingLoopStep = 'part3_reset';
  addFarmingLog(`🔄 [Part 3 Started] Playing Reset Macro: '${selectedResetMacro}'...`, 'info');

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

// Endpoints
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
  const macros = getDetailedMacros();
  res.json(macros);
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

  addFarmingLog(`▶️ Executing macro: '${macroName}'...`, 'info');

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
    if (text) addFarmingLog(`[Macro Error] ${text}`, 'error');
  });

  activeFarmingChildProcess.on('close', (code) => {
    activeFarmingChildProcess = null;
    addFarmingLog(`Macro '${macroName}' finished with exit code ${code}`, code === 0 ? 'success' : 'warn');
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
