import sys
import os
import time
import json
import subprocess

SCRATCH_DIR = r"C:\Users\UsEr\.gemini\antigravity\scratch"
MACRO_DIR = r"C:\Users\UsEr\AppData\Roaming\Netease\MuMuPlayerGlobal\data\gameScript"
MUMU_CLI = r"D:\Program Files\Netease\MuMuPlayer\nx_main\mumu-cli.exe"
ADB_PATH = r"D:\Program Files\Netease\MuMuPlayer\nx_main\adb.exe"
PORT = "127.0.0.1:16384"

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

def play_macro_file(macro_name):
    if not macro_name.endswith('.mmor'):
        macro_filename = macro_name + '.mmor'
    else:
        macro_filename = macro_name

    macro_path = os.path.join(MACRO_DIR, macro_filename)
    if not os.path.exists(macro_path):
        print(f"Error: Macro file '{macro_filename}' not found in {MACRO_DIR}")
        return False

    try:
        with open(macro_path, 'r', encoding='utf-8') as f:
            macro_data = json.load(f)
    except Exception as e:
        print(f"Error loading macro JSON '{macro_filename}': {e}")
        return False

    info = macro_data.get('info', {})
    actions = macro_data.get('actions', [])
    res_x = info.get('resolution_x', 1600)
    res_y = info.get('resolution_y', 900)

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

    return True
