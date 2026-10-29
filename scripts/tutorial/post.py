"""Posproducción del tutorial (#664): zoom de cámara + subtítulos + voz, efectos y música.

    python3 scripts/tutorial/post.py <dir> [--sin-musica] [--sin-subs] [--fx-db 0] [--out <dir>/tutorial.mp4]

Lee lo que dejó la grabación (`kit.ts`) en <dir>: raw.webm, timeline.json, subs.srt y voz/bNN.mp3.

Decisiones:
  - Zoom: cada foco es un keyframe; entre focos se interpola con smoothstep en 0,8 s.
    Se escala 2× ANTES de zoompan porque zoompan redondea x/y a píxel entero por cuadro
    y una imagen quieta tiembla; a 2× el paso es sub-píxel.
  - Subtítulos en ASS y quemados DESPUÉS del zoom (en la página el zoom los recortaba).
  - Efectos y música sintetizados con numpy (sin licencias ni descargas). La música se
    agacha sola bajo la voz (sidechain) y todo sale normalizado a -16 LUFS (web/redes).
Requiere: ffmpeg con libass, numpy, scipy.
"""
import argparse
import json
import os
import subprocess

import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, fftconvolve, sosfilt

SR = 48000
W, H = 1920, 1200
VIEW = (1440, 900)  # ventana de la grabación (kit.ts)
rng = np.random.default_rng(7)

# ---------------------------------------------------------------- síntesis de sonido
# Adaptado del motor de video del autor (engine/scripts/sfx.py): todo es ruido y senos.


def t_axis(d):
    return np.arange(int(SR * d)) / SR


def db(x):
    return 10 ** (x / 20)


def reverb(x, decay=0.8, mix=0.25):
    n = int(SR * decay)
    ir = rng.standard_normal(n) * np.exp(-6 * np.arange(n) / n)
    ir = sosfilt(butter(2, 5000, "low", fs=SR, output="sos"), ir)
    out = np.zeros(len(x) + n)
    wet = np.zeros_like(out)
    conv = fftconvolve(x, ir)
    wet[: len(conv)] = conv[: len(out)]
    wet /= np.max(np.abs(wet)) + 1e-9
    out[: len(x)] += x * (1 - mix)
    return out + wet * mix * np.max(np.abs(x))


def norm(x, peak_db):
    return x / (np.max(np.abs(x)) + 1e-9) * db(peak_db)


def swept_bandpass(noise, f0, f1, q=1.2):
    out = np.zeros_like(noise)
    low = band = 0.0
    freqs = np.geomspace(f0, f1, len(noise))
    for i, x in enumerate(noise):
        f = 2 * np.sin(np.pi * freqs[i] / SR)
        high = x - low - band / q
        band += f * high
        low += f * band
        out[i] = band
    return out


def whoosh(d=0.6, f0=300, f1=4200, peak=-20):
    n = t_axis(d)
    env = np.where(n < d * 0.62, (n / (d * 0.62)) ** 2.2, np.exp(-(n - d * 0.62) * 14))
    return norm(reverb(swept_bandpass(rng.standard_normal(len(n)), f0, f1) * env, 0.5, 0.18), peak)


def pop(peak=-24, f0=880):
    n = t_axis(0.12)
    x = np.sin(2 * np.pi * np.cumsum(f0 * np.exp(-n * 9)) / SR) * np.exp(-n * 38)
    x[:120] += rng.standard_normal(120) * np.linspace(0.4, 0, 120)
    return norm(reverb(x, 0.25, 0.12), peak)


def tick(peak=-31):
    n = t_axis(0.03)
    x = sosfilt(butter(2, [2200, 5200], "band", fs=SR, output="sos"), rng.standard_normal(len(n))) * np.exp(-n * 180)
    return norm(x, peak)


def chime(peak=-19):
    n = t_axis(2.4)
    x = np.zeros(len(n))
    for k, f in enumerate([523.25, 659.25, 783.99, 987.77, 1174.66]):
        s = int(k * 0.07 * SR)
        m = n[: len(n) - s]
        x[s:] += (np.sin(2 * np.pi * f * m) + 0.35 * np.sin(4 * np.pi * f * m)) * np.exp(-m * 2.4) * (1 - np.exp(-m * 400)) / 5
    return norm(reverb(x, 1.6, 0.35), peak)


