#!/usr/bin/env python3
# SPDX-License-Identifier: LicenseRef-OpenDot-Mascot-All-Rights-Reserved
"""
Gera os sons do Dot (originais, sintetizados do zero: nada foi copiado de outro projeto).

Uso:  python3 scripts/sounds/make_dot_sounds.py <pasta_de_saida>
Requer: numpy, scipy e ffmpeg (para MP3).

Estilo: marimba/bolha suave, notas curtas, sem agudos duros. Pico em -8 dBFS;
o app toca com volume padrão 0,25. Todos terminam com fade para não estalar.
Licença: mesma do código do projeto (os sons são do Open Dot).
"""
import subprocess
import sys
from pathlib import Path

import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, lfilter

SR = 44100


def env(n, attack=0.004, decay=0.18, sustain=0.0, release=0.03):
    """Envelope exponencial curto, com ataque rápido e fade final."""
    t = np.arange(n) / SR
    a = np.minimum(1.0, t / max(attack, 1e-4))
    d = sustain + (1 - sustain) * np.exp(-t / max(decay, 1e-4))
    e = a * d
    r = int(release * SR)
    if r > 0 and r < n:
        e[-r:] *= np.linspace(1, 0, r)
    return e


def glide(f0, f1, n, curve=1.0):
    t = np.linspace(0, 1, n) ** curve
    return f0 + (f1 - f0) * t


def osc(freq, n, harmonics=((1, 1.0), (2, 0.28), (3, 0.10), (4.2, 0.05))):
    """Marimba/bolha: fundamental + parciais. freq: número ou array de frequências."""
    f = np.full(n, freq, dtype=float) if np.isscalar(freq) else freq
    phase = 2 * np.pi * np.cumsum(f) / SR
    out = np.zeros(n)
    for mult, amp in harmonics:
        out += amp * np.sin(phase * mult)
    return out


def lowpass(x, hz=5200):
    b, a = butter(2, hz / (SR / 2))
    return lfilter(b, a, x)


def note(freq, dur, decay=0.16, attack=0.004, harmonics=None, gain=1.0, sustain=0.0):
    n = int(dur * SR)
    h = harmonics if harmonics else ((1, 1.0), (2, 0.28), (3, 0.10), (4.2, 0.05))
    return gain * osc(freq, n, h) * env(n, attack=attack, decay=decay, sustain=sustain)


def place(parts, total):
    """parts: lista de (inicio_em_segundos, sinal). Mistura numa trilha única."""
    out = np.zeros(int(total * SR))
    for start, sig in parts:
        i = int(start * SR)
        j = min(len(out), i + len(sig))
        out[i:j] += sig[: j - i]
    return out


def tremolo(x, rate=6.0, depth=0.25):
    t = np.arange(len(x)) / SR
    return x * (1 - depth + depth * np.sin(2 * np.pi * rate * t))


def click(dur=0.012, gain=0.5):
    n = int(dur * SR)
    rng = np.random.default_rng(7)
    return gain * rng.standard_normal(n) * np.exp(-np.arange(n) / (n / 4))


# Notas (Hz)
C4, D4, E4, G4, A4 = 261.63, 293.66, 329.63, 392.00, 440.00
C5, D5, E5, G5, A5, B5 = 523.25, 587.33, 659.25, 783.99, 880.00, 987.77
C6, E6 = 1046.50, 1318.51


def s_hello():
    return place([(0.00, note(G4, 0.35, decay=0.14)), (0.13, note(C5, 0.40, decay=0.18)), (0.28, note(E5, 0.55, decay=0.22, gain=0.9))], 0.9)


def s_think():
    n = int(0.45 * SR)
    f = glide(330, 392, n) * (1 + 0.012 * np.sin(2 * np.pi * 7 * np.arange(n) / SR))
    return osc(f, n, ((1, 1.0), (2, 0.12))) * env(n, attack=0.05, decay=0.25, sustain=0.1, release=0.12) * 0.7


def s_done():
    return place([(0.00, note(E5, 0.3, decay=0.12)), (0.09, note(G5, 0.3, decay=0.12)), (0.18, note(C6, 0.55, decay=0.22, gain=0.9)), (0.18, note(E6, 0.4, decay=0.14, gain=0.18))], 0.85)


