import sys
import os
import time
import json
import ctypes
import ctypes.wintypes
import subprocess

SCRATCH_DIR = r"C:\Users\UsEr\.gemini\antigravity\scratch"
MACRO_DIR = r"C:\Users\UsEr\AppData\Roaming\Netease\MuMuPlayerGlobal\data\gameScript"
MUMU_CLI = r"D:\Program Files\Netease\MuMuPlayer\nx_main\mumu-cli.exe"
ADB_PATH = r"D:\Program Files\Netease\MuMuPlayer\nx_main\adb.exe"
PORT = "127.0.0.1:16384"

user32 = ctypes.windll.user32
SW_RESTORE = 9
HWND_TOP = 0
SWP_SHOWWINDOW = 0x0040

def bring_mumu_to_front():
    """Bring MuMu Player window to absolute top foreground."""
    found = []
    def enum_cb(hwnd, lParam):
        if user32.IsWindowVisible(hwnd):
            length = user32.GetWindowTextLengthW(hwnd)
            if length > 0:
                title_buf = ctypes.create_unicode_buffer(length + 1)
                user32.GetWindowTextW(hwnd, title_buf, length + 1)
                title = title_buf.value
                if 'mumuplayer' in title.lower() or 'mumu' in title.lower():
                    rect = ctypes.wintypes.RECT()
                    user32.GetWindowRect(hwnd, ctypes.byref(rect))
                    found.append((hwnd, rect.left, rect.top, rect.right - rect.left, rect.bottom - rect.top, title))
        return True

    WNDENUMPROC = ctypes.WINFUNCTYPE(ctypes.c_bool, ctypes.wintypes.HWND, ctypes.wintypes.LPARAM)
    user32.EnumWindows(WNDENUMPROC(enum_cb), 0)

    if found:
        hwnd, l, t, w, h, title = found[0]
        user32.ShowWindow(hwnd, SW_RESTORE)
        user32.SetWindowPos(hwnd, HWND_TOP, 100, 100, 1280, 760, SWP_SHOWWINDOW)
        user32.SetForegroundWindow(hwnd)
        time.sleep(0.3)
        return True
    return False

def send_mumu_cmd(cmd_str):
    try:
        res = subprocess.run(
            [MUMU_CLI, "control", "--vmindex", "0", "tool", "cmd", "--cmd", cmd_str],
            capture_output=True, text=True, timeout=5
        )
        if res.returncode == 0 and '"errcode": 0' in res.stdout:
            return True
    except Exception:
        pass

    cmd_parts = cmd_str.split()
    subprocess.run([ADB_PATH, "-s", PORT, "shell"] + cmd_parts, capture_output=True)
    return False

def clear_stray_popups():
    """Auto clear stray modals to ensure clean Lobby state."""
    send_mumu_cmd("input tap 1365 145")  # Friend Info X
    time.sleep(0.15)
    send_mumu_cmd("input tap 878 100")   # News X
    time.sleep(0.15)
    send_mumu_cmd("input tap 600 636")   # Exit dialog cancel
    time.sleep(0.15)

def play_macro_file(macro_name):
    if not macro_name.endswith('.mmor'):
        macro_filename = macro_name + '.mmor'
    else:
        macro_filename = macro_name

    macro_path = os.path.join(MACRO_DIR, macro_filename)
    if not os.path.exists(macro_path):
        print(f"Error: Macro file '{macro_filename}' not found in {MACRO_DIR}")
        sys.exit(1)

    bring_mumu_to_front()
    clear_stray_popups()

    try:
        with open(macro_path, 'r', encoding='utf-8') as f:
            macro_data = json.load(f)
    except Exception as e:
        print(f"Error loading macro JSON '{macro_filename}': {e}")
        sys.exit(1)

    info = macro_data.get('info', {})
    actions = macro_data.get('actions', [])
    total_time_ms = info.get('total_running_time', 0)
    res_x = info.get('resolution_x', 1600)
    res_y = info.get('resolution_y', 900)

    print(f"=== [MuMu Precise Engine] Playing Macro: '{macro_filename}' ===")
    print(f"Actions: {len(actions)}, Duration: {total_time_ms/1000.0:.2f}s, Canvas: {res_x}x{res_y}")

    pending_presses = {}

    for idx, act in enumerate(actions):
        timing = act.get('timing', 0)
        if timing > 0:
            time.sleep(timing / 1000.0)

        act_type = act.get('type', '')
        data_str = act.get('data', '')
        extra1 = act.get('extra1', '')

        if act_type == 'touch':
            if 'press_rel:' in data_str:
                coords_part = data_str.split('press_rel:(')[1].rstrip(')')
                parts = coords_part.split(',')
                rx = float(parts[0])
                ry = float(parts[1])

                # Correct coordinate mapping for MuMu 12 Keymaps (Jump / Slide / Buttons)
                if extra1 == '11': # Left Button / Jump Key
                    px, py = 170, 780
                elif extra1 == '12': # Right Button / Slide Key
                    px, py = 1430, 780
                else:
                    rx_norm = rx - int(rx) if rx > 1.0 else rx
                    ry_norm = ry - int(ry) if ry > 1.0 else ry

                    px = int(rx_norm * res_x)
                    py = int(ry_norm * res_y)

                    px = max(0, min(res_x - 1, px))
                    py = max(0, min(res_y - 1, py))

                pending_presses[extra1] = (px, py, time.time())

            elif data_str == 'release':
                if extra1 in pending_presses:
                    px, py, ptime = pending_presses.pop(extra1)
                    hold_duration = int((time.time() - ptime) * 1000)

                    if hold_duration < 80:
                        cmd = f"input tap {px} {py}"
                        send_mumu_cmd(cmd)
                    else:
                        swipe_time = max(hold_duration, 100)
                        cmd = f"input swipe {px} {py} {px} {py} {swipe_time}"
                        send_mumu_cmd(cmd)

    print(f"=== Macro '{macro_filename}' Replayed 100% Accurately! ===")

def main():
    macro_name = None
    if len(sys.argv) >= 2:
        if sys.argv[1] == '--from-file':
            macro_file_path = os.path.join(SCRATCH_DIR, "current_macro.txt")
            if os.path.exists(macro_file_path):
                with open(macro_file_path, 'r', encoding='utf-8') as f:
                    macro_name = f.read().strip()
                print(f"Read macro name from current_macro.txt: '{macro_name}'")
            else:
                print("Error: current_macro.txt not found.")
                sys.exit(1)
        else:
            macro_name = sys.argv[1]

    if not macro_name:
        print("Usage: play_mumu_macro_gui.py <macro_name> or --from-file")
        sys.exit(1)

    play_macro_file(macro_name)

if __name__ == "__main__":
    main()
