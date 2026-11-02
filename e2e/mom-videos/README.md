# Videos for mothers (one per feature)

Short portrait videos (9:16, 17–45 s each) that show a mother how to use one feature of NutriSense: real taps in the
real app, big captions in Bahasa Indonesia, Nuri at the start and the end, calm background music. Made for showing the
app to mothers, for example in a user study or at the posyandu, and small enough to send over WhatsApp (about 2–3 MB).

| # | Key | Feature |
|---|---|---|
| 01 | `daftar` | Daftar akun |
| 02 | `beranda` | Beranda |
| 03 | `ukur` | Ukur tumbuh anak |
| 04 | `grafik` | Grafik pertumbuhan |
| 05 | `hasil` | Arti hasil dan saran |
| 06 | `gejala` | Anak sakit? Cek gejala |
| 07 | `bayi` | Tanda bahaya bayi baru lahir |
| 08 | `nutriscan` | Masak apa hari ini? (NutriScan) |
| 09 | `makan` | Catat makan anak |
| 10 | `resep` | Resep bahan lokal |
| 11 | `kia` | Jadwal imunisasi |
| 12 | `asi` | Catatan ASI eksklusif |
| 13 | `kembang` | Perkembangan anak |
| 14 | `nuri` | Tanya Nuri |
| 15 | `hamil` | Kehamilan dan jadwal periksa |
| 16 | `lila` | Cek LiLA dan Hb ibu |
| 17 | `ttd` | Tablet tambah darah |
| 18 | `bahaya` | Tanda bahaya kehamilan (also with no signal) |
| 19 | `rencana` | Rencana persalinan |
| 20 | `puskesmas` | Hasil periksa dari Puskesmas |
| 21 | `lahir` | Catat kelahiran dan nifas |
| 22 | `paket` | Ambil paket gizi |
| 23 | `pengaturan` | Tulisan besar dan privasi |

## Record them again (after the app changes)

```bash
cd backend && python -m venv .venv && .venv/bin/pip install -r requirements.txt && cd ..
cd e2e && npm ci && npx playwright install chromium && cd ..
e2e/mom-videos/record.sh               # all 23 into e2e/mom-videos/out/ (about 1.5 hours)
e2e/mom-videos/record.sh ukur bahaya   # only some
```

Settings: `FFMPEG` (path to ffmpeg, default `ffmpeg`), `CHROMIUM_PATH` (an installed Chromium), `SLOW` (slow-motion
factor while recording, default 3: higher is smoother, slower to record).

How it works:
- `momvid.mjs` holds the feature scripts: the captions and the taps.
- `mom-stage.html` is the portrait page around the phone.
- `mom_music.py` writes the music.
- Each video gets its own fresh demo database.
- Frames are taken straight from Chrome and placed on a fixed 30 fps timeline, so playback never jumps.

The demo people and numbers are fictional (demo data).
