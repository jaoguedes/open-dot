# SPDX-License-Identifier: LicenseRef-OpenDot-Mascot-All-Rights-Reserved
"""
Lançador para rodar o pipeline A PARTIR DO BLENDER ABERTO (quando não houver terminal disponível).
No Blender: aba Scripting → console Python → cole e Enter:

    exec(open(__import__("os").path.expanduser("~/open-dot/blender/gui_run_build.py")).read())

Ele registra o ambiente do Mac (macOS, RAM, CPU, Node) em blender/out/mac-info.json e roda
`run_blender.py build` com o Python embutido do Blender (o build roda em segundo plano, --factory-startup).
A interface do Blender fica ocupada por 1–3 minutos.
"""
import json
import os
import subprocess
import sys
import time

ROOT = os.path.expanduser("~/open-dot")
OUT = os.path.join(ROOT, "blender", "out")
os.makedirs(OUT, exist_ok=True)

info = {"at": time.strftime("%Y-%m-%dT%H:%M:%S"), "python": sys.executable}
for key, cmd in {
    "sw_vers": ["sw_vers"],
    "hw": ["sysctl", "-n", "hw.memsize", "hw.ncpu", "machdep.cpu.brand_string"],
    "node": ["/bin/zsh", "-lc", "node -v; npm -v; command -v node"],
    "gpu": ["/bin/zsh", "-lc", "system_profiler SPDisplaysDataType | grep -E 'Chipset|VRAM|Metal' | head -6"],
}.items():
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        info[key] = (r.stdout or r.stderr).strip()
    except Exception as e:  # noqa: BLE001
        info[key] = f"erro: {e}"
with open(os.path.join(OUT, "mac-info.json"), "w", encoding="utf-8") as f:
    json.dump(info, f, ensure_ascii=False, indent=2)

r = subprocess.run([sys.executable, os.path.join(ROOT, "blender", "run_blender.py"), "build"], cwd=ROOT, capture_output=True, text=True, timeout=1800)
log = os.path.join(OUT, "gui-build.log")
with open(log, "w", encoding="utf-8") as f:
    f.write(f"exit={r.returncode}\n--- stdout ---\n{r.stdout}\n--- stderr ---\n{r.stderr}\n")
print(f"Build terminou com código {r.returncode}. Log: {log}")
