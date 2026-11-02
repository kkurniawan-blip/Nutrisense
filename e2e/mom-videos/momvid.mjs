// One short portrait video per feature, for showing NutriSense to mothers (Bahasa Indonesia, big captions, real taps).
//   node momvid.mjs <feature-key> <out-dir>      (env SLOW, default 3)
// Needs the API + web app on :8000 with a FRESH demo database, and mom-stage.html, gsap.min.js, fonts/ in the web dir
// (record.sh sets all of this up; see README.md).
// Frames come straight from Chrome (CDP screencast) and are laid on a fixed 30 fps grid of finished-video time, so the
// video never jumps. Writes <out>/frames/*.jpg, <out>/frames.txt (ffmpeg concat list) and <out>/beats.json.
import fs from 'fs';
import { chromium } from '../node_modules/playwright/index.mjs';

const BASE = 'http://localhost:8000', PW = 'Demo1234!';
const [KEY, OUT] = process.argv.slice(2);
const S = Number(process.env.SLOW || 3);
const beats = [];
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const ctx = await browser.newContext({ viewport: { width: 1080, height: 1920 } });
await ctx.addInitScript((S) => {
  if (window === window.top) return;
  addEventListener('pointerdown', (e) => {
    const d = document.createElement('div');
    Object.assign(d.style, { position: 'fixed', left: `${e.clientX - 24}px`, top: `${e.clientY - 24}px`, width: '48px', height: '48px', borderRadius: '50%',
      background: 'rgba(255,138,91,.35)', border: '2px solid rgba(255,138,91,.9)', pointerEvents: 'none', zIndex: 99999, transition: `transform ${0.5 * S}s ease, opacity ${0.5 * S}s ease` });
    document.documentElement.appendChild(d); requestAnimationFrame(() => { d.style.transform = 'scale(1.8)'; d.style.opacity = '0'; }); setTimeout(() => d.remove(), 700 * S);
  }, true);
  const scroller = (el) => { for (let p = el; p; p = p.parentElement) { const o = getComputedStyle(p).overflowY; if (p.scrollHeight > p.clientHeight + 4 && /(auto|scroll)/.test(o)) return p; } return document.scrollingElement; };
  window.__glide = (el, dy, ms) => new Promise((res) => {
    const y0 = el.scrollTop, max = el.scrollHeight - el.clientHeight, to = Math.max(0, Math.min(max, y0 + dy)), t0 = performance.now(); ms *= S;
    const f = (t) => { const k = Math.min(1, (t - t0) / ms), e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; el.scrollTop = y0 + (to - y0) * e; if (k < 1) requestAnimationFrame(f); else res(); };
    requestAnimationFrame(f); });
  window.__scrollAt = (x, y, dy, ms) => window.__glide(scroller(document.elementFromPoint(x, y) || document.body), dy, ms);
  window.__center = async (e) => { const r = e.getBoundingClientRect();
    if (r.top >= 0 && r.bottom <= innerHeight) { const t = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); if (t && (t === e || e.contains(t) || t.contains(e))) return false; }
    const dy = r.top + r.height / 2 - innerHeight / 2; await window.__glide(scroller(e.parentElement || e), dy, Math.min(1000, 450 + Math.abs(dy) * 0.6)); return true; };
}, S);
const page = await ctx.newPage();
page.setDefaultTimeout(20000);
await page.goto(`${BASE}/mom-stage.html?slow=${S}`);
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(600);
const app = page.frame({ name: 'app' });

// ---------- frame capture on a fixed grid ----------
const FPS = 30;
fs.mkdirSync(`${OUT}/frames`, { recursive: true });
const list = [];
let latest = null, latestCount = 0, slots = 0, nFrames = 0;
const flushLatest = () => { if (latest && latestCount) list.push(`file '${latest}'\nduration ${(latestCount / FPS).toFixed(6)}`); latestCount = 0; };
const fillGrid = (upTo) => { if (!latest) return; while (capT0 + (slots / FPS) * S <= upTo) { latestCount++; slots++; } };
const cdp = await ctx.newCDPSession(page);
cdp.on('Page.screencastFrame', (f) => {
  cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
  fillGrid(f.metadata.timestamp); flushLatest();
  latest = `frames/${String(nFrames++).padStart(6, '0')}.jpg`;
  fs.writeFileSync(`${OUT}/${latest}`, Buffer.from(f.data, 'base64'));
});

