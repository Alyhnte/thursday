"""The film's music and sound, made from oscillators and noise: 120 BPM in D major, a quiet
start under the call, a drop when the office lands, a groove under her lines, a hit on DONE and
an open ending under the card. Writes out/stems/music.wav, out/stems/sfx.wav and
out/stems/music-sfx-ducked.wav (the film's own track: both, ducked under her voice slots) at 48 kHz."""
import json
import os

import numpy as np
from scipy import signal
from scipy.io import wavfile

ROOT = os.path.dirname(os.path.abspath(__file__))
TL = json.load(open(os.path.join(ROOT, "timeline.json")))
SR = 48000
DUR = float(TL["duration"])
N = int(SR * DUR)
BEAT = 60.0 / TL["bpm"]
BAR = 4 * BEAT
rng = np.random.default_rng(7)


def T(d):
    return np.arange(int(d * SR)) / SR


def midi(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def stereo():
    return np.zeros((N, 2))


# The score after the call was written two seconds later than the film now plays it: an
# event placed at 7 s or after lands two seconds earlier (see web/main.js CUT and SHIFT).
def M(at):
    return at - 2.0 if at >= 7.0 else at


def put(buf, x, at, gain=1.0, pan=0.0):
    _put(buf, x, M(at), gain, pan)


def _put(buf, x, at, gain=1.0, pan=0.0):
    """Mono or stereo x into buf at film time `at`, equal-power panned."""
    i = int(round(at * SR))
    if i >= N or len(x) == 0:
        return
    if i < 0:
        x = x[-i:]
        i = 0
    j = min(N, i + len(x))
    th = (pan + 1) * np.pi / 4
    if x.ndim == 1:
        buf[i:j, 0] += x[: j - i] * gain * np.cos(th) * np.sqrt(2)
        buf[i:j, 1] += x[: j - i] * gain * np.sin(th) * np.sqrt(2)
    else:
        buf[i:j] += x[: j - i] * gain


def lp(x, f, order=2):
    b, a = signal.butter(order, min(f, SR * 0.45), "low", fs=SR)
    return signal.lfilter(b, a, x, axis=0)


def hp(x, f, order=2):
    b, a = signal.butter(order, f, "high", fs=SR)
    return signal.lfilter(b, a, x, axis=0)


def bp(x, lo, hi, order=2):
    b, a = signal.butter(order, [lo, min(hi, SR * 0.45)], "bandpass", fs=SR)
    return signal.lfilter(b, a, x, axis=0)


def saw(f, t, phase=0.0):
    """Band-limited saw by its harmonics."""
    out = np.zeros_like(t)
    k = 1
    while k * f < 14000:
        out += np.sin(2 * np.pi * k * f * t + phase * k) / k
        k += 1
    return out * (2 / np.pi)


def adsr(n, a, d, s, r, hold):
    t = np.arange(n) / SR
    env = np.where(t < a, t / max(a, 1e-4), s + (1 - s) * np.exp(-(t - a) / max(d, 1e-4)))
    rel = t > hold
    env[rel] *= np.exp(-(t[rel] - hold) / max(r, 1e-4))
    return env


# ------------------------------------------------------------------ instruments
def kick(level=1.0):
    t = T(0.5)
    f = 52 + 150 * np.exp(-t * 32)
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 8)
    x += 0.45 * np.sin(2 * np.pi * 118 * t) * np.exp(-t * 26)
    x += 0.5 * hp(rng.standard_normal(len(t)), 2500) * np.exp(-t * 400)
    return np.tanh(x * 1.6) * 0.6 * level


def clap():
    t = T(0.45)
    n = bp(rng.standard_normal(len(t)), 900, 3200)
    env = np.zeros(len(t))
    for o in (0.0, 0.009, 0.019, 0.028):
        env += (t >= o) * np.exp(-np.clip(t - o, 0, None) * 230)
    env += 0.55 * (t >= 0.032) * np.exp(-np.clip(t - 0.032, 0, None) * 14)
    return n * env * 1.3


