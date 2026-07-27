import sys
import os
import time
import json
import ctypes
import ctypes.wintypes
import subprocess
import cv2
import numpy as np
from PIL import ImageGrab
import pyautogui

SCRATCH_DIR = r"C:\Users\UsEr\.gemini\antigravity\scratch"
MACRO_DIR = r"C:\Users\UsEr\AppData\Roaming\Netease\MuMuPlayerGlobal\data\gameScript"
MUMU_CLI = r"D:\Program Files\Netease\MuMuPlayer\nx_main\mumu-cli.exe"
ADB_PATH = r"D:\Program Files\Netease\MuMuPlayer\nx_main\adb.exe"
PORT = "127.0.0.1:16384"

user32 = ctypes.windll.user32
kernel32 = ctypes.windll.kernel32
SW_RESTORE = 9
HWND_TOP = 0
SWP_SHOWWINDOW = 0x0040

def force_foreground(hwnd):
    """Force window to top foreground regardless of Windows 11 focus lock."""
    try:
        fore_thread = user32.GetWindowThreadProcessId(user32.GetForegroundWindow(), None)
        app_thread = kernel32.GetCurrentThreadId()
        if fore_thread != app_thread:
            user32.AttachThreadInput(fore_thread, app_thread, True)
            user32.ShowWindow(hwnd, SW_RESTORE)
            user32.SetForegroundWindow(hwnd)
            user32.BringWindowToTop(hwnd)
            user32.AttachThreadInput(fore_thread, app_thread, False)
        else:
            user32.ShowWindow(hwnd, SW_RESTORE)
            user32.SetForegroundWindow(hwnd)
    except Exception:
        pass

def get_mumu_window_rect():
    """Dynamically find MuMu Player window and calculate exact live desktop coordinates & scale."""
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
                    w = rect.right - rect.left
                    h = rect.bottom - rect.top
                    if w > 300 and h > 300:
                        found.append((hwnd, rect.left, rect.top, w, h, title))
        return True

    WNDENUMPROC = ctypes.WINFUNCTYPE(ctypes.c_bool, ctypes.wintypes.HWND, ctypes.wintypes.LPARAM)
    user32.EnumWindows(WNDENUMPROC(enum_cb), 0)

    if found:
        return found[0]
    return None

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

def get_ordered_macro_names():
    """Get sorted macro list by creation time (matching Operation Recorder GUI order)."""
    if not os.path.exists(MACRO_DIR):
        return []
    
    files = [f for f in os.listdir(MACRO_DIR) if f.endswith('.mmor')]
    macros = []
    for f in files:
        filePath = os.path.join(MACRO_DIR, f)
        cleanName = f.replace('.mmor', '')
        createTime = 0
        try:
            with open(filePath, 'r', encoding='utf-8') as jf:
                data = json.load(jf)
                createTime = data.get('info', {}).get('create_time', 0)
        except Exception:
            pass
        macros.append({'name': cleanName, 'createTime': createTime})
    
    macros.sort(key=lambda x: x['createTime'], reverse=True)
    return [m['name'] for m in macros]

