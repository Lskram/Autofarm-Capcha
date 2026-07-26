# MuMu Player Web Remote Controller

A premium, glassmorphic web application dashboard to remotely control your Netease MuMu Player 12 Android Emulator. It provides a real-time remote screen viewport supporting live mouse pointer taps and drag-swipes, quick navigation keys, text inputs, a macro playbook builder, a custom Stream Deck shortcuts grid, and an ADB command console.

## Features

- **Live Remote Screen View**: Real-time screen mirroring (renders using emulator screenshots).
- **Interactive Control**: Tap on the screen to tap on the emulator. Drag to swipe.
- **Quick Actions Layout**: Back, Home, Recent Apps, Volume Control, and Power toggles.
- **Macro Sequence Builder**: Save combinations of taps, swipes, inputs, and delays. Running macros executes directly on the backend server for millisecond accuracy.
- **Coordinate Capture**: When building macros, clicking or dragging on the Screen Viewport automatically populates the X and Y coordinates in the builder!
- **Virtual Stream Deck**: A 3x5 grid of customized macros, text typing, or keycodes. Style buttons with neon colors (sapphire, emerald, ruby, etc.). Load it on a second monitor, phone, or tablet to use it as a remote game controller.
- **ADB Command terminal**: Run ADB shell commands and inspect standard output directly in the web UI.

---

## Getting Started

### 1. Requirements

- **Node.js**: Version 18 or newer (tested with v24).
- **MuMu Player**: Make sure MuMu Player (specifically version 12) is running on your PC.

### 2. Startup

1. Open your terminal in this directory.
2. Run the start command:
   ```bash
   npm start
   ```
3. Open your browser to:
   - Local: `http://localhost:3000`
   - Mobile / Tablet: `http://<your-pc-ip-address>:3000` (The console will output the exact link to use!)

---

## Configuration

### ADB Port Auto-detection
The server will attempt to auto-detect the path of `adb.exe` inside your Netease installation directory and connect to `127.0.0.1:16384` (the default port of MuMu Player 12).
If your emulator is running on a different port, you can change it directly in the top header input box of the web application and click **Connect**.

### Saving Data
Saved macros and stream deck layouts are stored as standard JSON documents inside the `./data/` folder:
- `./data/macros.json`
- `./data/deck.json`

Feel free to back them up or share them with others!

---

## Developer Operations

### Sending Actions from other applications
The backend server exposes simple REST API endpoints that can be integrated with other automated systems (AutoHotkey, Python scripts, etc.):

- **Tap**: `POST http://localhost:3000/api/tap` with JSON `{"x": 500, "y": 800}`
- **Swipe**: `POST http://localhost:3000/api/swipe` with JSON `{"x1": 100, "y1": 500, "x2": 800, "y2": 500, "duration": 200}`
- **Keyevent**: `POST http://localhost:3000/api/key` with JSON `{"keycode": 4}` (e.g. Back key)
- **Send Text**: `POST http://localhost:3000/api/text` with JSON `{"text": "my text input"}`