def hat(open_=False):
    t = T(0.32 if open_ else 0.06)
    # metal: six squares at unrelated pitches, then only the top of it
    fs = [205.3, 304.4, 369.6, 522.7, 540.0, 800.0]
    m = sum(signal.square(2 * np.pi * f * 1.9 * t) for f in fs)
    x = hp(m + 0.6 * rng.standard_normal(len(t)), 7500, 3)
    return x * np.exp(-t * (9 if open_ else 70)) * 0.12


def crash(d=2.4):
    t = T(d)
    fs = [205.3, 304.4, 369.6, 522.7, 540.0, 800.0]
    m = sum(signal.square(2 * np.pi * f * 2.7 * t) for f in fs)
    x = hp(m * 0.5 + rng.standard_normal(len(t)), 4500, 2)
    return x * np.exp(-t * 2.2) * 0.12


def bass(m, d):
    t = T(d + 0.05)
    f = midi(m)
    x = 0.8 * saw(f, t) + 0.35 * np.sin(2 * np.pi * f * t)
    bright = lp(x, 2600)
    dark = lp(x, 750)
    e = np.exp(-t * 10)
    x = bright * e + dark * (1 - e)
    return np.tanh(x * adsr(len(t), 0.004, 0.25, 0.6, 0.04, d) * 1.4) * 0.5


def pluck(notes, d=0.5, bright=4200):
    t = T(d + 0.4)
    x = np.zeros((len(t), 2))
    for m in notes:
        f = midi(m)
        for det, ch in ((-0.09, 0), (0.09, 1), (0.0, None)):
            v = saw(f * 2 ** (det / 12), t, rng.uniform(0, 6))
            if ch is None:
                x += v[:, None] * 0.5
            else:
                x[:, ch] += v
    b = lp(x, bright)
    dk = lp(x, 700)
    e = np.exp(-t * 14)[:, None]
    x = b * e + dk * (1 - e)
    env = adsr(len(t), 0.003, 0.18, 0.18, 0.1, d)[:, None]
    return x * env * 0.12 / len(notes) ** 0.5


def pad(notes, d, attack=0.5, release=0.9, cutoff=1500):
    t = T(d + release * 2)
    x = np.zeros((len(t), 2))
    for m in notes:
        f = midi(m)
        for det, ch in ((-0.11, 0), (0.07, 0), (0.11, 1), (-0.06, 1)):
            x[:, ch] += saw(f * 2 ** (det / 12), t, rng.uniform(0, 6))
    x = lp(x, cutoff, 2)
    env = adsr(len(t), attack, 1.0, 1.0, release, d)[:, None]
    return x * env * 0.05 / len(notes) ** 0.5


def bell(m, d=1.4, index=2.2, ratio=3.5):
    t = T(d)
    f = midi(m)
    I = index * np.exp(-t * 7)
    x = np.sin(2 * np.pi * f * t + I * np.sin(2 * np.pi * f * ratio * t))
    x += 0.35 * np.sin(2 * np.pi * f * 2 * t) * np.exp(-t * 5)
    return x * np.exp(-t * 3.2) * np.minimum(1, t / 0.002) * 0.16


def mallet(m, d=0.6):
    t = T(d)
    f = midi(m)
    x = np.sin(2 * np.pi * f * t) + 0.25 * np.sin(2 * np.pi * f * 3.98 * t) * np.exp(-t * 30)
    return x * np.exp(-t * 7) * np.minimum(1, t / 0.0015) * 0.2


def piano(m, d=2.5, vel=1.0):
    t = T(d)
    f = midi(m)
    B = 0.00035
    x = np.zeros(len(t))
    for n in range(1, 11):
        fn = n * f * np.sqrt(1 + B * n * n)
        if fn > 16000:
            break
        x += np.sin(2 * np.pi * fn * t + rng.uniform(0, 6)) / n ** 1.25 * np.exp(-t * (0.7 + 0.45 * n) * (1.2 - 0.4 * vel))
    x += 0.2 * lp(rng.standard_normal(len(t)), 2500) * np.exp(-t * 90)
    x = lp(x, 1800 + 2500 * vel)
    return x * np.minimum(1, t / 0.004) * 0.16 * vel


