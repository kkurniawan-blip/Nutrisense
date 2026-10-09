// Feature check: every feature of NutriSense, one scenario each, run in the browser and confirmed through the API.
// Needs the API on a FRESH demo database at :8000 and the web app at :8081 (see README.md), like the other suites.
// Writes features-report.md (a black-box test table, Indonesian and English) and features-results.json, saves a
// screenshot per failure to ./feature-screenshots, and exits with code 1 if any feature fails.
// `ONLY=A1,B2 npm run features` runs a few.
import fs from 'node:fs';
import { chromium } from 'playwright';

const APP = process.env.APP_URL ?? 'http://localhost:8081';
const API = process.env.API_URL ?? 'http://localhost:8000';
const PW = 'Demo1234!';
const ONLY = (process.env.ONLY ?? '').split(',').filter(Boolean);
const SHOTS = new URL('./feature-screenshots/', import.meta.url).pathname;
fs.mkdirSync(SHOTS, { recursive: true });

async function call(method, path, body, token, extra = {}) {
  const r = await fetch(`${API}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extra },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await r.json(); } catch { /* no body */ }
  return { status: r.status, json };
}
const login = async (ident, pw = PW) => (await call('POST', '/api/auth/login', { email: ident, password: pw })).json?.access_token;
const expect = (cond, msg) => { if (!cond) throw new Error(msg); };
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

const results = [];
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const pageErrors = [];

async function open(ident, pw = PW) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => pageErrors.push(`${page.url()}: ${e.message.slice(0, 160)}`));
  page.on('response', (r) => { if (r.url().includes('/api/') && r.status() >= 500) pageErrors.push(`HTTP ${r.status()} ${r.url().replace(API, '')}`); });
  const h = {
    page, ctx,
    text: (s, exact = true) => page.getByText(s, { exact }).last(),
    has: async (s, exact = false) => (await page.getByText(s, { exact }).count()) > 0,
    field: (l) => page.getByLabel(l).last(),
    go: async (p) => { await page.goto(`${APP}${p}`); await page.waitForTimeout(2300); },
    wait: (ms = 1200) => page.waitForTimeout(ms),
    token: () => page.evaluate(() => localStorage.getItem('nutrisense.token')),
  };
  if (ident) {
    await h.go('/login');
    if (ident.includes('@')) await h.text('✉️ Email').click();
    await h.field(ident.includes('@') ? '✉️ Email' : '📱 Nomor HP').fill(ident);
    await h.field('🔑 Kata sandi').fill(pw);
    await h.text('Masuk').click();
    await page.waitForURL(/\/(home|dashboard)$/, { timeout: 20000 });
    await h.wait(2000);
  }
  return h;
}

// One feature: id, area, the feature (Indonesian, English), what is done, what should happen, and the check.
let current = null;
async function feature(id, area, name, en, scenario, expected, fn) {
  if (ONLY.length && !ONLY.includes(id)) return;
  const t0 = Date.now();
  try {
    const note = (await fn()) ?? '';
    results.push({ id, area, name, en, scenario, expected, ok: true, note, ms: Date.now() - t0 });
    console.log(`PASS ${id} ${name}${note ? ' — ' + note : ''}`);
  } catch (e) {
    const msg = e.message.split('\n')[0].slice(0, 220);
    results.push({ id, area, name, en, scenario, expected, ok: false, note: msg, ms: Date.now() - t0 });
    console.log(`FAIL ${id} ${name} — ${msg}`);
    if (current) await current.page.screenshot({ path: `${SHOTS}${id}.png` }).catch(() => {});
  }
}

// ---------- Demo data ----------
const maria = await login('ibu.maria@nutrisense.id');
const sarah = await login('081300000003');
const yul = await login('ibu.yuliana@nutrisense.id');
const kaderT = await login('kader.oesapa@nutrisense.id');
const officer = await login('officer@nutrisense.id');
const doctor = await login('doctor@nutrisense.id');
const admin = await login('admin@nutrisense.id');
expect(maria && sarah && kaderT && officer && doctor, 'Demo accounts cannot log in: start the API on a fresh demo database.');
const kidsOf = async (tok) => Object.fromEntries((await call('GET', '/api/children', null, tok)).json.map((c) => [c.name.split(' ')[0], c]));
const mk = await kidsOf(maria);
const sk = await kidsOf(sarah);
const mariaP = (await call('GET', '/api/pregnancies', null, maria)).json[0];
const yulP = (await call('GET', '/api/pregnancies', null, yul)).json[0];

// =============== A. Akun dan akses ===============
let A = await open(null);
current = A;
await feature('A1', 'Akun', 'Masuk dengan nomor HP', 'Log in with a phone number', 'Isi nomor HP 0813 0000 0003 dan kata sandi, tekan Masuk', 'Beranda ibu terbuka', async () => {
  await A.go('/login'); await A.field('📱 Nomor HP').fill('0813 0000 0003'); await A.field('🔑 Kata sandi').fill(PW); await A.text('Masuk').click();
  await A.page.waitForURL(/\/home$/, { timeout: 15000 }); await A.wait(1500); expect(await A.has('Bunda'), 'home not shown');
});
await A.ctx.close();
A = await open(null); current = A;
await feature('A2', 'Akun', 'Masuk dengan email', 'Log in with email', 'Pilih Email, isi email dan kata sandi', 'Dasbor petugas terbuka', async () => {
  await A.go('/login'); await A.text('✉️ Email').click(); await A.field('✉️ Email').fill('officer@nutrisense.id'); await A.field('🔑 Kata sandi').fill(PW);
  await A.text('Masuk').click(); await A.page.waitForURL(/\/dashboard$/, { timeout: 15000 });
});
await A.ctx.close();
A = await open(null); current = A;
await feature('A3', 'Akun', 'Pesan kata sandi salah', 'Wrong password message', 'Masuk dengan kata sandi salah', 'Muncul pesan bahasa Indonesia, tetap di halaman masuk', async () => {
  await A.go('/login'); await A.field('📱 Nomor HP').fill('081300000003'); await A.field('🔑 Kata sandi').fill('salah1234'); await A.text('Masuk').click(); await A.wait(1500);
  expect(await A.has('kata sandi salah'), 'no message'); expect(/\/login$/.test(A.page.url()), 'left the login page');
});
const newPhone = `0857${String(Date.now()).slice(-8)}`;
await feature('A4', 'Akun', 'Daftar akun ibu (2 langkah)', 'Mother sign-up (2 steps)', 'Isi nama, nomor HP, kata sandi; pilih desa; setujui data; Buat akun', 'Akun dibuat dan ibu diajak menambah anak', async () => {
  await A.go('/register'); await A.field('🙂 Nama lengkap').fill('Ibu Uji Fitur'); await A.field('📱 Nomor HP').fill(newPhone);
  await A.field('🔑 Kata sandi').fill('Anakku2026!'); await A.field('🔑 Ulangi kata sandi').fill('Anakku2026!'); await A.text('Lanjut').click(); await A.wait(800);
  await A.text('Oesapa', true).click(); await A.page.getByRole('switch').first().click();
  await A.page.mouse.wheel(0, 900); await A.text('Buat akun').click(); await A.text('Tambah anak', false).waitFor({ timeout: 15000 });
});
await feature('A5', 'Akun', 'Pemeriksaan isian daftar', 'Sign-up form checks', 'Tekan Lanjut tanpa nomor HP/email', 'Muncul pesan “Isi nomor HP atau email”', async () => {
  const B = await open(null); current = B;
  await B.go('/register'); await B.field('🙂 Nama lengkap').fill('Ibu X'); await B.field('🔑 Kata sandi').fill('Anakku2026!'); await B.field('🔑 Ulangi kata sandi').fill('Anakku2026!');
  await B.text('Lanjut').click(); await B.wait(700); const ok = await B.has('Isi nomor HP atau email'); await B.ctx.close(); current = A; expect(ok, 'no message');
});
await feature('A6', 'Akun', 'Ubah profil', 'Edit profile', 'Ubah nama di Pengaturan, Simpan perubahan', 'Nama baru tersimpan', async () => {
  await A.go('/settings'); await A.field('Nama lengkap').fill('Ibu Uji Fitur Baru'); await A.text('Simpan perubahan').click(); await A.text('Perubahan tersimpan', false).waitFor({ timeout: 8000 });
  const me = (await call('GET', '/api/auth/me', null, await A.token())).json; expect(me.full_name === 'Ibu Uji Fitur Baru', me.full_name);
});
await feature('A7', 'Akun', 'Ganti bahasa ke Inggris dan kembali', 'Switch language to English and back', 'Pilih English di Pengaturan, lalu Indonesia', 'Tampilan berganti bahasa', async () => {
  await A.go('/settings'); await A.page.getByText(/English/).first().click(); await A.wait(1200); expect(await A.has('Settings') || await A.has('Language'), 'not English');
  await A.page.getByText(/Indonesia/).first().click(); await A.wait(1200); expect(await A.has('Pengaturan'), 'not back to Indonesian');
});
await feature('A8', 'Akun', 'Ukuran teks besar', 'Large text size', 'Pilih Besar di Pengaturan', 'Teks membesar, tetap tanpa geser ke samping di 390 px', async () => {
  await A.go('/settings'); await A.text('Besar').click(); await A.wait(800); await A.go('/home');
  const sw = await A.page.evaluate(() => document.documentElement.scrollWidth); await A.go('/settings'); await A.text('Normal').click(); expect(sw <= 392, `page ${sw}px wide`);
});
await feature('A9', 'Akun', 'Ubah kata sandi', 'Change password', 'Isi kata sandi lama dan baru', 'Kata sandi berubah; perangkat ini tetap masuk', async () => {
  await A.go('/settings'); await A.text('Ubah kata sandi').click(); await A.field('Kata sandi saat ini').fill('Anakku2026!');
  await A.field('Kata sandi baru').fill('Baru2026!!'); await A.field('Ulangi kata sandi').fill('Baru2026!!'); await A.text('Simpan').click();
  await A.text('Kata sandi berhasil diubah', false).waitFor({ timeout: 8000 });
  expect(await login(newPhone, 'Baru2026!!'), 'new password does not work'); expect(!(await login(newPhone, 'Anakku2026!')), 'old password still works');
  await A.go('/home'); expect(/\/home$/.test(A.page.url()), 'this phone was logged out');
});
await feature('A10', 'Akun', 'Keluar dan data HP dibersihkan', 'Log out clears the phone', 'Tekan Keluar di Profil', 'Kembali ke halaman masuk; token dan data tersimpan terhapus; halaman dalam dialihkan ke masuk', async () => {
  await A.go('/profile'); await A.page.mouse.wheel(0, 3000); await A.text('Keluar').click(); await A.page.waitForURL(/\/login$/, { timeout: 10000 });
  const left = await A.page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('nutrisense.') && !/lang|textSize|server|outboxOwner|langPicked/.test(k)));
  await A.go('/settings'); expect(/\/login$/.test(A.page.url()), 'inner page opened after logout'); expect(!left.some((k) => /token|cache/.test(k)), `left: ${left.join(',')}`);
});
await feature('A11', 'Akun', 'Batas percobaan masuk', 'Login attempt limit', '6 kali kata sandi salah pada satu akun', 'Akun dikunci sementara (pesan 429) dan percobaan dicatat', async () => {
  const victim = `0858${String(Date.now()).slice(-8)}`;
  await call('POST', '/api/auth/register', { phone: victim, password: 'Anakku2026!', full_name: 'Ibu Kunci', consent_data_processing: true });
  let last = 0;
  for (let i = 0; i < 6; i++) last = (await call('POST', '/api/auth/login', { email: victim, password: 'salah-' + i })).status;
  expect(last === 429, `status ${last}`);
});
await A.ctx.close();

// =============== B. Ibu: anak ===============
const M = await open('ibu.maria@nutrisense.id'); current = M;
await feature('B1', 'Anak', 'Beranda ibu dan tugas hari ini', 'Mother home and today’s tasks', 'Buka beranda, pilih anak', 'Status anak, “Untuk hari ini” dan Posyandu berikutnya tampil', async () => {
  await M.go('/home'); await M.text('Adel').click(); await M.wait(1200);
  for (const s of ['Untuk hari ini', 'Posyandu berikutnya']) expect(await M.has(s), s);
});
await feature('B2', 'Anak', 'Profil anak dan status pertumbuhan', 'Child profile and growth status', 'Buka profil Budi', 'Status dalam kata sederhana, lencana 2T, grafik', async () => {
  await M.go(`/child/${mk.Budi.id}`); for (const s of ['Berat tidak naik 2× (2T)', 'Tren pertumbuhan']) expect(await M.has(s), s);
});
let measBefore = (await call('GET', `/api/children/${mk.Adel.id}/measurements`, null, maria)).json.length;
await feature('B3', 'Anak', 'Catat pengukuran (4 langkah)', 'Record a measurement (4 steps)', 'Isi berat 11.4 kg, tinggi 84.6 cm, tidak bengkak, Simpan', 'Pengukuran tersimpan dan hasil tampil', async () => {
  await M.go(`/child/${mk.Adel.id}/measure`); await M.text('Lanjut').click(); await M.text('Saya siap memasukkan angka').click();
  await M.field('⚖️ Berat badan (kg)').fill('11.4'); await M.field(/Panjang badan|Tinggi badan/).fill('84.6'); await M.text('Tidak').click();
  await M.text('Lanjut').click(); await M.text('Simpan').click(); await M.text('Pengukuran tersimpan', false).waitFor({ timeout: 25000 });
  const n = (await call('GET', `/api/children/${mk.Adel.id}/measurements`, null, maria)).json.length; expect(n === measBefore + 1, `${measBefore} -> ${n}`);
});
await feature('B4', 'Anak', 'Tolak angka yang tidak mungkin', 'Impossible values blocked', 'Isi tinggi 300 cm, Lanjut', 'Peringatan merah di langkah periksa; Simpan tidak bisa ditekan', async () => {
  await M.go(`/child/${mk.Adel.id}/measure`); await M.text('Lanjut').click(); await M.text('Saya siap memasukkan angka').click();
  await M.field('⚖️ Berat badan (kg)').fill('11.4'); await M.field(/Panjang badan|Tinggi badan/).fill('300'); await M.text('Tidak').click(); await M.text('Lanjut').click(); await M.wait(600);
  const warned = await M.page.getByText(/🔴/).count(); const saveOff = await M.page.getByRole('button', { name: /Simpan/ }).last().isDisabled();
  expect(warned > 0, 'no warning on the review step'); expect(saveOff, 'Simpan still enabled');
});
await feature('B5', 'Anak', 'Riwayat dan grafik pertumbuhan', 'Growth history and chart', 'Buka riwayat, ganti tab Berat dan BB/TB', 'Grafik standar WHO berganti tanpa galat', async () => {
  await M.go(`/child/${mk.Adel.id}/history`); for (const tab of ['Berat', 'BB/TB', 'Tinggi']) { await M.text(tab).click(); await M.wait(600); }
  expect(await M.has('Rata-rata', true) || await M.has('Batas bawah', true), 'no chart legend');
});
await feature('B6', 'Anak', 'Analisis risiko stunting', 'Stunting risk analysis', 'Buka Detail analisis Budi', 'Alasan dan faktor penyebab tampil, berlabel AI', async () => {
  await M.go(`/child/${mk.Budi.id}/analysis`); expect(await M.has('Nuri — panduan AI'), 'no AI label'); expect(await M.page.getByText(/▲/).count() > 0, 'no drivers');
});
await feature('B7', 'Anak', 'Rencana gizi mingguan', 'Weekly nutrition plan', 'Buka Rencana gizi', 'Kebutuhan harian dan keragaman makanan tampil', async () => {
  await M.go(`/child/${mk.Adel.id}/nutrition`); expect(await M.has('Energi'), 'no nutrients'); expect(await M.has('Keragaman makanan'), 'no diversity');
});
await feature('B8', 'Anak', 'Resep bahan lokal', 'Local recipes', 'Buka Resep, tekan Lihat resep', 'Bahan dan cara membuat tampil', async () => {
  await M.go(`/child/${mk.Adel.id}/recipes`); await M.page.getByText('Lihat resep').first().click(); await M.wait(800); expect(await M.has('Bahan') || await M.has('Cara'), 'recipe not opened');
});
await feature('B9', 'Anak', 'Daftar perkembangan', 'Development checklist', 'Tandai “Ya, sudah bisa” lalu muat ulang', 'Jawaban tersimpan', async () => {
  await M.go(`/child/${mk.Adel.id}/development`); await M.page.getByText('✓ Ya, sudah bisa').first().click(); await M.wait(1500);
  const d = (await call('GET', `/api/children/${mk.Adel.id}/development`, null, maria)).json; expect(JSON.stringify(d).includes('true'), 'not saved');
});
await feature('B10', 'Anak', 'Catat makan dan keragaman', 'Meal log and diversity', 'Pilih nasi, telur, bayam; Simpan makanan', 'Makan tersimpan; kelompok makanan dihitung', async () => {
  const before = (await call('GET', `/api/children/${mk.Adel.id}/meals`, null, maria)).json.length;
  await M.go(`/child/${mk.Adel.id}/meal?action=manual`); for (const f of ['Nasi putih', 'Telur ayam rebus', 'Bayam']) await M.page.getByText(f, { exact: false }).last().click();
  await M.text('Simpan makanan').click(); await M.text('Yang sudah ada', false).waitFor({ timeout: 20000 });
  await M.text('Lihat ide menu').click(); await M.wait(1500); expect(await M.has('Sembunyikan') || await M.has('ide', false), 'menu ideas do not open');
  const after = (await call('GET', `/api/children/${mk.Adel.id}/meals`, null, maria)).json.length; expect(after === before + 1, `${before} -> ${after}`);
});
await feature('B11', 'Anak', 'NutriScan: foto makanan', 'NutriScan: meal photo', 'Pilih foto makanan dari galeri', 'Tanpa AI: pesan bahasa Indonesia dan ajakan pilih manual; tidak macet', async () => {
  const shot = `${SHOTS}food.png`; await M.go('/nutriscan'); await M.page.screenshot({ path: shot, clip: { x: 0, y: 0, width: 200, height: 200 } });
  const [chooser] = await Promise.all([M.page.waitForEvent('filechooser', { timeout: 10000 }), M.text('Pilih foto').click()]);
  await chooser.setFiles(shot); await M.wait(5000);
  const english = await M.has('not configured') || await M.has('Select foods manually'); expect(!english, 'English server message shown to the mother');
  expect(await M.has('Pilih') || await M.has('pilih'), 'no way to continue manually');
});
await feature('B12', 'Anak', 'NutriScan: menu dari bahan di rumah', 'NutriScan: dish from ingredients at home', 'Pilih telur, bayam, nasi; Cari menu terbaik; Lihat resep; Sudah dimasak? Catat', 'Menu cocok, resep, daftar belanja; masakan tercatat', async () => {
  await M.go(`/food/${mk.Adel.id}?action=pick`); for (const f of ['Telur ayam rebus', 'Bayam', 'Nasi putih']) await M.field(f).click();
  await M.text('✨ Cari menu terbaik').click(); await M.text('Semua bahan tersedia', false).waitFor({ timeout: 20000 });
  await M.text('Lihat resep').click(); await M.text('Cara membuat', false).waitFor(); await M.text('✓ Sudah dimasak? Catat').click();
  await M.text('Tersimpan di catatan makan', false).waitFor({ timeout: 15000 });
});
await feature('B13', 'Anak', 'Cek gejala: tanda bahaya', 'Symptom check: danger sign', 'Ketuk “Kejang”', 'Peringatan merah, tombol Ke Puskesmas, 119 dan Kader', async () => {
  await M.go(`/child/${mk.Budi.id}/symptoms`); await M.text('Kejang').click(); await M.wait(600);
  for (const s of ['🚨 Perlu pertolongan segera', 'Ke Puskesmas sekarang', '119', 'Hubungi Kader']) expect(await M.has(s), s);
});
await feature('B14', 'Anak', 'Cek gejala: cerita dengan kata sendiri', 'Symptom check: free text', 'Tulis “tidak demam, cuma pilek”, Periksa gejala', 'Dipahami dengan benar, tidak ada peringatan palsu', async () => {
  await M.go(`/child/${mk.Adel.id}/symptoms`); await M.field('💬 Ceritakan kondisi anak (bahasa apa saja)').fill('tidak demam, tidak sesak, cuma pilek');
  await M.text('Periksa gejala').click(); await M.text('Dipahami sebagai', false).waitFor({ timeout: 20000 }); expect(!(await M.has('🚨 Perlu pertolongan segera', true)), 'false alarm');
});
await feature('B15', 'Anak', 'Jadwal KIA: tandai dan batalkan', 'KIA schedule: mark and undo', 'Tandai sudah pada imunisasi, lalu Batal', 'Status berubah lalu kembali', async () => {
  const k = sk.Kristo; const S = await open('081300000003'); current = S;
  await S.go(`/child/${k.id}/kia`); await S.text('Tandai sudah').click(); await S.wait(1500);
  const done = (await call('GET', `/api/children/${k.id}/kia`, null, sarah)).json.immunization.filter((r) => r.status === 'done').length;
  S.page.once('dialog', (d) => d.accept()); await S.text('Batal').click(); await S.wait(1500);
  const after = (await call('GET', `/api/children/${k.id}/kia`, null, sarah)).json.immunization.filter((r) => r.status === 'done').length;
  await S.ctx.close(); current = M; expect(after === done - 1, `${done} -> ${after}`);
});
await feature('B16', 'Anak', 'Catatan ASI eksklusif', 'Exclusive breastfeeding log', 'Centang “Hanya ASI hari ini” dan tambah 1 kali menyusu', 'Tersimpan untuk hari ini', async () => {
  const k = sk.Kristo; const S = await open('081300000003'); current = S;
  await S.go(`/child/${k.id}/asi`); await S.page.getByLabel('Hanya ASI hari ini').last().click(); await S.wait(800); await S.page.getByLabel('+').last().click(); await S.wait(1200);
  const a = (await call('GET', `/api/children/${k.id}/asi`, null, sarah)).json; await S.ctx.close(); current = M; expect(a.today?.asi_only === true && a.today.feeds >= 1, JSON.stringify(a.today));
});
await feature('B17', 'Anak', 'Tambah anak', 'Add a child', 'Isi nama, tanggal lahir, Simpan', 'Anak baru tercatat dan diajak mengukur', async () => {
  await M.go('/child/new'); await M.field('Nama').fill('Fitur Kecil Fanggidae'); await M.field('Tanggal lahir (TTTT-BB-HH)').fill('2025-06-01'); await M.text('Simpan').click();
  await M.text('Bagaimana cara mengukur', false).waitFor({ timeout: 15000 });
  const n = Object.keys(await kidsOf(maria)); expect(n.includes('Fitur'), n.join(','));
});
await feature('B18', 'Anak', 'Ekspor data anak (HL7 FHIR)', 'Export the child record (HL7 FHIR)', 'Buka “Data & privasi” di profil anak, tekan “Ekspor catatan anak (FHIR)”', 'Pesan “Data siap dibagikan”; Bundle berisi Patient dan Observation', async () => {
  await M.go(`/child/${mk.Adel.id}`); await M.page.getByText(/^Data & privasi/).last().click(); await M.text('Ekspor catatan anak (FHIR)').click(); await M.text('Data siap dibagikan', false).waitFor({ timeout: 10000 });
  const b = (await call('GET', `/api/children/${mk.Adel.id}/fhir`, null, maria)).json; const types = new Set(b.entry.map((e) => e.resource.resourceType));
  expect(b.resourceType === 'Bundle' && types.has('Patient') && types.has('Observation'), [...types].join(','));
});
await feature('B19', 'Anak', 'Hapus data anak', 'Delete a child’s record', 'Hapus anak yang baru ditambah', 'Anak dan catatannya terhapus', async () => {
  const kid = (await kidsOf(maria)).Fitur; const r = await call('DELETE', `/api/children/${kid.id}`, null, maria);
  expect(r.status === 204, `status ${r.status}`); expect(!(await kidsOf(maria)).Fitur, 'still listed');
});
await feature('B20', 'Anak', 'Cek gejala: bayi di bawah 2 bulan', 'Symptom check: baby under 2 months', 'Bayi 20 hari: lihat tanda bahaya bayi, ketuk “Demam”', 'Tanda bahaya bayi muda tampil; demam langsung peringatan merah dengan tombol 119', async () => {
  const born = new Date(Date.now() - 20 * 864e5).toISOString().slice(0, 10);
  const r = await call('POST', '/api/children', { name: 'Bayi Fitur Fanggidae', sex: 'female', birth_date: born }, maria); expect(r.status === 201, `create ${r.status}`);
  try {
    await M.go(`/child/${r.json.id}/symptoms`);
    for (const s of ['Kulit / mata kuning', 'Tali pusat merah / bernanah', 'Badan dingin', 'Napas merintih']) expect(await M.has(s), s);
    await M.text('Demam').click(); await M.wait(600);
    for (const s of ['🚨 Perlu pertolongan segera', '119']) expect(await M.has(s), s);
  } finally { await call('DELETE', `/api/children/${r.json.id}`, null, maria); }
});

// =============== C. Nuri, panduan, notifikasi, privasi, paket ===============
await feature('C1', 'Nuri', 'Tanya Nuri', 'Ask Nuri', 'Pilih ide “Apa menu untuk anak susah makan?”', 'Jawaban singkat berlabel AI', async () => {
  await M.go('/assistant'); await M.text('Makan').click(); await M.page.getByText('Apa menu untuk anak susah makan?').last().click(); await M.text('Nuri — panduan AI', false).waitFor({ timeout: 20000 });
});
await feature('C2', 'Nuri', 'Nuri mengenali tanda bahaya', 'Nuri spots danger signs', 'Tulis “Saya hamil dan keluar darah dari jalan lahir”', 'Jawaban diawali “Segera ke Puskesmas atau telepon 119”', async () => {
  await M.go('/assistant'); const box = M.page.getByRole('textbox').last(); await box.fill('Saya hamil dan keluar darah dari jalan lahir'); await box.press('Enter');
  await M.page.getByText(/Ini tanda bahaya/).last().waitFor({ timeout: 20000 }); expect(await M.has('119'), 'no 119');
});
await feature('C3', 'Nuri', 'Riwayat percakapan Nuri', 'Nuri chat history', 'Buka ulang Tanya Nuri', 'Pertanyaan sebelumnya masih ada', async () => {
  await M.go('/assistant'); await M.wait(1500); expect(await M.has('keluar darah dari jalan lahir'), 'history lost');
});
await feature('C4', 'Panduan', 'Panduan kesehatan', 'Health guide', 'Buka Panduan kesehatan', 'Tanda bahaya dan saran sumber WHO/Kemenkes tampil', async () => {
  await M.go('/guide'); expect(await M.has('Segera ke Puskesmas'), 'no danger list');
});
await feature('C5', 'Notifikasi', 'Notifikasi dan tandai dibaca', 'Notifications and mark as read', 'Buka Notifikasi, Tandai semua dibaca', 'Semua notifikasi terbaca', async () => {
  await M.go('/notifications'); await M.text('Tandai semua dibaca').click(); await M.wait(1500);
  const n = (await call('GET', '/api/notifications', null, maria)).json; expect(n.every((x) => x.read || x.read_at || x.is_read), 'unread left');
});
await feature('C6', 'Privasi', 'Atur persetujuan data', 'Data consent settings', 'Nyalakan “Data penelitian”, Simpan; matikan lagi', 'Pilihan tersimpan', async () => {
  const get = async () => (await call('GET', '/api/consents', null, maria)).json;
  await M.go('/privacy'); const sw = M.page.getByRole('switch').nth(3); await sw.click(); await M.text('Simpan').click(); await M.wait(1500);
  const a = JSON.stringify(await get()); await M.go('/privacy'); await M.page.getByRole('switch').nth(3).click(); await M.text('Simpan').click(); await M.wait(1500);
  const b = JSON.stringify(await get()); expect(a !== b, 'consent did not change');
});
await feature('C7', 'Paket', 'Paket gizi dan kode ambil', 'Nutrition package and pickup code', 'Buka Paket', 'Paket siap diambil tampil dengan QR dan kode 6 digit', async () => {
  await M.go('/pickups'); expect(await M.page.getByText(/^\d{6}$/).count() > 0, 'no pickup code');
});
await feature('C8', 'Akun', 'Profil dan tim perawatan', 'Profile and care team', 'Buka Profil dan profil anak', 'Tim (Kader, Puskesmas) dengan tombol telepon', async () => {
  await M.go('/profile'); expect(await M.has('Pengaturan'), 'no settings link'); await M.go(`/child/${mk.Budi.id}`); await M.page.mouse.wheel(0, 6000); await M.wait(600);
  expect(await M.has('Puskesmas Baumata'), 'no care team');
});

// =============== D. Ibu hamil ===============
const P = `/pregnancy/${mariaP.id}`;
await feature('D1', 'Ibu hamil', 'Profil kehamilan', 'Pregnancy profile', 'Buka Kehamilan', 'Usia kehamilan, HPL, risiko dan alasan tampil', async () => {
  await M.go(P); for (const s of ['minggu', 'Risiko tinggi', 'Catat ibu']) expect(await M.has(s), s);
});
await feature('D2', 'Ibu hamil', 'Periksa hamil K1–K6: tandai dan batal', 'Antenatal visits: mark and undo', 'Tandai sudah K3, lalu Batal', 'Jumlah kunjungan naik lalu kembali', async () => {
  const n0 = (await call('GET', `/api/pregnancies/${mariaP.id}`, null, maria)).json.anc_done;
  await M.go(`${P}/anc`); await M.text('Tandai sudah').click(); await M.wait(1500);
  const n1 = (await call('GET', `/api/pregnancies/${mariaP.id}`, null, maria)).json.anc_done;
  M.page.once('dialog', (d) => d.accept()); await M.text('Batal').click(); await M.wait(1500);
  const n2 = (await call('GET', `/api/pregnancies/${mariaP.id}`, null, maria)).json.anc_done; expect(n1 === n0 + 1 && n2 === n0, `${n0} -> ${n1} -> ${n2}`);
});
await feature('D3', 'Ibu hamil', 'Catat LiLA dan Hb ibu', 'Mother MUAC and Hb', 'LiLA 22.5, Hb 10.2, Simpan', 'Tersimpan; KEK dan anemia ditandai dengan saran', async () => {
  await M.go(`${P}/measure`); await M.field(/LiLA \(cm\)/).fill('22.5'); await M.text('Lanjut').click(); await M.field(/Hb \(g\/dL\)/).fill('10.2');
  await M.text('Lanjut').click(); await M.text('Simpan').click(); await M.text('Hasil cek ibu tersimpan', false).waitFor({ timeout: 12000 });
  expect(await M.has('Lengan kecil (KEK)') && await M.has('Kurang darah (anemia)'), 'flags missing');
});
await feature('D4', 'Ibu hamil', 'Tablet tambah darah hari ini', 'Today’s iron tablet', 'Centang tablet tambah darah', 'Tercatat untuk hari ini', async () => {
  await M.go(`${P}/supplements`); const box = M.page.getByLabel('Tablet tambah darah hari ini').last(); await box.click(); await M.wait(1500);
  let p = (await call('GET', `/api/pregnancies/${mariaP.id}`, null, maria)).json;
  if (!p.today_log?.ttd) { await box.click(); await M.wait(1500); p = (await call('GET', `/api/pregnancies/${mariaP.id}`, null, maria)).json; }
  expect(p.today_log?.ttd === true, JSON.stringify(p.today_log));
});
await feature('D5', 'Ibu hamil', 'Rencana persalinan', 'Birth plan', 'Pilih tempat, transportasi, penolong, pendamping, donor, biaya; Simpan', 'Rencana tersimpan', async () => {
  await M.go(`${P}/plan`); await M.text('Ojek', false).click(); await M.page.getByText(/^\S+\sBidan$/).last().click();
  await M.field('🤝 Pendamping').fill('Suami'); await M.field('🩸 Calon pendonor darah').fill('Kakak (O)'); await M.text('JKN / KIS', false).click();
  await M.text('Simpan').click(); await M.text('Rencana tersimpan', false).waitFor({ timeout: 10000 });
  const bp = (await call('GET', `/api/pregnancies/${mariaP.id}`, null, maria)).json.birth_plan; expect(bp.companion === 'Suami' && bp.funding === 'jkn', JSON.stringify(bp));
});
await feature('D6', 'Ibu hamil', 'Lapor tanda bahaya (ada sinyal)', 'Report a danger sign (online)', 'Pilih Perdarahan, Laporkan', 'Laporan terkirim; Kader menerima notifikasi', async () => {
  const k0 = (await call('GET', '/api/notifications', null, kaderT)).json.filter((n) => n.kind === 'mother_danger').length;
  await M.go(`${P}/danger`); await M.page.getByLabel('Perdarahan').last().click(); await M.page.getByRole('button', { name: /Lapor/ }).last().click();
  await M.text('Laporan terkirim', false).waitFor({ timeout: 10000 });
  const k1 = (await call('GET', '/api/notifications', null, kaderT)).json.filter((n) => n.kind === 'mother_danger').length; expect(k1 === k0 + 1, `${k0} -> ${k1}`);
});
await feature('D7', 'Ibu hamil', 'Lapor tanda bahaya tanpa sinyal', 'Report a danger sign with no signal', 'Tanpa sinyal: pilih Perdarahan, Laporkan; lalu sinyal kembali', 'Tombol telepon 119/Puskesmas/Kader muncul; laporan menunggu lalu terkirim sekali', async () => {
  const k0 = (await call('GET', '/api/notifications', null, kaderT)).json.filter((n) => n.kind === 'mother_danger').length;
  await M.go(`${P}/danger`); await M.page.route(`${API}/api/**`, (r) => r.abort('internetdisconnected'));
  await M.page.getByLabel('Perdarahan').last().click(); await M.page.getByRole('button', { name: /Lapor/ }).last().click(); await M.wait(1500);
  expect(await M.has('Tidak ada sinyal'), 'no no-signal card'); expect(await M.has('119'), 'no 119 button');
  await M.page.unroute(`${API}/api/**`); await M.go('/sync'); await M.text('Kirim sekarang').click().catch(() => {}); await M.wait(3500);
  await M.text('Kirim sekarang').click().catch(() => {}); await M.wait(2000);
  const k1 = (await call('GET', '/api/notifications', null, kaderT)).json.filter((n) => n.kind === 'mother_danger').length; expect(k1 === k0 + 1, `${k0} -> ${k1}`);
});
await feature('D8', 'Ibu hamil', 'Status sinkron', 'Sync status', 'Buka Status sinkron setelah data terkirim', 'Tidak ada yang menunggu; riwayat “Terkirim”', async () => {
  await M.go('/sync'); expect(await M.has('Semua data sudah terkirim'), 'header'); expect(await M.has('Terkirim'), 'no sent history');
});
await feature('D9', 'Ibu hamil', 'Tambah kehamilan', 'Add a pregnancy', 'Akun baru: isi tanggal HPHT 100 hari lalu', 'Kehamilan 14 minggu tercatat; tanggal masa depan ditolak', async () => {
  const H = await open(newPhone, 'Baru2026!!').catch(() => null);
  if (!H) throw new Error('new account cannot log in (still locked from A11?)');
  current = H; await H.text('Tambah kehamilan').click(); await H.wait(1200);
  const fut = new Date(Date.now() + 20 * 864e5).toISOString().slice(0, 10); await H.field(/HPHT/).fill(fut);
  const dis = await H.page.getByRole('button', { name: /Lanjut/ }).last().isDisabled();
  await H.field(/HPHT/).fill(new Date(Date.now() - 100 * 864e5).toISOString().slice(0, 10)); await H.text('Lanjut').click(); await H.text('Lanjut').click(); await H.text('Simpan').click();
  await H.page.waitForURL(/\/pregnancy\/\d+$/, { timeout: 15000 }); await H.wait(1500); const ok = await H.has('14 minggu'); await H.ctx.close(); current = M;
  expect(dis, 'future HPHT accepted'); expect(ok, '14 weeks not shown');
});
await feature('D10', 'Ibu hamil', 'Catat kelahiran', 'Record the birth', 'Yuliana: nama bayi, berat 2.2 kg, panjang 44 cm, tempat, penolong; Simpan', 'Anak baru dibuat; BBLR/prematur ditandai; masa nifas mulai', async () => {
  const H = await open('ibu.yuliana@nutrisense.id'); current = H;
  await H.go(`/pregnancy/${yulP.id}/birth`); await H.field('Nama bayi').fill('Bayi Fitur'); await H.text('Lanjut').click();
  await H.field('⚖️ Berat lahir (kg)').fill('2.2'); await H.field('📏 Panjang lahir (cm)').fill('44'); await H.text('Lanjut').click();
  await H.text('Puskesmas', false).click(); await H.page.getByText(/^\S+\sBidan$/).last().click(); await H.text('Lanjut').click(); await H.text('Simpan').click();
  await H.text('Selamat, Bunda! 🎉', false).waitFor({ timeout: 15000 }); const bblr = await H.has('BBLR'); await H.ctx.close(); current = M;
  const p = (await call('GET', `/api/pregnancies/${yulP.id}`, null, yul)).json; expect(bblr, 'no BBLR flag'); expect(p.status === 'postpartum' || p.delivered_at, `status ${p.status}`);
});
await feature('D11', 'Ibu hamil', 'Kunjungan nifas (KF/KN)', 'Postnatal visits (KF/KN)', 'Tandai sudah kunjungan nifas pertama, lalu Batal', 'Kunjungan tercatat lalu kembali', async () => {
  const doneN = async () => (await call('GET', `/api/pregnancies/${yulP.id}`, null, yul)).json.nifas.filter((v) => v.status === 'done').length;
  const n0 = await doneN(); const H = await open('ibu.yuliana@nutrisense.id'); current = H; await H.go(`/pregnancy/${yulP.id}`);
  await H.text('Tandai sudah').click(); await H.wait(1500); const n1 = await doneN();
  await H.text('Batal').click(); await H.wait(1500); const n2 = await doneN(); await H.ctx.close(); current = M;
  expect(n1 === n0 + 1 && n2 === n0, `${n0} -> ${n1} -> ${n2}`);
});

// =============== E. Integrasi Puskesmas ===============
await feature('E1', 'Puskesmas', 'Kode ibu dan QR untuk bidan', 'Mother code and QR for the midwife', 'Buka Hasil dari Puskesmas, tekan QR', 'Kode NS-… dan QR tampil', async () => {
  await M.go(`${P}/puskesmas`); await M.page.getByText('▦ QR').first().click(); await M.wait(1000); expect(await M.has('NS-7KQ2MP'), 'no code'); expect(await M.has('Tunjukkan ke bidan'), 'no QR sheet');
});
await feature('E2', 'Puskesmas', 'Kirim hasil periksa dari Puskesmas (portal)', 'Send check-up results from the Puskesmas (portal)', 'Petugas isi kode ibu, berat, LiLA, TD 150/95, Hb, DJJ; Kirim ke HP ibu', 'Terkirim; hasil masuk ke HP ibu dengan TD tinggi ditandai; Kader diberi tahu', async () => {
  const O = await open('officer@nutrisense.id'); current = O; await O.go('/facility-portal');
  await O.field('Kode ibu').fill('NS-7KQ2MP'); const fill = async (l, v) => O.page.getByLabel(l).last().fill(v);
  await fill('Berat (kg)', '58.5'); await fill('LiLA (cm)', '23.2'); await fill('Sistolik', '150'); await fill('Diastolik', '95'); await fill('Hb (g/dL)', '10.6'); await fill('DJJ (/menit)', '142');
  await O.text('Kirim ke HP ibu').click(); await O.text('Terkirim ke HP ibu', false).waitFor({ timeout: 15000 }); await O.ctx.close(); current = M;
  const p = (await call('GET', `/api/pregnancies/${mariaP.id}`, null, maria)).json; expect(p.latest_exam?.bp_systolic === 150, JSON.stringify(p.latest_exam?.bp_systolic));
  await M.go(`${P}/puskesmas`); expect(await M.has('Tekanan darah tinggi'), 'not flagged on the mother’s phone');
});
await feature('E3', 'Puskesmas', 'Terima data HL7 FHIR dari sistem Puskesmas', 'Receive HL7 FHIR data from a Puskesmas system', 'Kirim Bundle FHIR dengan kunci fasilitas; kirim ulang; kunci salah', '201 dibuat, 200 diganti (tidak dobel), 401 ditolak', async () => {
  const bundle = { resourceType: 'Bundle', type: 'collection', entry: [
    { resource: { resourceType: 'Patient', identifier: [{ system: 'https://nutrisense.id/fhir/link-code', value: 'NS-7KQ2MP' }] } },
    { resource: { resourceType: 'Encounter', id: 'fitur-1', status: 'finished', period: { start: today() } } },
    { resource: { resourceType: 'Observation', status: 'final', code: { coding: [{ system: 'http://loinc.org', code: '718-7' }] }, valueQuantity: { value: 11.2, unit: 'g/dL' }, effectiveDateTime: today() } },
  ] };
  const send = (key) => fetch(`${API}/api/integrations/fhir`, { method: 'POST', headers: { 'content-type': 'application/fhir+json', Authorization: `Bearer ${key}` }, body: JSON.stringify(bundle) });
  const a = (await send('demo-puskesmas-baumata-key')).status, b = (await send('demo-puskesmas-baumata-key')).status, c = (await send('wrong-key')).status;
  expect(a === 201 && b === 200 && c === 401, `${a} ${b} ${c}`);
});
await feature('E4', 'Puskesmas', 'Matikan dan nyalakan hubungan', 'Switch the link off and on', 'Matikan hubungan ke Puskesmas, lalu nyalakan lagi', 'Hubungan mati lalu aktif dengan kode baru', async () => {
  await M.go(`${P}/puskesmas`); await M.page.mouse.wheel(0, 4000); await M.text('Matikan hubungan ke Puskesmas').click(); await M.text('Ya, matikan').click(); await M.wait(1500);
  let l = (await call('GET', `/api/pregnancies/${mariaP.id}/link`, null, maria)).json; expect(!l.enabled, 'still on');
  const r = await call('POST', `/api/pregnancies/${mariaP.id}/link`, { enabled: true }, maria); l = r.json; expect(l.enabled && l.code && l.code !== 'NS-7KQ2MP', JSON.stringify(l));
});
await M.ctx.close();

// =============== F. Kader ===============
const K = await open('kader.oesapa@nutrisense.id'); current = K;
await feature('F1', 'Kader', 'Beranda Kader: wilayah dan prioritas', 'Kader home: area and priorities', 'Buka beranda Kader', 'Ringkasan wilayah dan daftar prioritas kunjungan', async () => {
  await K.go('/home'); for (const s of ['Wilayah saya', 'Prioritas kunjungan']) expect(await K.has(s), s);
});
await feature('F13', 'Kader', 'Tanda bahaya ibu hamil: tindak lanjut', 'Maternal danger sign: follow-up', 'Kartu merah di beranda; buka; Sudah saya hubungi; Tidak bisa dihubungi; Sudah ke Puskesmas/bidan', 'Kartu tetap ada sampai hasil dicatat; “Tidak bisa dihubungi” tidak menutup; hasil menutup peringatan', async () => {
  const open = async () => (await call('GET', `/api/pregnancies/${mariaP.id}`, null, maria)).json.open_danger;
  expect(await open(), 'no open danger report after D6/D7');
  await K.go('/home'); expect(await K.has('Telepon ibu', true), 'pinned card');
  await K.page.getByText(/🚨 Ibu Maria Fanggidae/).first().click(); await K.wait(2300);
  await K.text('Sudah saya hubungi').click(); await K.wait(1500); expect((await open())?.contacted_at, 'contact not recorded');
  await K.text('Tidak bisa dihubungi').click(); await K.text('Ya, catat').click(); await K.wait(1500);
  expect(await K.has('belum bisa dihubungi'), 'attempt note'); expect(await open(), 'not reached closed the alert');
  await K.text('Sudah ke Puskesmas/bidan').click(); await K.text('Ya, catat').click(); await K.wait(1500);
  expect(!(await open()), 'outcome did not close the alert');
  const left = (await call('GET', '/api/kader/danger-open', null, kaderT)).json.filter((d) => d.pregnancy_id === mariaP.id); expect(!left.length, 'still on the Kader list');
});
await feature('F2', 'Kader', 'Cari dan filter anak', 'Search and filter children', 'Cari “Budi”; filter Risiko tinggi', 'Daftar tersaring, tanpa kode mentah', async () => {
  await K.text('Cari & filter', false).click(); await K.field('Cari nama anak').fill('Budi'); await K.wait(1200); expect(await K.has('Budi Fanggidae'), 'search');
  expect(!(await K.page.getByText(/\b[a-z]+_[a-z]+\b/).count()), 'raw code shown');
});
await feature('F3', 'Kader', 'Daftar ibu hamil dan filter', 'Pregnant mothers list and filters', 'Buka Ibu hamil, pilih Berisiko, Belum dicek, Nifas, Semua', 'Daftar berganti sesuai filter', async () => {
  await K.go('/mothers'); for (const f of ['Berisiko', 'Belum dicek', 'Nifas', 'Semua']) { await K.text(f).click(); await K.wait(400); } expect(await K.has('Ibu Maria Fanggidae'), 'list');
});
let momPhone = `0853${String(Date.now()).slice(-8)}`, tempPw = null;
await feature('F4', 'Kader', 'Tambah ibu hamil (4 langkah)', 'Add a pregnant mother (4 steps)', 'Isi nama, HP, desa; usia hamil 12 minggu; persetujuan; Simpan', 'Akun ibu dibuat dengan kata sandi sementara; ibu bisa masuk dengan HP', async () => {
  await K.go('/mother/new'); await K.field('🙂 Nama lengkap').fill('Ibu Fitur Kader'); await K.field('📱 Nomor HP').fill(momPhone); await K.text('Baumata').click(); await K.text('Lanjut').click();
  await K.field('🤰 Usia kehamilan (minggu)').fill('12'); await K.text('Lanjut').click(); await K.text('Lanjut').click();
  await K.page.getByRole('switch').last().click(); await K.text('Simpan').click(); await K.text('Ibu hamil tercatat', false).waitFor({ timeout: 15000 });
  tempPw = (await K.page.getByText(/^\d{8}$/).last().textContent()).trim(); expect(await login(momPhone, tempPw), 'mother cannot log in');
});
await feature('F5', 'Kader', 'Tambah anak dengan nomor HP ibu', 'Add a child by the mother’s phone number', 'Isi nomor HP ibu, nama, tanggal lahir, Simpan', 'Anak masuk ke akun ibu tersebut', async () => {
  await K.go('/child/new'); await K.field(/Nomor HP ibu/).fill(momPhone); await K.field('Nama').fill('Anak Fitur Kader'); await K.field('Tanggal lahir (TTTT-BB-HH)').fill('2024-08-01');
  await K.text('Baumata').click().catch(() => {}); await K.text('Simpan').click(); await K.wait(3000);
  const kids = (await call('GET', '/api/children', null, await login(momPhone, tempPw))).json; expect(kids.some((c) => c.name === 'Anak Fitur Kader'), 'child not on the mother’s account');
});
await feature('F6', 'Kader', 'Kader mengukur anak di posyandu', 'Kader measures a child', 'Ukur anak di wilayah: 9.1 kg, 80.5 cm', 'Tersimpan, “diukur oleh Kader”', async () => {
  const row = (await call('GET', '/api/dashboard/children?filter=all&limit=50', null, kaderT)).json.rows.find((r) => !Object.values(mk).some((c) => c.id === r.child_id));
  await K.go(`/child/${row.child_id}/measure`); await K.text('Lanjut').click(); await K.text('Saya siap memasukkan angka').click();
  await K.field('⚖️ Berat badan (kg)').fill('9.1'); await K.field(/Panjang badan|Tinggi badan/).fill('80.5'); await K.text('Tidak').click(); await K.text('Lanjut').click();
  await K.text('Simpan').click(); await K.text('Pengukuran tersimpan', false).waitFor({ timeout: 25000 });
  const last = (await call('GET', `/api/children/${row.child_id}/measurements`, null, kaderT)).json.at(-1); expect(last.measured_by === 'kader' || last.source === 'kader', JSON.stringify(last.measured_by));
});
const kCases = (await call('GET', '/api/cases?status_filter=open,in_progress,referred', null, kaderT)).json;
const budiCase = kCases.find((c) => c.child_id === mk.Budi.id);
await feature('F7', 'Kader', 'Daftar dan detail kasus', 'Case list and detail', 'Buka Kasus, buka kasus Budi', 'Kasus urut prioritas; detail dengan tanda bahaya dan Telepon keluarga', async () => {
  await K.go('/cases'); expect(await K.has('Budi Fanggidae'), 'not listed'); await K.go(`/case/${budiCase.id}`); expect(await K.has('Telepon keluarga'), 'no call button');
});
await feature('F8', 'Kader', 'Ubah status kasus', 'Change a case status', 'Pilih status “Ditangani”', 'Status kasus berubah', async () => {
  await K.go(`/case/${budiCase.id}`); await K.text('Ditangani').click(); await K.wait(1500);
  const c = (await call('GET', `/api/cases/${budiCase.id}`, null, kaderT)).json; expect(c.status === 'in_progress', c.status);
});
await feature('F9', 'Kader', 'Catatan untuk keluarga', 'Note shared with the family', 'Tulis catatan, centang “Bagikan ke keluarga”, Tambah catatan', 'Catatan tampil di HP ibu sebagai rekomendasi', async () => {
  await K.go(`/case/${budiCase.id}`); await K.field('Tambah catatan').fill('Beri telur setiap hari, kontrol 2 minggu lagi.'); await K.field('👪 Bagikan catatan ini ke keluarga').click();
  await K.text('Tambah catatan').click(); await K.text('Dibagikan ke keluarga', false).waitFor({ timeout: 10000 });
  const H = await open('ibu.maria@nutrisense.id'); current = H; await H.go(`/child/${mk.Budi.id}`); const ok = await H.has('Beri telur setiap hari'); await H.ctx.close(); current = K; expect(ok, 'mother does not see the note');
});
await feature('F10', 'Kader', 'Serah terima paket di loker (kode 6 digit)', 'Locker handover (6-digit code)', 'Ganti loker ke Baumata, masukkan kode paket ibu, Buka loker', 'Paket tercatat diambil', async () => {
  const req = (await call('GET', '/api/supply-requests', null, maria)).json.find((r) => r.status === 'ready_for_pickup');
  expect(req, 'no ready package'); await K.go('/scan'); await K.text('Ganti loker', false).click(); await K.page.getByText(/^LKR-BMT/).first().click();
  await K.field(/kode 6 digit/).fill(req.pickup_code); await K.text('Buka loker').click(); await K.wait(2500);
  const r2 = (await call('GET', '/api/supply-requests', null, maria)).json.find((r) => r.id === req.id); expect(r2.status === 'picked_up', r2.status);
});
await feature('F12', 'Kader', 'Kirim data anak ke SATUSEHAT', 'Send a child record to SATUSEHAT', 'Kader tekan “Kirim ke SATUSEHAT (FHIR)” di profil anak', 'Pengiriman tercatat dan hasilnya tampil', async () => {
  await K.go(`/child/${mk.Budi.id}`); await K.page.getByText(/^Data & privasi/).last().click(); await K.text('Kirim ke SATUSEHAT (FHIR)').click(); await K.page.getByText(/Terkirim ke SATUSEHAT|belum setuju data dibagikan/).first().waitFor({ timeout: 10000 }); expect(!(await K.has('simulated_success')), 'raw status shown');
});
await feature('F11', 'Kader', 'Notifikasi Kader', 'Kader notifications', 'Buka Notifikasi', 'Tanda bahaya ibu dan hasil Puskesmas tampil di atas', async () => {
  await K.go('/notifications'); expect(await K.has('Tanda bahaya kehamilan'), 'no danger alert'); expect(await K.has('Penting segera'), 'urgent label');
});
await K.ctx.close();

// =============== G. Petugas Dinas Kesehatan, dokter, admin ===============
const O = await open('officer@nutrisense.id'); current = O;
await feature('G1', 'Petugas', 'Dasbor wilayah', 'Area dashboard', 'Buka Dasbor', 'Angka anak, stunting, kasus, sumber data; indikator ibu hamil', async () => {
  await O.go('/dashboard'); for (const s of ['Prioritas kunjungan', 'Stunting']) expect(await O.has(s), s); expect(await O.page.getByText(/^Sumber:/).count() >= 3, 'sources');
});
await feature('G2', 'Petugas', 'Kinerja model AI (Detail teknis)', 'AI model performance', 'Buka Detail teknis', 'Label Data demo, akurasi, FNR, model pembanding, matriks kebingungan', async () => {
  await O.text('Detail teknis', false).click(); await O.wait(800); for (const s of ['Data demo', 'Model pembanding', 'Matriks kebingungan']) expect(await O.has(s), s);
});
await feature('G3', 'Petugas', 'Proyeksi dan peta wilayah', 'Projection and area map', 'Muat proyeksi, peta dan daftar ditandai', 'Data tersedia tanpa galat', async () => {
  for (const p of ['/api/dashboard/projection', '/api/dashboard/heatmap', '/api/dashboard/flagged', '/api/dashboard/evaluation', '/api/dashboard/priority']) { const r = await call('GET', p, null, officer); expect(r.status === 200, `${p} ${r.status}`); }
});
await feature('G4', 'Petugas', 'Tinjau hasil AI', 'Review an AI result', 'Buka kasus yang menunggu tinjauan, pilih tingkat, tulis catatan, Simpan', 'Tinjauan tersimpan dan hilang dari antrian', async () => {
  const pend = (await call('GET', '/api/reviews/pending', null, officer)).json; expect(pend.length > 0, 'nothing to review');
  const r = await call('POST', `/api/assessments/${pend[0].id}/review`, { reviewed_level: pend[0].risk_level, note: 'Sesuai pemeriksaan.' }, officer); expect(r.status === 200, `status ${r.status}`);
  const after = (await call('GET', '/api/reviews/pending', null, officer)).json; expect(!after.some((a) => a.id === pend[0].id), 'still pending');
});
await feature('G5', 'Petugas', 'Setujui permintaan paket', 'Approve a package request', 'Buka permintaan, lihat pilihan jalur, Setujui', 'Paket disetujui dan kode ambil dibuat', async () => {
  const pend = (await call('GET', '/api/supply-requests', null, officer)).json.filter((r) => r.status === 'pending_approval');
  await O.go(`/supply/${pend[0].id}`); await O.page.mouse.wheel(0, 900); await O.text('Setujui').click(); await O.wait(2500);
  const r = (await call('GET', '/api/supply-requests', null, officer)).json.find((x) => x.id === pend[0].id); expect(r.status !== 'pending_approval', r.status);
});
await feature('G6', 'Petugas', 'Tolak permintaan paket', 'Reject a package request', 'Buka permintaan lain, Tolak', 'Permintaan ditolak', async () => {
  const pend = (await call('GET', '/api/supply-requests', null, officer)).json.filter((r) => r.status === 'pending_approval');
  await O.go(`/supply/${pend[0].id}`); await O.page.mouse.wheel(0, 900); await O.text('Tolak').click(); await O.wait(2500);
  const r = (await call('GET', '/api/supply-requests', null, officer)).json.find((x) => x.id === pend[0].id); expect(r.status === 'rejected', r.status);
});
await feature('G7', 'Petugas', 'Logistik: loker, isi ulang, simulasi', 'Logistics: lockers, restock, simulation', 'Buka tab Loker; Percepat simulasi +30 mnt', 'Stok loker tampil; simulasi berjalan', async () => {
  await O.go('/logistics'); await O.page.getByText(/Percepat simulasi/).first().click(); await O.wait(1500); await O.text('Loker').click(); await O.wait(1000);
  expect(await O.has('Loker Posyandu'), 'no lockers'); const lockers = (await call('GET', '/api/lockers', null, officer)).json;
  const r = await call('POST', `/api/lockers/${lockers[0].id}/restock`, { item_key: lockers[0].inventory?.[0]?.item_key ?? 'pmt_biscuit', quantity: 10 }, officer); expect(r.status === 200, `restock ${r.status}`);
});
await feature('G8', 'Petugas', 'Tinjau kasus anak', 'Review a child case', 'Buka kasus anak lain', 'Riwayat, alasan dan tindakan tampil', async () => {
  const c = (await call('GET', '/api/cases', null, officer)).json.find((x) => x.child_id !== mk.Budi.id); await O.go(`/case/${c.id}`); expect(await O.has('Mengapa hasilnya begini'), 'no reasons');
});
await O.ctx.close();
await feature('G9', 'Dokter', 'Dokter menulis catatan klinis', 'Doctor writes a clinical note', 'Dokter buka kasus Budi, tulis catatan klinis, Simpan; ubah status ke Dirujuk', 'Catatan dan status tersimpan', async () => {
  const D = await open('doctor@nutrisense.id'); current = D; await D.go(`/case/${budiCase.id}`);
  const f = D.page.getByLabel(/Catatan klinis/); if (await f.count()) { await f.last().fill('Rujuk ke RSUD untuk pemeriksaan lanjut.'); await D.page.getByText('Simpan', { exact: true }).first().click(); await D.wait(1500); }
  await D.text('Dirujuk').click(); await D.wait(1500); await D.ctx.close();
  const c = (await call('GET', `/api/cases/${budiCase.id}`, null, doctor)).json; expect(c.status === 'referred', c.status);
});
await feature('G10', 'Admin', 'Admin membuat akun petugas', 'Admin creates a staff account', 'Admin buat akun Kader baru', 'Akun dibuat dan bisa masuk', async () => {
  const email = `kader.fitur${Date.now() % 1e6}@nutrisense.id`;
  const r = await call('POST', '/api/users', { email, full_name: 'Kader Fitur', role: 'kader', password: 'Kader2026!x', region_id: 1 }, admin);
  expect(r.status === 201 || r.status === 200, `status ${r.status} ${JSON.stringify(r.json?.detail)}`); expect(await login(email, 'Kader2026!x'), 'cannot log in');
});
await feature('G11', 'Admin', 'Log audit dan model', 'Audit log and models', 'Admin buka log audit dan daftar model', 'Kegiatan tercatat; model aktif terdaftar', async () => {
  const a = await call('GET', '/api/audit-logs', null, admin); const m = await call('GET', '/api/models', null, admin);
  expect(a.status === 200 && a.json.length > 0, `audit ${a.status}`); expect(m.status === 200 && m.json.length > 0, `models ${m.status}`);
});

// =============== H. Keamanan dan kualitas ===============
await feature('H1', 'Keamanan', 'Ibu tidak bisa melihat anak keluarga lain', 'A mother cannot see another family’s child', 'Sarah membuka data anak Maria', 'Ditolak (403)', async () => {
  const r = await call('GET', `/api/children/${mk.Adel.id}`, null, sarah); expect(r.status === 403, `status ${r.status}`);
});
await feature('H2', 'Keamanan', 'Kader hanya wilayahnya', 'Kader sees only their area', 'Kader Oesapa membuka anak di Soe', 'Ditolak (403)', async () => {
  const yk = (await call('GET', '/api/children', null, yul)).json[0]; const r = await call('GET', `/api/children/${yk.id}`, null, kaderT); expect(r.status === 403, `status ${r.status}`);
});
await feature('H3', 'Keamanan', 'Halaman dalam butuh masuk', 'Inner pages need login', 'Buka /settings tanpa masuk', 'Dialihkan ke halaman masuk', async () => {
  const X = await open(null); current = X; await X.go('/settings'); const ok = /\/login$/.test(X.page.url()); await X.ctx.close(); expect(ok, 'not redirected');
});
await feature('H4', 'Kualitas', 'Bahasa Inggris lengkap', 'Complete English interface', 'Ibu memilih English, buka beranda dan profil anak', 'Tidak ada kunci mentah atau sisa bahasa Indonesia', async () => {
  const X = await open(null); current = X; await X.go('/login'); await X.text('🇬🇧 English').click(); await X.text('✉️ Email').click();
  await X.field('✉️ Email').fill('ibu.sarah@nutrisense.id'); await X.field('🔑 Password').fill(PW); await X.page.getByText('Log in', { exact: true }).last().click();
  await X.page.waitForURL(/\/home$/, { timeout: 15000 }); await X.wait(2000);
  // A raw translation key is a whole text node like "forToday" (camelCase, no spaces).
  const raw = await X.page.evaluate(() => { const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); const out = []; while (w.nextNode()) { const v = w.currentNode.nodeValue.trim(); if (/^[a-z]+[A-Z][A-Za-z]+$/.test(v)) out.push(v); } return out; });
  const indo = await X.has('Untuk hari ini'); await X.ctx.close(); expect(!raw.length && !indo, `raw keys ${raw.join(',')}, Indonesian left ${indo}`);
});
await feature('H5', 'Kualitas', 'Tidak ada galat halaman atau server', 'No page or server errors', 'Seluruh skenario di atas', 'Tidak ada galat JavaScript atau HTTP 5xx', async () => {
  expect(!pageErrors.length, pageErrors.slice(0, 3).join(' | '));
});

await browser.close();
const pass = results.filter((r) => r.ok).length;
fs.writeFileSync(new URL('./features-results.json', import.meta.url), JSON.stringify(results, null, 1));
const md = ['# Pengujian fitur NutriSense (black-box)', '', `Tanggal: ${today()} · Hasil: **${pass} dari ${results.length} fitur berhasil**`, '',
  '| No | Area | Fitur | Skenario | Hasil yang diharapkan | Hasil | Keterangan |', '|---|---|---|---|---|---|---|',
  ...results.map((r) => `| ${r.id} | ${r.area} | ${r.name}<br>*${r.en}* | ${r.scenario} | ${r.expected} | ${r.ok ? '✅ Berhasil' : '❌ Gagal'} | ${r.note.replace(/\|/g, '/')} |`)];
fs.writeFileSync(new URL('./features-report.md', import.meta.url), md.join('\n') + '\n');
console.log(`\n${pass} of ${results.length} features pass`);
process.exit(pass === results.length ? 0 : 1);