// ---------- helpers (times are in finished-video milliseconds) ----------
const beat = (ms = 1000) => page.waitForTimeout(ms * S);
const mark = (kind, label) => beats.push({ t: (Date.now() - t0) / 1000 / S, kind, label });
const J = (fn, ...a) => page.evaluate(([f, args]) => { window[f](...args); }, [fn, a]);
const T = (s, exact = true) => app.getByText(s, { exact }).filter({ visible: true }).last();
const F = (l) => app.getByLabel(l).filter({ visible: true }).last();
const box = async (loc) => {
  const ctl = loc.locator('xpath=ancestor-or-self::*[@role="button" or @role="switch" or @role="checkbox" or @role="tab" or @role="radio" or self::button or self::input or self::textarea][1]');
  return ((await ctl.count().catch(() => 0)) ? await ctl.boundingBox().catch(() => null) : null) ?? (await loc.boundingBox().catch(() => null));
};
const into = async (loc) => { if (await loc.evaluate((e) => window.__center(e))) await beat(150); };
const point = async (loc, glide = 600) => { const b = await box(loc); if (!b) return null; const x = b.x + b.width / 2, y = b.y + b.height / 2; await J('finger', x, y, glide); await beat(glide + 80); return { b, x, y }; };
const tap = async (loc, after = 900) => { await into(loc); const p = await point(loc); if (p) await J('ring', p.b); await beat(380); await J('press'); await loc.click(); await J('ring', null);
  if (p) await J('finger', p.x + 60, p.y + 90, 420); await beat(after); };
const type = async (loc, s, delay = 70) => { await into(loc); const p = await point(loc); if (p) await J('ring', p.b); await J('press'); await loc.click();
  if (p) await J('finger', p.x + 150, p.y + 100, 420); await J('ring', null); await loc.pressSequentially(s, { delay: delay * S }); await beat(400); };
const show = async (loc, ms = 2600) => { await into(loc).catch(() => {}); const b = await box(loc); if (b) await J('ring', b); await beat(ms); await J('ring', null); await beat(200); };
const scroll = async (y, ms) => { await J('fingerHide'); await app.evaluate(([dy, t]) => window.__scrollAt(195, 430, dy, t), [y, ms ?? Math.min(1600, 600 + Math.abs(y) * 0.9)]); await beat(300); };
const go = async (p, wait = 1700) => { await J('fingerHide'); await J('veil', 1); await beat(300); await app.goto(`${BASE}${p}`); await beat(wait * 0.6); await J('veil', 0); await beat(wait * 0.4 + 300); };
const cap = async (text, ms = 1300) => { mark('cap', text); await J('cap', text); await beat(ms); };
const success = async (text, ms = 2200) => { mark('success', text); await J('success', text); await beat(ms); };
const call = async (method, p, body, tok) => { const r = await fetch(`${BASE}${p}`, { method, headers: { 'content-type': 'application/json', ...(tok ? { Authorization: `Bearer ${tok}` } : {}) }, body: body ? JSON.stringify(body) : undefined }); let j = null; try { j = await r.json(); } catch { /* empty */ } return { status: r.status, json: j }; };
const login = async (ident) => (await call('POST', '/api/auth/login', ident.includes('@') ? { email: ident, password: PW } : { phone: ident, password: PW })).json.access_token;
const signIn = async (tok, path) => {
  await app.goto(`${BASE}/login`); await app.evaluate((t) => { localStorage.clear(); if (t) localStorage.setItem('nutrisense.token', t); }, tok);
  await app.goto(`${BASE}${path}`); await page.waitForTimeout(1600);
  for (let i = 0; tok && i < 3 && /\/login/.test(app.url()); i++) { await app.evaluate((t) => localStorage.setItem('nutrisense.token', t), tok); await app.goto(`${BASE}${path}`); await page.waitForTimeout(1600); }
};