def music_bed(total, peak=-24):
    """Pad ambiental I–vi–IV–V en Do, 8 s por acorde, ataque lento."""
    chords = [[261.63, 329.63, 392.0], [220.0, 261.63, 329.63], [174.61, 220.0, 261.63], [196.0, 246.94, 293.66]]
    seg = 8.0
    out = np.zeros(int(SR * (total + 1)))
    n = t_axis(seg + 2)
    env = np.minimum(1, n / 1.8) * np.minimum(1, np.maximum(0, (seg + 2 - n) / 2.0))
    k, pos = 0, 0.0
    while pos < total:
        pad = np.zeros(len(n))
        for f in chords[k % 4]:
            for det in (-0.004, 0.0, 0.004):
                pad += np.sin(2 * np.pi * f * (1 + det) * n + rng.uniform(0, 6.28))
            pad += 0.5 * np.sin(np.pi * f * n)
        pad *= env * (0.85 + 0.15 * np.sin(4 * np.pi * n))
        a = int(pos * SR)
        b = min(len(out), a + len(pad))
        out[a:b] += pad[: b - a]
        pos += seg
        k += 1
    out = sosfilt(butter(2, 1800, "low", fs=SR, output="sos"), out)[: int(SR * total)]
    fade = int(SR * 2.5)
    out[:fade] *= np.linspace(0, 1, fade)
    out[-fade:] *= np.linspace(1, 0, fade)
    return norm(out, peak)


# ---------------------------------------------------------------- pistas


def load(path):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-ac", "1", "-ar", str(SR), "-f", "s16le", "-"],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.int16).astype(np.float64) / 32768


def write(path, x):
    wavfile.write(path, SR, (np.clip(x, -1, 1) * 32767).astype(np.int16))


def voice_track(d, tl, total):
    out = np.zeros(int(SR * (total + 30)))
    for i, t in enumerate(tl["vs"]):
        x = load(os.path.join(d, "voz", f"b{i:02d}.mp3"))
        a = int(t / 1000 * SR)
        out[a:a + len(x)] += x
    return out[: int(SR * total)]


def fx_track(tl, total, gain_db):
    bank = {"click": pop(-30, 1700), "pop": pop(-25), "key": tick(-38), "whoosh_long": whoosh(0.85, 200, 3200, -21),
            "chime": chime(-21), "zoom": whoosh(0.5, 400, 2200, -30)}
    # `mouse.click` suelta el botón por dentro: ese «pop» pegado a un clic sonaría doble.
    clicks = [t for t, k in tl["ev"] if k == "click"]
    evs = [(t, k) for t, k in tl["ev"] if not (k == "pop" and any(0 <= t - c < 400 for c in clicks))]
    evs += [(t, "zoom") for t, _, _, z in tl["zooms"] if z > 1]
    out = np.zeros(int(SR * (total + 3)))
    ultimo = -1.0
    for t, k in sorted(evs):
        s = t / 1000 - (0.35 if k == "whoosh_long" else 0)  # el whoosh anticipa el corte
        if k == "key":
            if s - ultimo < 0.05:
                continue
            ultimo = s
        x = bank[k] * db(gain_db)
        i = max(0, int(s * SR))
        out[i:i + len(x)] += x[: len(out) - i]
    return out[: int(SR * total)], len(evs)


# ---------------------------------------------------------------- cámara y subtítulos


def camera(zooms, dur=0.8):
    """zoompan con focos por keyframe: suma de escalones suavizados (smoothstep)."""
    cx0, cy0 = VIEW[0] / 2, VIEW[1] / 2
    prev = (cx0, cy0, 1.0)
    z, x, y = ["1"], [f"{cx0}"], [f"{cy0}"]
    for t, cx, cy, zz in zooms:
        u = f"clip((in/30-{t / 1000:.3f})/{dur},0,1)"
        s = f"({u}*{u}*(3-2*{u}))"
        z.append(f"{zz - prev[2]:+.4f}*{s}")
        x.append(f"{cx - prev[0]:+.2f}*{s}")
        y.append(f"{cy - prev[1]:+.2f}*{s}")
        prev = (cx, cy, zz)
    # Los focos vienen en px CSS; la entrada de zoompan está escalada 2×.
    return (f"scale={VIEW[0] * 2}:{VIEW[1] * 2}:flags=lanczos,"
            f"zoompan=z='{''.join(z)}'"
            f":x='clip(2*({''.join(x)})-iw/zoom/2,0,iw-iw/zoom)'"
            f":y='clip(2*({''.join(y)})-ih/zoom/2,0,ih-ih/zoom)'"
            f":d=1:s={W}x{H}:fps=30")