def s_attention():
    return place([(0.00, note(A5, 0.32, decay=0.14)), (0.20, note(E5, 0.55, decay=0.24, gain=0.95))], 0.9)


def s_error():
    n = int(0.5 * SR)
    f = glide(G4, D4 * 0.98, n, curve=0.8)
    sig = osc(f, n, ((1, 1.0), (2, 0.18), (3, 0.05))) * env(n, attack=0.01, decay=0.30, release=0.08)
    sig2 = osc(f * 1.006, n, ((1, 0.5),)) * env(n, attack=0.01, decay=0.30, release=0.08)
    return lowpass(sig + sig2, 3200) * 0.8


def s_send():
    n = int(0.14 * SR)
    return osc(glide(620, 940, n, 0.7), n, ((1, 1.0), (2, 0.2))) * env(n, attack=0.003, decay=0.06, release=0.04)


def s_receive():
    n = int(0.22 * SR)
    f = np.concatenate([glide(820, 520, n // 2), glide(520, 700, n - n // 2)])
    return osc(f, n, ((1, 1.0), (2, 0.2))) * env(n, attack=0.004, decay=0.10, release=0.05)


def s_tap():
    n = int(0.07 * SR)
    return osc(glide(900, 560, n), n, ((1, 1.0),)) * env(n, attack=0.001, decay=0.02, release=0.02) * 0.8


def s_love():
    a = note(E5, 0.7, decay=0.40, attack=0.02, sustain=0.08)
    b = note(G5, 0.7, decay=0.40, attack=0.02, sustain=0.08, gain=0.7)
    return tremolo(place([(0.0, a), (0.05, b)], 0.8), rate=5.5, depth=0.22)


def s_sleep():
    return place([(0.00, note(G4, 0.5, decay=0.30, attack=0.02, gain=0.7)), (0.32, note(E4, 0.5, decay=0.32, attack=0.02, gain=0.6)), (0.66, note(C4, 0.7, decay=0.40, attack=0.02, gain=0.5))], 1.4)


def s_pop():
    n = int(0.11 * SR)
    return osc(glide(420, 1250, n, 0.6), n, ((1, 1.0), (2, 0.15))) * env(n, attack=0.002, decay=0.04, release=0.03)


def s_close():
    n = int(0.11 * SR)
    return osc(glide(1000, 380, n, 0.8), n, ((1, 1.0), (2, 0.15))) * env(n, attack=0.002, decay=0.05, release=0.03)


def s_notify():
    return place([(0.0, note(B5, 0.5, decay=0.22, harmonics=((1, 1.0), (2.0, 0.22), (2.76, 0.12), (5.4, 0.04)))), (0.0, note(E5, 0.45, decay=0.20, gain=0.35))], 0.6)


SOUNDS = {
    "dot-hello": s_hello,
    "dot-think": s_think,
    "dot-done": s_done,
    "dot-attention": s_attention,
    "dot-error": s_error,
    "dot-send": s_send,
    "dot-receive": s_receive,
    "dot-tap": s_tap,
    "dot-love": s_love,
    "dot-sleep": s_sleep,
    "dot-pop": s_pop,
    "dot-close": s_close,
    "dot-notify": s_notify,
}


def finish(x):
    x = lowpass(x, 6000)
    fade = int(0.012 * SR)
    x[:int(0.002 * SR)] *= np.linspace(0, 1, int(0.002 * SR))
    x[-fade:] *= np.linspace(1, 0, fade)
    peak = np.max(np.abs(x)) or 1.0
    x = x / peak * (10 ** (-8 / 20))  # pico em -8 dBFS
    return (x * 32767).astype(np.int16)


def main(out_dir):
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    for name, fn in SOUNDS.items():
        wav = out / f"{name}.wav"
        wavfile.write(wav, SR, finish(fn().astype(float)))
        mp3 = out / f"{name}.mp3"
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(wav), "-codec:a", "libmp3lame", "-b:a", "80k", "-ac", "1", str(mp3)], check=True)
        wav.unlink()
        print(f"{name}.mp3  {mp3.stat().st_size / 1024:.1f} KB")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "dot-sounds-out")
