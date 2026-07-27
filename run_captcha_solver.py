import sys
import os
import time
import subprocess

SCRATCH_DIR = r"C:\Users\UsEr\.gemini\antigravity\scratch"
DAEMON_CHECK = os.path.join(SCRATCH_DIR, "daemon_check.py")
SOLVER_SCRIPT = os.path.join(SCRATCH_DIR, "solve_until_done.py")

def main():
    print("==================================================")
    print("   CookieRun Classic CAPTCHA Auto Solver Engine   ")
    print("==================================================")
    print("[System] Standalone CAPTCHA Solver Activated!")
    print("[System] Monitoring MuMu Player screen for CAPTCHA modals...\n")

    while True:
        try:
            # 1. Run screen daemon check
            res = subprocess.run([sys.executable, DAEMON_CHECK], capture_output=True, text=True)
            
            if res.returncode == 0:
                print("⚠️  [CAPTCHA DETECTED] CAPTCHA modal found on screen!")
                print("🚀 Launching Auto-Solver Engine...")
                
                # 2. Run solver script until CAPTCHA is solved
                solver_res = subprocess.run([sys.executable, SOLVER_SCRIPT])
                
                if solver_res.returncode == 0:
                    print("✅ [SOLVED] CAPTCHA solved successfully!\n")
                else:
                    print(f"⚠️ [WARNING] CAPTCHA Solver ended with exit code: {solver_res.returncode}\n")
            else:
                print(".", end="", flush=True)

        except KeyboardInterrupt:
            print("\n🛑 Standalone CAPTCHA Solver Stopped by User.")
            break
        except Exception as e:
            print(f"\n[Error] Daemon loop error: {e}")
            time.sleep(2)

        time.sleep(3)

if __name__ == "__main__":
    main()