def ass(srt_path, out_path):
    def sec(p):
        h, m, s = p.replace(",", ".").split(":")
        return int(h) * 3600 + int(m) * 60 + float(s)

    def ts(v):
        return f"{int(v // 3600)}:{int(v // 60) % 60:02d}:{v % 60:05.2f}"

    lines = []
    for b in open(srt_path, encoding="utf-8").read().strip().split("\n\n"):
        l = b.split("\n")
        if len(l) < 3:
            continue
        a, z = (sec(p) for p in l[1].split(" --> "))
        txt = l[2] + ("\\N{\\fs30\\c&HE1D5CB&}" + l[3] if len(l) > 3 and l[3] else "")
        lines.append(f"Dialogue: 0,{ts(a + 0.05)},{ts(z)},Cap,,0,0,0,,{{\\fad(180,180)}}{txt}")
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(f"""[Script Info]
ScriptType: v4.00+
PlayResX: {W}
PlayResY: {H}
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Cap,Helvetica Neue,40,&H00FFFFFF,&H00FFFFFF,&H22120C0A,&H22120C0A,1,0,0,0,100,100,0,0,3,16,0,2,160,160,64,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
""" + "\n".join(lines) + "\n")
    return len(lines)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("dir")
    ap.add_argument("--out")
    ap.add_argument("--sin-musica", action="store_true")
    ap.add_argument("--sin-subs", action="store_true")
    ap.add_argument("--fx-db", type=float, default=0.0, help="dB sumados a todos los efectos")
    a = ap.parse_args()
    d = os.path.abspath(a.dir)
    out = a.out or os.path.join(d, "tutorial.mp4")
    tl = json.load(open(os.path.join(d, "timeline.json")))
    total = tl["total"] / 1000 + 0.5
    w = lambda n: os.path.join(d, n)  # noqa: E731

    write(w("voice.wav"), voice_track(d, tl, total))
    fx, n_fx = fx_track(tl, total, a.fx_db)
    write(w("fx.wav"), fx)
    inputs = ["-i", w("raw.webm"), "-i", w("voice.wav"), "-i", w("fx.wav")]
    fade = total - 1.2
    video = f"[0:v]fps=30,{camera(tl['zooms'])}"
    n_subs = 0
    if not a.sin_subs:
        n_subs = ass(w("subs.srt"), w("subs.ass"))
        video += f",ass='{w('subs.ass')}'"
    graph = (f"{video},fade=t=out:st={fade:.2f}:d=1.2[v];"
             "[1:a]loudnorm=I=-16:TP=-1.5:LRA=11,aformat=channel_layouts=stereo,asplit=2[voice][key];"
             "[2:a]aformat=channel_layouts=stereo[fx];")
    mix, n = "[voice][fx]", 2
    if not a.sin_musica:
        write(w("music.wav"), music_bed(total))
        inputs += ["-i", w("music.wav")]
        graph += ("[3:a]aformat=channel_layouts=stereo[bed];"
                  "[bed][key]sidechaincompress=threshold=0.03:ratio=6:attack=40:release=600[ducked];")
        mix, n = mix + "[ducked]", 3
    else:
        graph += "[key]anullsink;"
    graph += f"{mix}amix=inputs={n}:normalize=0:duration=first,loudnorm=I=-16:TP=-1.5:LRA=11,afade=t=out:st={fade:.2f}:d=1.2[a]"
    subprocess.run(["ffmpeg", "-y", "-v", "error", *inputs, "-filter_complex", graph, "-map", "[v]", "-map", "[a]",
                    "-t", f"{total:.2f}", "-c:v", "libx264", "-preset", "medium", "-crf", "19", "-pix_fmt", "yuv420p",
                    "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-movflags", "+faststart", out], check=True)
    print(f"video → {out}  ({total:.1f} s · {len(tl['zooms'])} focos · {n_subs} subtítulos · {n_fx} efectos"
          f"{'' if a.sin_musica else ' · música'})")


if __name__ == "__main__":
    main()