def sub_drop(d=1.6, f0=70, f1=30):
    t = T(d)
    f = f1 + (f0 - f1) * np.exp(-t * 3)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 2.2) * 0.8


def noise_sweep(d, f0, f1, q=1.6, shape="up"):
    """Filtered noise whose band slides from f0 to f1, in short blocks."""
    n = int(d * SR)
    x = rng.standard_normal(n)
    out = np.zeros(n)
    blk = 512
    zi = None
    for i in range(0, n, blk):
        u = i / n
        f = f0 * (f1 / f0) ** u
        lo = max(40, f / q)
        hi = min(SR * 0.45, f * q)
        b, a = signal.butter(2, [lo, hi], "bandpass", fs=SR)
        if zi is None:
            zi = signal.lfilter_zi(b, a) * 0
        seg, zi = signal.lfilter(b, a, x[i : i + blk], zi=zi)
        out[i : i + blk] = seg
    t = np.arange(n) / n
    if shape == "up":
        env = t ** 2.2
    elif shape == "swell":
        env = np.sin(np.pi * t) ** 1.5
    else:
        env = (1 - t) ** 2
    return out * env


def whoosh(d=0.45, f0=500, f1=4000, gain=0.35):
    return noise_sweep(d, f0, f1, 1.8, "swell") * gain


def pop(f0=900, f1=260, d=0.12, gain=0.25):
    t = T(d)
    f = f1 + (f0 - f1) * np.exp(-t * 45)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 28) * gain


def tock(m, gain=0.22):
    t = T(0.12)
    f = midi(m)
    x = np.sin(2 * np.pi * f * t) + 0.4 * np.sin(2 * np.pi * f * 2.76 * t) * np.exp(-t * 60)
    return x * np.exp(-t * 38) * gain


def whistle(d, f0, f1, gain=0.08):
    t = T(d)
    f = f0 * (f1 / f0) ** (t / d)
    x = np.sin(2 * np.pi * np.cumsum(f) / SR)
    env = np.minimum(1, t / 0.15) * np.minimum(1, (d - t) / 0.05)
    return x * env * gain


def reverb(x, rt=1.8, pre=0.02, damp=5000, seed=3):
    r = np.random.default_rng(seed)
    n = int(rt * SR)
    t = np.arange(n) / SR
    tau = rt / 6.9
    ir = r.standard_normal((n, 2)) * np.exp(-t / tau)[:, None]
    ir = lp(ir, damp)
    ir[: int(pre * SR)] = 0
    ir /= np.sqrt((ir**2).sum(axis=0))
    wet = np.stack([signal.fftconvolve(x[:, c], ir[:, c])[: len(x)] for c in range(2)], axis=1)
    return wet


# ------------------------------------------------------------------ the score
D, E, Fs, G_, A, B, Cs = 62, 64, 66, 67, 69, 71, 73  # D4 and up
CH = {
    "D": [D, Fs, A, E + 12],
    "A": [A - 12, Cs, E, B],
    "Bm": [B - 12, D, Fs, A],
    "G": [G_ - 12, B - 12, D, Fs],
    "Asus": [A - 12, D, E, B],
}
ROOT_ = {"D": 38, "A": 33, "Bm": 35, "G": 31, "Asus": 33}
# bar starts (s) to chord
PROG = []
for bar in range(12):
    PROG.append((bar * BAR, ["D", "A", "Bm", "G"][bar % 4]))
PROG += [(24.0, "D"), (26.0, "Bm"), (27.0, "G"), (28.0, "Asus"), (29.0, "A"), (30.0, "D")]


def chord_at(t):
    c = PROG[0][1]
    for at, name in PROG:
        if t >= at:
            c = name
    return c


