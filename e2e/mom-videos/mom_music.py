"""Calm, warm background music for the mothers' feature videos, timed to beats.json (intro, success, outro).
Soft pads and a gentle plucked arpeggio in C major at 76 BPM, no drums; a chime on each success; a warm ending.
Usage: mom_music.py beats.json duration_s out.wav"""
import json, sys, wave
import numpy as np
from scipy.signal import fftconvolve

SR = 44100
beats = json.load(open(sys.argv[1])); DUR = float(sys.argv[2]); OUT = sys.argv[3]
n = int((DUR + 3) * SR)
L = np.zeros(n, np.float32); R = np.zeros(n, np.float32); SEND = np.zeros(n, np.float32)
rng = np.random.default_rng(3)
B = 60 / 76

def hz(note):
    k = {"C": -9, "D": -7, "E": -5, "F": -4, "G": -2, "A": 0, "B": 2}[note[0]] + (1 if "#" in note else 0)
    return 440 * 2 ** ((k + 12 * (int(note[-1]) - 4)) / 12)

def env(m, a, r):
    e = np.ones(m, np.float32); a, r = int(a * SR), int(r * SR)
    if a: e[:a] = 0.5 - 0.5 * np.cos(np.linspace(0, np.pi, a))
    if r: e[-r:] *= 0.5 + 0.5 * np.cos(np.linspace(0, np.pi, r))
    return e

def add(sig, t, pan=0.5, amp=1.0, send=0.3):
    s = int(t * SR)
    if s >= n or s < 0: return
    m = min(len(sig), n - s); x = (sig[:m] * amp).astype(np.float32)
    L[s:s + m] += x * np.sqrt(1 - pan); R[s:s + m] += x * np.sqrt(pan); SEND[s:s + m] += x * send

def pad(notes, t, d, amp=0.04):
    m = int(d * SR); tt = np.arange(m) / SR; w = np.zeros(m)
    for nt in notes:
        f = hz(nt)
        for det in (-0.003, 0.003): w += np.sin(2 * np.pi * f * (1 + det) * tt + rng.uniform(0, 6)) + 0.12 * np.sin(4 * np.pi * f * tt)
    add(w * env(m, 1.0, 1.4) / (2 * len(notes)), t, 0.5, amp, 0.6)

def pluck(nt, t, amp=0.035, pan=0.5):
    m = int(1.8 * SR); tt = np.arange(m) / SR; f = hz(nt)
    w = (np.sin(2 * np.pi * f * tt) + 0.4 * np.sin(4 * np.pi * f * tt) * np.exp(-tt * 6)) * np.exp(-tt * 2.6)
    add(w * env(m, 0.004, 0.2), t, pan, amp, 0.45)

def chime(nt, t, amp=0.05, pan=0.5):
    m = int(2.2 * SR); tt = np.arange(m) / SR; f = hz(nt)
    w = (np.sin(2 * np.pi * f * tt) + 0.35 * np.sin(2 * np.pi * f * 2.76 * tt) * np.exp(-tt * 7)) * np.exp(-tt * 2.2)
    add(w * env(m, 0.002, 0.2), t, pan, amp, 0.7)

CH = {"C": (["C3", "G3", "E4"], ["C4", "E4", "G4", "C5"]), "Am": (["A2", "E3", "C4"], ["A3", "C4", "E4", "A4"]),
      "F": (["F2", "C3", "A3"], ["F3", "A3", "C4", "F4"]), "G": (["G2", "D3", "B3"], ["G3", "B3", "D4", "G4"])}
outro = next((b["t"] for b in beats if b["kind"] == "outro"), DUR - 5)
t, k = 0.0, 0
while t < outro:
    name = ["C", "Am", "F", "G"][k % 4]; p, arp = CH[name]
    pad(p, t, 4 * B + 1.2, 0.05)
    for i in range(8):
        tt = t + i * B / 2
        if tt < outro and (i % 2 == 0 or k % 2): pluck(arp[[0, 1, 2, 3, 2, 1, 2, 3][i]], tt, 0.026 if i % 2 else 0.032, 0.35 + 0.08 * (i % 4))
    t += 4 * B; k += 1
for b in beats:
    if b["kind"] == "intro":
        for i, nt in enumerate(["C5", "E5", "G5", "C6"]): chime(nt, b["t"] + 0.4 + i * 0.13, 0.04, 0.3 + 0.13 * i)
    elif b["kind"] == "success":
        for i, nt in enumerate(["E5", "G5", "C6"]): chime(nt, b["t"] + 0.1 + i * 0.1, 0.045, 0.35 + 0.15 * i)
    elif b["kind"] == "cap":
        chime("G5", b["t"] + 0.05, 0.012, 0.65)
pad(["C3", "G3", "C4", "E4", "G4"], outro, DUR - outro + 2, 0.08)
for i, nt in enumerate(["C5", "E5", "G5", "C6", "E6"]): chime(nt, outro + 0.5 + i * 0.18, 0.04, 0.25 + 0.12 * i)

ir_len = int(2.0 * SR); ti = np.arange(ir_len) / SR
irl = (rng.normal(0, 1, ir_len) * np.exp(-ti * 2.8)).astype(np.float32); irr = (rng.normal(0, 1, ir_len) * np.exp(-ti * 2.8)).astype(np.float32)
irl[0] = irr[0] = 0; irl /= np.abs(irl).sum() / 5; irr /= np.abs(irr).sum() / 5
wl = L + 0.35 * fftconvolve(SEND, irl)[:n].astype(np.float32); wr = R + 0.35 * fftconvolve(SEND, irr)[:n].astype(np.float32)
mix = np.stack([wl, wr], 1)[: int(DUR * SR)]
mix *= env(len(mix), 0.8, 2.0)[:, None]
mix = np.tanh(mix / np.max(np.abs(mix)) * 1.2) * 0.8
with wave.open(OUT, "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((mix * 32767).astype(np.int16).tobytes())
print("music", round(DUR, 1), "s")
