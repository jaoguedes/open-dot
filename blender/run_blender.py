#!/usr/bin/env python3
# SPDX-License-Identifier: LicenseRef-OpenDot-Mascot-All-Rights-Reserved
"""
Runner portátil do pipeline do Dot (Mac e Windows). Só usa a biblioteca padrão.

  python3 blender/run_blender.py preflight   # versão, exportador glTF, render simples
  python3 blender/run_blender.py build       # constrói, exporta, renderiza e valida
  python3 blender/run_blender.py validate <pasta>

Windows: py -3 blender\\run_blender.py build

Executável do Blender, nesta ordem:
  1. variável BLENDER_BIN
  2. arquivo blender/.blender-path (uma linha, não versionado)
  3. caminhos comuns (/Applications/Blender.app/... no Mac; Program Files no Windows)
O Blender roda com --background --factory-startup: configurações e add-ons pessoais não interferem.
"""
import glob
import json
import os
import platform
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SUPPORTED = ("4.5",)  # Blender 4.5 LTS: última com suporte oficial a Mac Intel (devtalk.blender.org, 2025)


def find_blender():
    env = os.environ.get("BLENDER_BIN")
    if env and os.path.isfile(env):
        return env
    local = os.path.join(HERE, ".blender-path")
    if os.path.isfile(local):
        with open(local, encoding="utf-8") as f:
            p = f.read().strip()
        if os.path.isfile(p):
            return p
    candidates = []
    if platform.system() == "Darwin":
        candidates += ["/Applications/Blender.app/Contents/MacOS/Blender", os.path.expanduser("~/Applications/Blender.app/Contents/MacOS/Blender")]
    elif platform.system() == "Windows":
        pf = os.environ.get("ProgramFiles", r"C:\Program Files")
        candidates += sorted(glob.glob(os.path.join(pf, "Blender Foundation", "Blender 4.5*", "blender.exe")), reverse=True)
        candidates += sorted(glob.glob(os.path.join(pf, "Blender Foundation", "Blender*", "blender.exe")), reverse=True)
    else:
        candidates += ["/usr/bin/blender", "/usr/local/bin/blender", "/snap/bin/blender"]
    for c in candidates:
        if os.path.isfile(c):
            return c
    return None


def blender(bin_path, script, env_extra=None, timeout=900):
    env = {**os.environ, **(env_extra or {})}
    cmd = [bin_path, "--background", "--factory-startup", "--python-exit-code", "1", "--python", script]
    print("$", " ".join(f'"{c}"' if " " in c else c for c in cmd))
    return subprocess.run(cmd, cwd=ROOT, env=env, timeout=timeout)


def version(bin_path):
    out = subprocess.run([bin_path, "--version"], capture_output=True, text=True, timeout=60).stdout
    first = out.strip().splitlines()[0] if out.strip() else "?"
    return first


def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else "preflight"
    if cmd == "validate":
        target = sys.argv[2] if len(sys.argv) > 2 else None
        if not target:
            sys.exit("Informe a pasta de saída.")
        sys.exit(subprocess.run([sys.executable, os.path.join(HERE, "validate_glb.py"), target]).returncode)

    bin_path = find_blender()
    if not bin_path:
        sys.exit("Blender não encontrado. Defina BLENDER_BIN ou crie blender/.blender-path com o caminho do executável.")
    ver = version(bin_path)
    print("Blender:", ver)
    if not any(f"Blender {v}" in ver for v in SUPPORTED):
        print(f"AVISO: versão fora da fixada ({', '.join(SUPPORTED)}). O exportador e o sistema de Actions mudam entre versões.")

    stamp = time.strftime("%Y%m%d-%H%M%S")
    out = os.path.join(HERE, "out", f"{cmd}-{stamp}")
    os.makedirs(out, exist_ok=True)

    if cmd == "preflight":
        r = blender(bin_path, os.path.join(HERE, "preflight.py"), {"DOT_OUT": out}, timeout=300)
        print(open(os.path.join(out, "preflight.json"), encoding="utf-8").read() if os.path.exists(os.path.join(out, "preflight.json")) else "sem relatório")
        sys.exit(r.returncode)

    if cmd == "build":
        r = blender(bin_path, os.path.join(HERE, "build_dot.py"), {"DOT_OUT": out}, timeout=1800)
        if r.returncode != 0:
            sys.exit(f"Build falhou. Veja {os.path.join(out, 'build-report.json')}")
        v = subprocess.run([sys.executable, os.path.join(HERE, "validate_glb.py"), out, "--publish", os.path.join(ROOT, "assets", "dot")])
        summary = {"out": out, "blender": ver, "validate_exit": v.returncode}
        with open(os.path.join(out, "summary.json"), "w", encoding="utf-8") as f:
            json.dump(summary, f, indent=2)
        print(json.dumps(summary, indent=2))
        sys.exit(v.returncode)

    sys.exit(f"Comando desconhecido: {cmd}")


if __name__ == "__main__":
    main()