music = stereo()
drums = stereo()
send = stereo()  # to the reverb
kicks = []

# -- intro, under the call (0 to 6, film time): felt piano and a pad, a pulse creeping in
for bar in range(3):
    at = bar * BAR
    name = ["D", "A", "Bm"][bar]
    notes = CH[name]
    p = pad(notes, BAR if bar < 2 else 1.5, attack=0.7, release=1.0, cutoff=1100 + bar * 300)
    _put(music, p, at, 1.4)
    pattern = [0, 2, 1, 3, 2, 1] if bar % 2 == 0 else [0, 1, 3, 2, 1, 2]
    for k, idx in enumerate(pattern):
        tt = at + k * BEAT * 2 / 3
        if tt >= 4.9:
            break
        m = notes[idx] + (12 if idx >= 2 and bar >= 1 else 0)
        pk = piano(m, 2.2, 0.55 + 0.15 * (k == 0))
        _put(music, pk, tt, 1.5, pan=(-0.25 if k % 2 else 0.25))
        _put(send, pk, tt, 0.7)
    _put(music, piano(ROOT_[name] + 12, 3.0, 0.7), at, 0.7)
for i in range(int(1.0 / (BEAT / 2)), int(4.75 / (BEAT / 2))):
    _put(drums, hat(), i * BEAT / 2, 0.25 if i % 2 else 0.12, pan=0.3)
for i in range(int(2.0 / BEAT), int(4.75 / BEAT)):
    if i % 2 == 0:
        _put(drums, kick(0.45), i * BEAT, 0.6)
# the fall and the riser into the drop (4.5 to 6)
_put(music, noise_sweep(1.5, 300, 9000, 1.6, "up") * 0.22, 4.5)
_put(send, noise_sweep(1.5, 300, 9000, 1.6, "up") * 0.2, 4.5)
_put(music, whistle(1.0, 1800, 260, 0.05), 5.0)

# -- the groove (8 to 24)
for bar in range(4, 12):
    at = bar * BAR
    name = chord_at(at + 0.01)
    notes = CH[name]
    root = ROOT_[name]
    # drums: four on the floor, claps on two and four, hats between
    for b_ in range(4):
        tt = at + b_ * BEAT
        put(drums, kick(), tt, 0.95)
        kicks.append(M(tt))
        if b_ in (1, 3):
            c = clap()
            put(drums, c, tt, 0.75)
            put(send, c, tt, 0.35)
        put(drums, hat(True), tt + BEAT / 2, 0.8, pan=0.2)
        for s16 in (1, 3):
            put(drums, hat(), tt + s16 * BEAT / 4, 0.7, pan=-0.25)
    # bass: roots with a push before each beat
    pat = [(0, 0.35, 0), (0.75, 0.2, 12), (1.0, 0.35, 0), (1.75, 0.2, 12), (2.0, 0.35, 0), (2.5, 0.2, 7), (3.0, 0.35, 0), (3.5, 0.4, 12)]
    for beat, d, iv in pat:
        put(music, bass(root + iv, d * BEAT * 2), at + beat * BEAT, 0.9)
    # chord stabs on the offbeats
    for beat in (0.5, 1.5, 2.5, 3.25):
        pl = pluck(notes, 0.3)
        put(music, pl, at + beat * BEAT, 1.9)
        put(send, pl, at + beat * BEAT, 0.5)
    # a pad underneath, quieter
    put(music, pad(notes, BAR, attack=0.2, release=0.3, cutoff=1800), at, 1.0)

# a bell motif high up, answering in the gaps between her lines
MOTIF = {
    "D": [(0, 78), (0.5, 81), (1.0, 83), (1.5, 81)],
    "A": [(0, 76), (0.5, 78), (1.0, 81), (1.5, 78)],
    "Bm": [(0, 74), (0.5, 78), (1.0, 83), (1.5, 81)],
    "G": [(0, 79), (0.5, 83), (1.0, 81), (1.5, 78)],
}
for bar in range(4, 12):
    at = bar * BAR
    name = chord_at(at + 0.01)
    for beat, m in MOTIF[name]:
        bl = bell(m + 12, 1.2, 1.6)
        put(music, bl, at + 2 * BEAT + beat * BEAT, 1.3, pan=0.35)
        put(send, bl, at + 2 * BEAT + beat * BEAT, 0.8)

