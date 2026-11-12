"""Lift the Steel Ball sounds out of the reference montage.
usage: python -I tools/extract_sbr_audio.py videos/special/InShot_20261112_133246086.mp4 assets/audio/sbr

spin_loop.wav  the pulsed Spin tone, isolated by keeping only its narrow partials (everything
               else in the mix is filtered away), made loopable with a crossfade
throw.wav      the gold-comet roar, band-limited, with the music lines removed (harmonic/noise split)
activate.wav   the activation shimmer, band-passed above the voice range, with fades
"""
import os, subprocess, sys, wave
import numpy as np
from scipy import signal
from scipy.ndimage import median_filter

src, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
SR = 44100


def load(t0, t1):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-ss", str(t0), "-t", str(t1 - t0), "-i", src,
                          "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"], capture_output=True).stdout
    return np.frombuffer(raw, dtype=np.float32).astype(np.float64)


def save(name, x, peak_db=-3.0):
    x = x / (np.abs(x).max() + 1e-12) * 10 ** (peak_db / 20)
    with wave.open(os.path.join(out, name), "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((np.clip(x, -1, 1) * 32767).astype(np.int16).tobytes())
    print(f"{name:14s} {len(x) / SR:5.2f} s")


def fades(x, a, b):
    n = len(x); ia, ib = int(a * SR), int(b * SR)
    env = np.ones(n)
    env[:ia] = np.sin(np.linspace(0, np.pi / 2, ia)) ** 2
    env[n - ib:] = np.cos(np.linspace(0, np.pi / 2, ib)) ** 2
    return x * env


def band(x, lo, hi, order=4):
    sos = signal.butter(order, [lo / (SR / 2), hi / (SR / 2)], "band", output="sos")
    return signal.sosfiltfilt(sos, x)


def level(x, f, bw=12):
    return 20 * np.log10(np.sqrt(np.mean(band(x, f - bw, f + bw, 2) ** 2)) + 1e-12)


# ---- spin loop: the cleanest stretch of the tone (67.4-69.1 s), partials only
x = load(67.55, 69.05)
partials = [493, 626, 848, 900, 990, 1696, 2502, 2955]
mix_db = 20 * np.log10(np.sqrt(np.mean(x ** 2)) + 1e-12)
print("partial levels in the source (dBFS, full mix %.1f):" % mix_db)
tone = np.zeros_like(x)
for f in partials:
    lv = level(x, f)
    print(f"   {f:5d} Hz  {lv:6.1f}")
    if lv > mix_db - 34:                      # keep only partials that clearly stand out
        tone += band(x, f - 11, f + 11, 3)
# loop: crossfade the last 0.3 s over the first 0.3 s (equal power)
L = int(0.3 * SR)
body, tail = tone[:-L].copy(), tone[-L:]
w = np.linspace(0, np.pi / 2, L)
body[:L] = body[:L] * np.sin(w) + tail * np.cos(w)
save("spin_loop.wav", body, -6)
# residual check: how much of the loop is broadband rather than tone
resid = tone - sum(band(tone, f - 11, f + 11, 3) for f in partials)
print("   residual outside partials: %.1f dB below the tone" % (20 * np.log10(np.sqrt(np.mean(tone ** 2)) / (np.sqrt(np.mean(resid ** 2)) + 1e-12))))

# ---- throw roar (64.4-66.0 s): sound design only in this stretch, no voice harmonics
r = load(64.40, 66.02)
r = signal.sosfiltfilt(signal.butter(2, 90 / (SR / 2), "high", output="sos"), r)
r = signal.sosfiltfilt(signal.butter(2, 12000 / (SR / 2), "low", output="sos"), r)
# music under the roar shows as steady horizontal lines; keep only the broadband part
f, t, Z = signal.stft(r, SR, nperseg=2048, noverlap=1536)
M = np.abs(Z)
Hm, Pm = median_filter(M, size=(1, 17)), median_filter(M, size=(17, 1))
_, r2 = signal.istft(Z * Pm**2 / (Pm**2 + Hm**2 + 1e-12), SR, nperseg=2048, noverlap=1536)
save("throw.wav", fades(r2[:len(r)], 0.03, 0.35), -3)

# ---- activation shimmer (42.33-42.98 s), above the voice range under it
a = load(42.33, 42.98)
save("activate.wav", fades(band(a, 900, 6000), 0.06, 0.25), -6)
