import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { exec, spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const SCRATCH_DIR = 'C:/Users/UsEr/.gemini/antigravity/scratch';

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

let isCaptchaSolverActive = false;
let solverLogs = [];
let activeSolverProcess = null;

function addLog(message, type = 'info') {
  const timestamp = new Date().toLocaleTimeString();
  solverLogs.push({ timestamp, message, type });
  console.log(`[CAPTCHA Solver] ${message}`);
  if (solverLogs.length > 100) solverLogs.shift();
}

function startCaptchaSolver() {
  if (isCaptchaSolverActive) return;
  isCaptchaSolverActive = true;
  addLog("🚀 [System] CAPTCHA Auto-Solver System STARTED!", "success");

  // Run solver loop
  function loop() {
    if (!isCaptchaSolverActive) return;

    exec(`python "${SCRATCH_DIR}/daemon_check.py"`, (err, stdout, stderr) => {
      if (!isCaptchaSolverActive) return;

      if (err === null) {
        addLog("⚠️ [CAPTCHA Detected] Found CAPTCHA modal on screen! Launching Auto-Solver...", "warn");
        
        activeSolverProcess = exec(`python "${SCRATCH_DIR}/solve_until_done.py"`);

        activeSolverProcess.stdout.on('data', (d) => {
          const txt = d.toString().trim();
          if (txt) addLog(txt, "muted");
        });

        activeSolverProcess.stderr.on('data', (d) => {
          const txt = d.toString().trim();
          if (txt) addLog(`[Solver Error] ${txt}`, "error");
        });

        activeSolverProcess.on('close', (code) => {
          activeSolverProcess = null;
          if (!isCaptchaSolverActive) return;

          if (code === 0) {
            addLog("✅ [CAPTCHA Solved] CAPTCHA solved successfully!", "success");
          } else {
            addLog(`⚠️ [Solver Ended] Solver finished with code ${code}`, "warn");
          }

          setTimeout(loop, 2000);
        });
      } else {
        setTimeout(loop, 2500);
      }
    });
  }

  loop();
}

function stopCaptchaSolver() {
  isCaptchaSolverActive = false;
  if (activeSolverProcess) {
    try { activeSolverProcess.kill(); } catch (e) {}
    activeSolverProcess = null;
  }
  addLog("🛑 [System] CAPTCHA Auto-Solver System STOPPED.", "warn");
}

// Endpoints
app.get('/api/status', (req, res) => {
  res.json({ connected: true, solverActive: isCaptchaSolverActive });
});

app.get('/api/screenshot', (req, res) => {
  exec(`"${adbPath}" -s 127.0.0.1:16384 exec-out screencap -p`, { encoding: 'buffer', maxBuffer: 10 * 1024 * 1024 }, (err, stdout) => {
    if (err || !stdout) return res.status(500).send('Screenshot error');
    res.contentType('image/png');
    res.send(stdout);
  });
});

app.get('/api/captcha-solver/status', (req, res) => {
  res.json({
    active: isCaptchaSolverActive,
    logs: solverLogs
  });
});

app.post('/api/captcha-solver/toggle', (req, res) => {
  if (isCaptchaSolverActive) {
    stopCaptchaSolver();
  } else {
    startCaptchaSolver();
  }
  res.json({ active: isCaptchaSolverActive });
});

app.post('/api/captcha-solver/solve-once', (req, res) => {
  addLog("⚡ [Manual Trigger] Running 1-Time CAPTCHA Solve...", "info");
  exec(`python "${SCRATCH_DIR}/solve_until_done.py"`, (err, stdout, stderr) => {
    if (err) {
      addLog(`⚠️ Manual Solve Ended: ${err.message}`, "warn");
    } else {
      addLog("✅ Manual CAPTCHA Solve Execution Completed!", "success");
    }
  });
  res.json({ success: true, message: "Manual CAPTCHA Solver triggered" });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`=======================================================`);
  console.log(` Dedicated CAPTCHA Auto-Solver Server Active! `);
  console.log(` Local URL : http://localhost:${PORT} `);
  console.log(` MuMu URL  : http://10.0.2.2:${PORT} `);
  console.log(`=======================================================`);
});