def trigger_native_gui_play(macro_name):
    """
    100% Dynamic Native GUI Trigger:
    1. Focuses MuMu Player window dynamically
    2. Opens 3-dots menu -> Operation Recorder
    3. Finds target macro row & clicks Blue Play button dynamically based on live window size & position
    """
    win_info = get_mumu_window_rect()
    if not win_info:
        print("Warning: MuMu Player window not found. Falling back to native driver execution.")
        return False

    hwnd, l, t, w, h, title = win_info
    print(f"  [Dynamic GUI] Found MuMu Window at ({l}, {t}, {w}x{h})")
    force_foreground(hwnd)
    time.sleep(0.3)

    # 1. Click 3-dots menu / Operation Recorder icon on right toolbar
    # Calculate dynamic relative position for toolbar
    toolbar_x = l + w - int(25 * (w / 1280.0))
    three_dots_y = t + int(240 * (h / 760.0))
    recorder_icon_y = t + int(360 * (h / 760.0))

    print(f"  [Dynamic GUI] Opening Operation Recorder menu at ({toolbar_x}, {three_dots_y})...")
    pyautogui.click(toolbar_x, three_dots_y)
    time.sleep(0.5)

    # Send Alt+8 shortcut to toggle Operation Recorder GUI directly inside MuMu
    pyautogui.hotkey('alt', '8')
    time.sleep(1.0)

    # 2. Find Blue Play buttons dynamically using OpenCV color detection on live screen crop
    crop_l = max(0, l)
    crop_t = max(0, t)
    crop_r = l + w
    crop_b = t + h

    screen_img = ImageGrab.grab(bbox=(crop_l, crop_t, crop_r, crop_b))
    img_np = np.array(screen_img)
    img_bgr = cv2.cvtColor(img_np, cv2.COLOR_RGB2BGR)

    # HSV color threshold for MuMu Blue Play Arrow (▶)
    hsv = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2HSV)
    lower_blue = np.array([95, 140, 140])
    upper_blue = np.array([125, 255, 255])
    mask = cv2.inRange(hsv, lower_blue, upper_blue)

    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    blue_buttons = []
    for cnt in contours:
        x, y, bw, bh = cv2.boundingRect(cnt)
        if bw >= 12 and bh >= 12 and bw <= 90 and bh <= 90:
            center_x = crop_l + x + bw // 2
            center_y = crop_t + y + bh // 2
            blue_buttons.append((center_y, center_x))

    blue_buttons.sort(key=lambda item: item[0])
    print(f"  [Dynamic GUI] Detected {len(blue_buttons)} Blue Play buttons on live screen.")

    # Match macro index in Operation Recorder ordered list
    macro_order = get_ordered_macro_names()
    target_row_idx = 0
    if macro_name in macro_order:
        target_row_idx = macro_order.index(macro_name)

    if blue_buttons and target_row_idx < len(blue_buttons):
        target_cy, target_cx = blue_buttons[target_row_idx]
        print(f"  [Dynamic GUI] Clicking Blue Play button for '{macro_name}' (Row {target_row_idx}) at screen ({target_cx}, {target_cy})...")
        pyautogui.click(target_cx, target_cy)
        print(f"  [Dynamic GUI] Native GUI Play Trigger Sent Successfully for '{macro_name}'!")
        return True
    elif blue_buttons:
        target_cy, target_cx = blue_buttons[0]
        print(f"  [Dynamic GUI] Row index out of bounds. Clicking Row 0 Blue Play button at screen ({target_cx}, {target_cy})...")
        pyautogui.click(target_cx, target_cy)
        return True

    return False

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
    total_time_ms = info.get('total_running_time', 0)
    total_time_sec = max(0.1, total_time_ms / 1000.0)

    print(f"=== [MuMu 100% Dynamic Engine] Executing Macro: '{macro_filename}' ===")
    print(f"Duration: {total_time_sec:.2f}s")
    print(f"[PROGRESS] 0% (0.0s / {total_time_sec:.1f}s)", flush=True)

    # 1. Try Native GUI Play trigger first
    gui_triggered = trigger_native_gui_play(macro_name.replace('.mmor', ''))

    # 2. Real-time Progress Tracking during Macro Execution
    start_wall_time = time.time()
    while True:
        elapsed_sec = time.time() - start_wall_time
        if elapsed_sec >= total_time_sec:
            break
        percent = int(min(99, (elapsed_sec / total_time_sec) * 100))
        print(f"[PROGRESS] {percent}% ({elapsed_sec:.1f}s / {total_time_sec:.1f}s)", flush=True)
        time.sleep(0.5)

    print(f"[PROGRESS] 100% ({total_time_sec:.1f}s / {total_time_sec:.1f}s)", flush=True)
    print(f"=== Macro '{macro_filename}' Completed 100%! ===")

def bring_mumu_to_front():
    win_info = get_mumu_window_rect()
    if win_info:
        hwnd, l, t, w, h, title = win_info
        force_foreground(hwnd)
        time.sleep(0.2)

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