# fills into the montage and into DONE
for k in range(8):
    put(drums, clap(), 19.5 + k * BEAT / 8, 0.18 + 0.03 * k)
put(music, noise_sweep(1.0, 400, 10000, 1.5, "up") * 0.25, 23.0)
put(send, noise_sweep(1.0, 400, 10000, 1.5, "up") * 0.2, 23.0)
# a filter rising through the montage: the stabs doubled an octave up
for i in range(8):
    tt = 20.0 + i * BEAT
    name = chord_at(tt)
    put(music, pluck([m + 12 for m in CH[name][:3]], 0.2, 2500 + i * 700), tt + BEAT / 2, 0.5)

# -- DONE (24): the hit, then a lighter bounce under her last line
put(drums, kick(1.2), 24.0, 1.0)
put(music, sub_drop(1.8), 24.0, 0.7)
cr = crash(2.6)
put(drums, cr, 24.0, 1.0)
put(send, cr, 24.0, 0.5)
for b_ in range(2, 12):
    tt = 24.0 + b_ * BEAT / 2
    if tt >= 26.9:
        break
    if b_ % 2 == 0:
        put(drums, kick(0.7), tt, 0.6)
        kicks.append(M(tt))
    put(drums, hat(), tt + BEAT / 4, 0.35, pan=0.3)
for at, name, d in [(24.0, "D", 2.0), (26.0, "Bm", 1.0)]:
    put(music, pad(CH[name], d, attack=0.05, release=0.8, cutoff=2200), at, 0.9)
    for k in range(int(d / (BEAT / 2))):
        m = CH[name][k % 4] + 12
        mt = mallet(m, 0.5)
        put(music, mt, at + k * BEAT / 2, 0.6, pan=(-0.3 if k % 2 else 0.3))
        put(send, mt, at + k * BEAT / 2, 0.5)
put(music, noise_sweep(0.6, 600, 12000, 1.4, "up") * 0.25, 26.4)

# -- the card (27 to 32): open, all of it, then ringing out
put(drums, kick(1.1), 27.0, 0.9)
cr = crash(3.5)
put(drums, cr, 27.0, 0.8)
put(send, cr, 27.0, 0.6)
put(music, sub_drop(2.0, 60, 32), 27.0, 0.5)
for at, name, d in [(27.0, "G", 1.0), (28.0, "Asus", 1.0), (29.0, "A", 1.0), (30.0, "D", 2.0)]:
    p = pad(CH[name], d, attack=0.03, release=1.4 if at == 30.0 else 0.4, cutoff=2600)
    put(music, p, at, 1.0)
    put(send, p, at, 0.6)
    put(music, bass(ROOT_[name], d * 0.95), at, 0.8)
    put(music, piano(ROOT_[name] + 24, 2.5, 0.9), at, 0.8)
# the tune, played out once there is nothing to talk over
TUNE = [(27.0, 83), (27.25, 81), (27.5, 79), (27.75, 78), (28.0, 81), (28.5, 78), (28.75, 76), (29.0, 76), (29.25, 78), (29.5, 81), (29.75, 83), (30.0, 86)]
for at, m in TUNE:
    bl = bell(m, 1.8 if at == 30.0 else 1.0, 1.8)
    put(music, bl, at, 0.9, pan=0.15)
    put(send, bl, at, 0.9)
    put(music, piano(m - 12, 1.8, 0.8), at, 0.55, pan=-0.2)