// ---------- demo data ----------
const tok = { maria: await login('ibu.maria@nutrisense.id'), sarah: await login('081300000003'), yul: await login('ibu.yuliana@nutrisense.id'), off: await login('officer@nutrisense.id') };
const kidsOf = async (t) => Object.fromEntries((await call('GET', '/api/children', null, t)).json.map((c) => [c.name.split(' ')[0], c]));
const mk = await kidsOf(tok.maria), sk = await kidsOf(tok.sarah);
const P = `/pregnancy/${(await call('GET', '/api/pregnancies', null, tok.maria)).json[0].id}`;
const YP = (await call('GET', '/api/pregnancies', null, tok.yul)).json[0].id;
const ADEL = mk.Adel.id, BUDI = mk.Budi.id;

// ---------- the features ----------
// [emoji, title, subtitle, colour, account, start path or async () => path, steps, closing tip]
const FEATURES = {
  daftar: ['👋', 'Daftar akun', 'Cukup nomor HP, tanpa email', '#7B66F0', null, '/login', async () => {
    await cap('Di halaman masuk, ketuk “Daftar sebagai Ibu”'); await tap(T('Daftar sebagai Ibu / pengasuh'), 1300);
    await cap('Tulis nama Ibu'); await type(F('🙂 Nama lengkap'), 'Ibu Yohana Lede');
    await cap('Tulis nomor HP Ibu'); await type(F('📱 Nomor HP'), `0857${String(Date.now()).slice(-8)}`);
    await cap('Buat kata sandi, lalu tulis sekali lagi'); await type(F('🔑 Kata sandi'), 'Anakku2026!', 50); await type(F('🔑 Ulangi kata sandi'), 'Anakku2026!', 50);
    await tap(T('Lanjut'), 1300);
    await cap('Pilih desa Ibu'); await tap(T('Oesapa', true), 900);
    await cap('Setujui pengolahan data, lalu “Buat akun”'); await tap(app.getByRole('switch').first(), 800); await scroll(800); await tap(T('Buat akun'), 2600);
    await success('✓ Akun dibuat!');
    await cap('Sekarang Ibu bisa menambah data anak'); await show(T('Tambah anak'), 2400);
  }, 'Tidak punya HP sendiri? Kader bisa mendaftarkan Ibu dengan nomor HP.'],

  beranda: ['🏠', 'Beranda', 'Semua yang perlu Ibu lakukan hari ini', '#FF8A5B', 'maria', '/home', async () => {
    await cap('Beranda membuka anggota keluarga yang paling perlu perhatian', 2400);
    await cap('Ketuk nama anak untuk melihat statusnya'); await tap(T('Adel'), 1600);
    await cap('“Untuk hari ini”: hal yang perlu dilakukan hari ini'); await show(app.getByText('Untuk hari ini').filter({ visible: true }).first(), 2800);
    await cap('Tanggal posyandu berikutnya juga ada di sini'); await show(app.getByText(/Posyandu berikutnya/).filter({ visible: true }).first(), 2800);
  }, 'Buka Beranda setiap hari untuk melihat tugas Ibu.'],

  ukur: ['📏', 'Ukur tumbuh anak', 'Dipandu langkah demi langkah', '#2FB38A', 'maria', `/child/${ADEL}`, async () => {
    await cap('Buka profil anak, lalu ketuk “Catat tumbuh”'); await tap(app.getByRole('button', { name: /Catat tumbuh/ }).filter({ visible: true }).first(), 1500);
    await cap('Baca cara mengukur yang benar, lalu Lanjut', 2000); await tap(T('Lanjut'), 1200); await tap(T('Saya siap memasukkan angka'), 1000);
    await cap('Tulis berat badan dari timbangan'); await type(F('⚖️ Berat badan (kg)'), '11.5');
    await cap('Tulis panjang atau tinggi badan'); await type(F(/Panjang badan|Tinggi badan/), '85.1');
    await cap('Kaki anak bengkak? Pilih “Tidak”'); await tap(T('Tidak'), 900); await tap(T('Lanjut'), 1500);
    await cap('Periksa sekali lagi, lalu Simpan', 1800); await tap(T('Simpan'), 300); await T('Pengukuran tersimpan', false).waitFor({ timeout: 25000 });
    await success('✓ Tersimpan!');
    await cap('Hasilnya langsung dibandingkan dengan standar WHO', 3000);
  }, 'Ukur anak setiap bulan, di posyandu atau di rumah.'],

  grafik: ['📈', 'Grafik pertumbuhan', 'Lihat apakah anak tumbuh baik', '#46A6E8', 'maria', `/child/${ADEL}/history`, async () => {
    await cap('Setiap pengukuran tampil di grafik standar WHO', 2800);
    await cap('Ketuk “Berat” untuk melihat berat badan'); await tap(T('Berat'), 1800);
    await cap('“BB/TB”: berat dibanding tinggi'); await tap(T('BB/TB'), 1800);
    await cap('Garis tengah: rata-rata anak sehat'); await scroll(380); await beat(2400);
  }, 'Garis anak naik mengikuti kurva? Pertumbuhannya baik.'],

  hasil: ['💬', 'Arti hasil dan saran', 'Dijelaskan dengan kata sederhana', '#E0578B', 'maria', `/child/${BUDI}`, async () => {
    await cap('Status anak ditulis dengan warna dan kata', 2600);
    await cap('“2T”: berat tidak naik dua kali'); await show(T('Berat tidak naik 2× (2T)'), 2800);
    await cap('Saran pertama: bawa ke dokter dalam 2 hari'); await show(T('Bawa ke dokter/Puskesmas dalam 2 hari', false), 3200);
    await cap('Ketuk “Dengar” agar saran dibacakan'); await show(app.getByText(/Dengar/).filter({ visible: true }).first(), 2600);
  }, 'Ikuti saran pertama. Kader siap membantu Ibu.'],

  gejala: ['🤒', 'Anak sakit? Cek gejala', 'Tahu kapan harus segera ke Puskesmas', '#E5484D', 'maria', `/child/${BUDI}/symptoms`, async () => {
    await cap('Pilih gejala anak dengan gambar', 2400);
    await cap('Contoh: anak kejang'); await tap(T('Kejang'), 1500);
    await cap('Tanda bahaya! Tombol Puskesmas, 119 dan Kader muncul'); await show(app.getByText(/Perlu pertolongan/).filter({ visible: true }).first(), 2600);
    await show(T('Ke Puskesmas sekarang'), 2400);
  }, 'Tanda bahaya? Segera ke Puskesmas atau telepon 119.'],

  bayi: ['👶', 'Tanda bahaya bayi baru lahir', 'Untuk bayi di bawah 2 bulan', '#46A6E8', 'maria', async () => {
    const born = new Date(Date.now() - 20 * 864e5).toISOString().slice(0, 10);
    const r = await call('POST', '/api/children', { name: 'Bayi Kecil Fanggidae', sex: 'female', birth_date: born }, tok.maria);
    return `/child/${r.json.id}/symptoms`;
  }, async () => {
    await cap('Bayi muda punya tanda bahaya khusus'); await show(T('Kulit / mata kuning'), 2400);
    await cap('Tali pusat merah, badan dingin, napas merintih'); await show(T('Tali pusat merah / bernanah'), 1800); await show(T('Badan dingin'), 1600);
    await cap('Bayi muda demam? Ini juga tanda bahaya'); await tap(T('Demam'), 1500);
    await show(app.getByText(/Perlu pertolongan/).filter({ visible: true }).first(), 2800);
  }, 'Bayi di bawah 2 bulan demam? Segera ke Puskesmas.'],

  nutriscan: ['🍳', 'Masak apa hari ini?', 'NutriScan: menu dari bahan di rumah', '#FF8A5B', 'maria', `/food/${BUDI}?action=pick`, async () => {
    await cap('Pilih bahan makanan yang ada di rumah');
    for (const f of ['Telur ayam rebus', 'Bayam', 'Nasi putih']) await tap(F(f), 500);
    await cap('Ketuk “Cari menu terbaik”'); await tap(T('✨ Cari menu terbaik'), 300); await T('Semua bahan tersedia', false).waitFor({ timeout: 20000 });
    await success('✓ Menu ditemukan!');
    await cap('Lihat resep: bahan dan cara memasak'); await tap(T('Lihat resep'), 1600); await scroll(650); await beat(1600);
    await cap('Sudah dimasak? Ketuk “Catat”'); await tap(T('✓ Sudah dimasak? Catat'), 1200); await T('Tersimpan di catatan makan', false).waitFor({ timeout: 15000 });
    await success('✓ Makan tercatat!');
  }, 'Masakan dari bahan lokal yang murah tetap bergizi.'],

  makan: ['🥗', 'Catat makan anak', 'Apakah makanannya sudah beragam?', '#2FB38A', 'maria', `/child/${ADEL}/meal?action=manual`, async () => {
    await cap('Pilih makanan yang dimakan anak');
    for (const f of ['Nasi putih', 'Telur ayam rebus', 'Bayam']) await tap(app.getByText(f, { exact: false }).filter({ visible: true }).last(), 500);
    await cap('Ketuk “Simpan makanan”'); await tap(T('Simpan makanan'), 300); await T('Yang sudah ada', false).waitFor({ timeout: 20000 });
    await success('✓ Tersimpan!');
    await cap('Kelompok makanan yang sudah dan belum ada'); await show(T('Yang sudah ada', false), 2600);
    await cap('Target: minimal 5 dari 8 kelompok sehari', 2400);
  }, 'Makanan beragam setiap hari membantu anak tumbuh tinggi.'],

  resep: ['🥕', 'Resep bahan lokal', 'Murah, mudah, dan bergizi', '#FFB020', 'maria', `/child/${ADEL}/recipes`, async () => {
    await cap('Resep dari bahan lokal NTT'); await scroll(500); await beat(900); await scroll(-500, 900);
    await cap('Ketuk “Lihat resep”'); await tap(app.getByText('Lihat resep').filter({ visible: true }).first(), 1500);
    await cap('Bahan, takaran rumah tangga, dan cara membuat'); await scroll(600); await beat(2200);
  }, 'Kelor, jagung, telur, ikan: murah dan bergizi.'],

  kia: ['💉', 'Jadwal imunisasi', 'Buku KIA di HP Ibu', '#7B66F0', 'maria', `/child/${BUDI}/kia`, async () => {
    await cap('Jadwal imunisasi, vitamin A, dan obat cacing'); await scroll(420); await beat(900); await scroll(-420, 900);
    await cap('Sudah diberikan? Ketuk “Tandai sudah”'); await tap(T('Tandai sudah'), 1600);
    await success('✓ Ditandai!');
  }, 'Bawa Buku KIA setiap kali ke posyandu.'],

  asi: ['🤱', 'Catatan ASI eksklusif', 'Untuk bayi 0 sampai 6 bulan', '#FF6FA0', 'sarah', `/child/${sk.Kristo.id}/asi`, async () => {
    await cap('Catat ASI setiap hari', 2200);
    await cap('Hari ini hanya ASI? Centang'); await tap(F('Hanya ASI hari ini'), 1200);
    await cap('Tambah setiap kali menyusui'); await tap(F('+'), 700); await tap(F('+'), 1200);
    await success('✓ Tersimpan!');
    await cap('Riwayat 7 hari terlihat di bawah'); await scroll(420); await beat(2000);
  }, 'Hanya ASI sampai 6 bulan: tanpa air, susu lain, atau makanan.'],

  kembang: ['🧸', 'Perkembangan anak', 'Apa yang sudah bisa dilakukan anak?', '#46C89E', 'maria', `/child/${ADEL}/development`, async () => {
    await cap('Daftar kemampuan sesuai umur anak'); await scroll(320); await beat(900); await scroll(-320, 800);
    await cap('Anak sudah bisa? Ketuk “Ya, sudah bisa”'); await tap(app.getByText('✓ Ya, sudah bisa').filter({ visible: true }).first(), 1300);
    await success('✓ Tercatat!');
  }, 'Belum bisa? Ajak bermain dan tanyakan ke Kader.'],

  nuri: ['🌱', 'Tanya Nuri', 'Jawaban singkat, juga tanpa internet', '#7B66F0', 'maria', '/assistant', async () => {
    await cap('Pilih topik, misalnya “Makan”'); await tap(T('Makan'), 900);
    await cap('Pilih pertanyaan, atau tulis sendiri'); await tap(app.getByText('Apa menu untuk anak susah makan?').filter({ visible: true }).last(), 300);
    await T('Nuri — panduan AI', false).waitFor({ timeout: 20000 });
    await cap('Nuri menjawab dengan singkat dan sederhana', 3200);
    await cap('Ada tanda bahaya? Nuri langsung mengingatkan');
    const tb = app.getByRole('textbox').filter({ visible: true }).last(); await type(tb, 'Anak saya kejang dan demam tinggi', 45); await tb.press('Enter');
    await app.getByText(/Ini tanda bahaya/).last().waitFor({ timeout: 20000 }); await beat(3200);
  }, 'Nuri membantu, tapi bukan pengganti bidan atau dokter.'],

  hamil: ['🤰', 'Kehamilan dan jadwal periksa', 'Usia kehamilan dan K1–K6', '#FF6FA0', 'maria', P, async () => {
    await cap('Usia kehamilan dan perkiraan lahir dihitung otomatis', 2400); await scroll(520); await beat(1400); await scroll(-520, 900);
    await cap('Jadwal 6 kali periksa hamil (K1–K6)'); await go(`${P}/anc`);
    await cap('Sudah periksa? Ketuk “Tandai sudah”'); await tap(T('Tandai sudah'), 1600);
    await success('✓ Tercatat!');
  }, 'Periksa hamil minimal 6 kali selama kehamilan.'],

  lila: ['💪', 'Cek LiLA dan Hb ibu', 'Lingkar lengan dan kadar darah', '#E0578B', 'maria', `${P}/measure`, async () => {
    await cap('Tulis lingkar lengan atas (LiLA)'); await type(F(/LiLA \(cm\)/), '22.8'); await tap(T('Lanjut'), 1000);
    await cap('Tulis kadar Hb dari Puskesmas'); await type(F(/Hb \(g\/dL\)/), '10.4'); await tap(T('Lanjut'), 1500);
    await cap('Periksa, lalu Simpan'); await tap(T('Simpan'), 300); await T('Hasil cek ibu tersimpan', false).waitFor({ timeout: 12000 });
    await success('✓ Tersimpan!');
    await cap('Lengan kecil atau kurang darah? Ada sarannya'); await show(T('Lengan kecil (KEK)', false), 3000);
  }, 'LiLA di bawah 23,5 cm atau Hb di bawah 11? Temui bidan.'],

  ttd: ['💊', 'Tablet tambah darah', 'Centang setiap hari', '#E5484D', 'maria', `${P}/supplements`, async () => {
    await cap('Sudah minum tablet tambah darah? Centang'); await tap(F('Tablet tambah darah hari ini'), 1500);
    await success('✓ Tercatat!');
    await cap('Riwayat 7 hari terlihat'); await scroll(420); await beat(2200);
  }, 'Minum tablet tambah darah setiap hari selama hamil.'],

  bahaya: ['🚨', 'Tanda bahaya kehamilan', 'Tetap bisa dilaporkan tanpa sinyal', '#E5484D', 'maria', `${P}/danger`, async () => {
    await page.route(`${BASE}/api/**`, (r) => r.abort('internetdisconnected'));
    await cap('Pilih tanda bahaya yang Ibu rasakan'); await tap(F('Perdarahan'), 900);
    await cap('Ketuk “Laporkan”'); await tap(app.getByRole('button', { name: /Lapor/ }).filter({ visible: true }).last(), 1600);
    await cap('Tanpa sinyal: laporan disimpan, tombol telepon didahulukan'); await show(app.getByText(/Tidak ada sinyal/).filter({ visible: true }).first(), 3200);
    await page.unroute(`${BASE}/api/**`);
    await cap('Saat sinyal kembali, laporan terkirim sendiri'); await go('/sync', 2600); await T('Kirim sekarang').click().catch(() => {}); await beat(1500);
    await success('✓ Terkirim ke Kader!');
  }, 'Tanda bahaya? Jangan menunggu: ke Puskesmas atau telepon 119.'],

  rencana: ['🏥', 'Rencana persalinan', 'Siapkan sejak awal kehamilan', '#46A6E8', 'maria', `${P}/plan`, async () => {
    await cap('Pilih kendaraan ke tempat bersalin'); await tap(T('Ojek', false), 900);
    await cap('Pilih penolong persalinan'); await tap(app.getByText(/^\S+\sBidan$/).filter({ visible: true }).last(), 900);
    await cap('Tulis pendamping dan calon pendonor darah'); await type(F('🤝 Pendamping'), 'Suami'); await type(F('🩸 Calon pendonor darah'), 'Kakak (O)');
    await cap('Pilih cara membayar'); await tap(T('JKN / KIS', false), 900);
    await cap('Simpan rencana'); await tap(T('Simpan'), 300); await T('Rencana tersimpan', false).waitFor({ timeout: 10000 });
    await success('✓ Rencana tersimpan!');
  }, 'Siapkan kendaraan, pendamping, dan pendonor sebelum waktunya.'],

  puskesmas: ['🩺', 'Hasil periksa dari Puskesmas', 'Langsung masuk ke HP Ibu', '#7B66F0', 'maria', `${P}/puskesmas`, async () => {
    await cap('Saat periksa, tunjukkan kode ini ke bidan'); await show(app.getByText('NS-7KQ2MP').filter({ visible: true }).first(), 2600);
    await cap('Atau tunjukkan QR-nya'); await tap(app.getByText('▦ QR').filter({ visible: true }).first(), 2600);
    const fac = (await call('GET', '/api/facilities', null, tok.off)).json[0];
    await call('POST', '/api/facility-portal/checkup', { facility_id: fac.id, link_code: 'NS-7KQ2MP', weight_kg: 58.5, bp_systolic: 150, bp_diastolic: 95, muac_cm: 23.2, hb_g_dl: 10.6, fetal_heart_rate: 142 }, tok.off);
    await cap('Setelah periksa, hasilnya masuk ke HP Ibu'); await go('/notifications'); await tap(app.getByText('Hasil periksa hamil sudah masuk').filter({ visible: true }).first(), 2000);
    await cap('Tekanan darah tinggi dijelaskan dengan jelas'); await show(app.getByText(/150\s*\/\s*95/).filter({ visible: true }).first(), 3200);
  }, 'Hubungan ke Puskesmas bisa Ibu matikan kapan saja.'],

  lahir: ['🎉', 'Catat kelahiran dan nifas', 'Setelah bayi lahir', '#2FB38A', 'yul', `/pregnancy/${YP}/birth`, async () => {
    await cap('Bayi sudah lahir? Tulis namanya'); await type(F('Nama bayi'), 'Bayi Yuliana', 55); await tap(T('Lanjut'), 1000);
    await cap('Tulis berat dan panjang lahir'); await type(F('⚖️ Berat lahir (kg)'), '2.2'); await type(F('📏 Panjang lahir (cm)'), '44'); await tap(T('Lanjut'), 1000);
    await cap('Pilih tempat dan penolong persalinan'); await tap(T('Puskesmas', false), 700); await tap(app.getByText(/^\S+\sBidan$/).filter({ visible: true }).last(), 700); await tap(T('Lanjut'), 1300);
    await cap('Simpan'); await tap(T('Simpan'), 300); await T('Selamat, Bunda! 🎉', false).waitFor({ timeout: 15000 });
    await success('🎉 Selamat, Bunda!', 2600);
    await cap('Jadwal kunjungan nifas ibu dan bayi dibuat otomatis'); await go(`/pregnancy/${YP}`, 2200); await tap(T('Tandai sudah'), 1600);
    await success('✓ Kunjungan tercatat!');
  }, 'Periksakan ibu dan bayi dalam 2 hari setelah lahir.'],

  paket: ['📦', 'Ambil paket gizi', 'Kode untuk loker posyandu', '#FFB020', 'maria', '/pickups', async () => {
    await cap('Paket gizi untuk anak sudah siap', 2400);
    await cap('Tunjukkan kode 6 angka atau QR di loker'); await show(app.getByText(/^\d{6}$/).filter({ visible: true }).first(), 3400);
  }, 'Ambil paket sebelum kodenya kedaluwarsa.'],

  pengaturan: ['⚙️', 'Tulisan besar dan privasi', 'Atur aplikasi sesuai kebutuhan Ibu', '#8A6BD8', 'maria', '/settings', async () => {
    await cap('Tulisan terlalu kecil? Pilih “Besar”'); await tap(T('Besar'), 1200);
    await cap('Tulisan jadi lebih besar dan mudah dibaca'); await go('/home', 2400); await beat(1200);
    await go('/settings', 1400); await tap(T('Normal'), 900);
    await cap('Di “Data & privasi”, Ibu memilih data yang dibagikan'); await go('/privacy', 2000); await scroll(420); await beat(1800);
  }, 'Ibu yang memutuskan data apa yang dibagikan.'],
};

