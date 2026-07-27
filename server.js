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

const MACRO_DIR = 'C:/Users/UsEr/AppData/Roaming/Netease/MuMuPlayerGlobal/data/gameScript';
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

let activeMacroProcess = null;

function getDetailedMacros() {
  if (!fs.existsSync(MACRO_DIR)) return [];
  const files = fs.readdirSync(MACRO_DIR).filter(f => f.endsWith('.mmor'));
  const list = [];

  for (const f of files) {
    const filePath = path.join(MACRO_DIR, f);
    const cleanName = f.replace('.mmor', '');
    let durationMs = 0;
    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      durationMs = data.info?.total_running_time || 0;
    } catch (e) {}

    list.push({
      filename: f,
      name: cleanName,
      durationText: durationMs > 0 ? `${Math.round(durationMs/1000)}s` : '30s'
    });
  }

  return list;
}

// Endpoints
app.get('/api/status', (req, res) => {
  res.json({ connected: true, device: 'MuMuPlayer' });
});

app.get('/api/screenshot', (req, res) => {
  exec(`"${adbPath}" -s 127.0.0.1:16384 exec-out screencap -p`, { encoding: 'buffer', maxBuffer: 10 * 1024 * 1024 }, (err, stdout) => {
    if (err || !stdout) return res.status(500).send('Screenshot error');
    res.contentType('image/png');
    res.send(stdout);
  });
});

app.get('/api/mumu-macros', (req, res) => {
  res.json(getDetailedMacros());
});

app.post('/api/mumu-macros/run', (req, res) => {
  const { macroName } = req.body;
  if (!macroName) return res.status(400).json({ error: 'macroName is required' });

  console.log(`[API] Executing macro: '${macroName}'...`);
  fs.writeFileSync(path.join(SCRATCH_DIR, 'current_macro.txt'), Buffer.from(macroName, 'utf8'));

  if (activeMacroProcess) {
    try { activeMacroProcess.kill(); } catch (e) {}
  }

  activeMacroProcess = spawn('python', [
    path.join(SCRATCH_DIR, 'play_mumu_macro_gui.py'),
    '--from-file'
  ]);

  activeMacroProcess.stdout.on('data', (d) => console.log(`[Python] ${d.toString().trim()}`));
  activeMacroProcess.stderr.on('data', (d) => console.error(`[Python Err] ${d.toString().trim()}`));

  res.json({ success: true, message: `Macro '${macroName}' started` });
});

app.get('/api/farming-loop', (req, res) => {
  res.json({ active: false, step: 'idle', logs: [] });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`=========================================`);
  console.log(` MuMu Remote Controller Server Active! `);
  console.log(` Local URL: http://localhost:${PORT} `);
  console.log(` MuMu URL : http://10.0.2.2:${PORT} `);
  console.log(`=========================================`);
});