for i in range(int((30.0 - 27.0) / (BEAT / 2))):
    tt = 27.0 + i * BEAT / 2
    if i % 2 == 0:
        put(drums, kick(0.9), tt, 0.8)
        kicks.append(M(tt))
    else:
        put(drums, hat(True), tt, 0.4)
    if i % 4 == 2:
        put(drums, clap(), tt - BEAT / 2 + BEAT, 0.35)
put(drums, kick(1.0), 30.0, 0.9)
cr = crash(3.0)
put(drums, cr, 30.0, 0.6)
put(send, cr, 30.0, 0.5)

# ------------------------------------------------------------------ sounds on the picture
sfx = stereo()
fx_send = stereo()
# her dot appears, the user's words, her words, the hand-off
_put(sfx, pop(700, 1400, 0.16, 0.18), 0.08)
_put(fx_send, pop(700, 1400, 0.16, 0.18), 0.08, 0.6)
_put(sfx, pop(520, 1040, 0.1, 0.07), 0.45)
_put(sfx, pop(620, 1240, 0.1, 0.07), 2.5)
for k in range(3):
    _put(sfx, tock(96 + 3 * k, 0.07), 3.85 + k * 0.05, pan=0.2)
# the fall and the landing
put(sfx, whistle(1.0, 2200, 300, 0.06), 7.0, pan=-0.1)
put(sfx, pop(260, 70, 0.4, 0.55), 8.0)
put(sfx, sub_drop(0.9, 90, 35), 8.0, 0.5)
put(fx_send, pop(900, 300, 0.2, 0.3), 8.0, 1.0)
# the office landing, piece by piece, each a step up the scale
lands = [8.0, 8.05, 8.12, 8.2, 8.24, 8.3, 8.37, 8.42, 8.44, 8.51, 8.58, 8.65]
scale = [62, 64, 66, 69, 71, 74, 76, 78, 81, 83, 86, 88]
for k, (tt, m) in enumerate(zip(lands, scale)):
    put(sfx, tock(m, 0.13), tt + 0.12, pan=((k % 3) - 1) * 0.4)
# her hops to the window
for tt, m in [(8.9, 79), (9.45, 83)]:
    put(sfx, pop(1300, 500, 0.1, 0.12), tt)
# the bots pop in
for k in range(6):
    b = pop(500 + 90 * k, 1500 + 150 * k, 0.12, 0.13)
    put(sfx, b, 9.0 + k * 0.1 + 0.05, pan=(-0.5 + 0.2 * k))
    put(fx_send, b, 9.0 + k * 0.1 + 0.05, 0.4)
# the work handed out, and each answer back
for k in range(5):
    put(sfx, whoosh(0.5, 800, 5000, 0.07), 9.55 + k * 0.09, pan=0.1 * k)
for k in range(5):
    put(sfx, whoosh(0.8, 600, 6000, 0.08), 19.98 + k * 0.07, pan=0.5 - 0.2 * k)
    put(sfx, whoosh(0.6, 700, 6000, 0.06), 22.4 + k * 0.11, pan=0.4 - 0.2 * k)
# cuts
for tt, g in [(10.0, 0.1), (12.0, 0.1), (14.0, 0.1), (16.0, 0.12), (18.0, 0.12), (20.0, 0.18), (21.0, 0.1), (21.5, 0.1)]:
    put(sfx, whoosh(0.35, 700, 5000, g), tt - 0.18)
put(sfx, pop(160, 60, 0.25, 0.35), 17.0)  # the writer's punch-in
# hops (the ones on screen)
for tt in [10.5, 12.5, 14.5, 16.5, 22.0, 22.25, 22.5, 23.0]:
    put(sfx, pop(420, 900, 0.1, 0.06), tt, pan=0.2)
# the designer's flip: a sparkle
for k, m in enumerate([86, 90, 93, 98, 102]):
    put(sfx, bell(m, 0.6, 1.2) * 0.8, 18.95 + k * 0.06, pan=-0.3 + 0.15 * k)
    put(fx_send, bell(m, 0.6, 1.2) * 0.8, 18.95 + k * 0.06, 0.8)