if (KEY === 'list') { console.log(Object.keys(FEATURES).join(' ')); await browser.close(); process.exit(0); }
const [em, title, sub, color, who, start, steps, tip] = FEATURES[KEY];
const num = Object.keys(FEATURES).indexOf(KEY) + 1, total = Object.keys(FEATURES).length;

// The phone is signed in and on its first screen before recording starts; the intro card covers it.
const path = typeof start === 'function' ? await start() : start;
await signIn(who ? tok[who] : null, path);
await J('setHead', em, title, sub);
await page.evaluate((c) => { document.getElementById('card').style.background = c; }, color);

const t0 = Date.now(), capT0 = t0 / 1000;
await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 90, maxWidth: 1080, maxHeight: 1920, everyNthFrame: 1 });
const ticker = setInterval(() => fillGrid(Date.now() / 1000 - 0.8), 200);

mark('intro', title);
await J('card', `<div class="em">${em}</div><div class="k">Fitur ${num} dari ${total}</div><div class="t">${title}</div><div class="s">${sub}</div><div class="brand">🌱 NutriSense</div>`, color);
await beat(3600);
await J('cardHide'); await beat(900);
let ok = true;
try { await steps(); } catch (e) { ok = false; console.log('WARN', KEY, e.message.split('\n')[0].slice(0, 200)); await page.screenshot({ path: `${OUT}/warn.png` }).catch(() => {}); }
await J('fingerHide'); await J('ring', null);
mark('outro', tip);
await J('card', `${await page.evaluate(() => window.nuri())}<div class="t" style="font-size:80px">Selesai!</div><div class="s">${tip}</div><div class="brand">🌱 NutriSense · Tumbuh sehat, masa depan cerah</div>`, color, true);
await beat(4600);
mark('end', 'end');

clearInterval(ticker);
await cdp.send('Page.stopScreencast');
fillGrid(Date.now() / 1000); flushLatest();
list.push(`file '${latest}'`);
fs.writeFileSync(`${OUT}/frames.txt`, list.join('\n') + '\n');
fs.writeFileSync(`${OUT}/beats.json`, JSON.stringify(beats, null, 1));
console.log(ok ? 'OK' : 'FAILED', KEY, (slots / FPS).toFixed(1), 's', nFrames, 'frames');
await browser.close();