# the clock racing
for k in range(10):
    put(sfx, tock(100, 0.05), 21.0 + k * 0.05, pan=-0.3)
# her giggle: four little bounces on the counter
for k in range(4):
    put(sfx, pop(700 + 60 * k, 1100 + 80 * k, 0.07, 0.07), 22.85 + k * 0.137)
# up and away
put(sfx, noise_sweep(0.55, 300, 5000, 1.5, "swell") * 0.3, 23.45)
# DONE painted on
put(sfx, noise_sweep(0.55, 1200, 3000, 2.5, "swell") * 0.25, 24.05, pan=0.3)
# laptops shutting, ticks on trays
for k in range(6):
    put(sfx, tock(57 + (k % 2) * 2, 0.1), 24.1 + k * 0.08, pan=-0.3 + 0.12 * k)
for k in range(5):
    put(sfx, tock(91 + 2 * k, 0.05), 24.25 + k * 0.08)
# cheers
for base in (24.55, 25.55):
    for k in range(6):
        put(sfx, pop(500 + 70 * k, 1300 + 90 * k, 0.1, 0.06), base + k * 0.05, pan=-0.5 + 0.2 * k)
# into the white, the card
put(sfx, noise_sweep(0.6, 400, 9000, 1.5, "up") * 0.25, 26.4)
put(sfx, pop(700, 1400, 0.18, 0.2), 27.05)
put(fx_send, pop(700, 1400, 0.18, 0.2), 27.05, 0.8)
put(sfx, whoosh(0.5, 900, 4000, 0.08), 27.5)
put(sfx, pop(1400, 900, 0.08, 0.1), 27.6)
put(sfx, tock(93, 0.08), 29.6)

# ------------------------------------------------------------------ mix
t = np.arange(N) / SR
# the kick pushes the rest down a little
side = np.ones(N)
for k in kicks:
    i = int(k * SR)
    j = min(N, i + int(0.3 * SR))
    tt = np.arange(j - i) / SR
    side[i:j] = np.minimum(side[i:j], 1 - 0.45 * np.exp(-tt * 12))
music *= side[:, None]

hall = reverb(send, 2.2, 0.03, 5500) * 0.32
room = reverb(fx_send, 1.2, 0.015, 7000, seed=5) * 0.3
music_bus = music + hall + drums
sfx_bus = sfx + room

# under her voice: music down, sounds a little down
duck = np.ones(N)
for line in TL["lines"]:
    a, b = line["at"] - 0.1, line["end"] + 0.15
    rise = np.clip((t - a) / 0.12, 0, 1)
    fall = np.clip((b + 0.35 - t) / 0.35, 0, 1)
    shape = np.minimum(rise, fall)
    duck = np.minimum(duck, 1 - 0.5 * shape)
music_ducked = music_bus * duck[:, None]
sfx_ducked = sfx_bus * (0.6 + 0.4 * duck)[:, None]

# start and end cleanly
fade = np.clip((DUR - t) / 1.2, 0, 1) ** 1.5
fade_in = np.clip(t / 0.02, 0, 1)
for x in (music_bus, sfx_bus, music_ducked, sfx_ducked):
    x *= (fade * fade_in)[:, None]

os.makedirs(os.path.join(ROOT, "out", "stems"), exist_ok=True)


def write(name, x, peak=0.89):
    x = hp(x, 25, 2)
    m = np.max(np.abs(x))
    x = x * (peak / m) if m > peak else x
    wavfile.write(os.path.join(ROOT, name), SR, (x * 32767).astype(np.int16))
    return m


def soft_limit(x, ceiling=0.9):
    return ceiling * np.tanh(x / ceiling)


mix = soft_limit((music_ducked * 0.8 + sfx_ducked * 0.9) * 0.9)
print("peaks:", write("out/stems/music.wav", soft_limit(music_bus * 0.8)), write("out/stems/sfx.wav", soft_limit(sfx_bus * 0.9)), write("out/stems/music-sfx-ducked.wav", mix))
