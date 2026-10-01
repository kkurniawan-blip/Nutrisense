// End-to-end check of NutriSense in a real browser, as a mother, a Kader, an officer and a doctor.
//
// Needs the backend running on a fresh demo database and the web app being served (see README.md).
// Every step fails on: a JavaScript error, a console error, an API response >= 400, or a failed check.
// A screenshot of every step is saved to ./screenshots. Exits with code 1 if any step fails.

import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const APP = process.env.APP_URL ?? 'http://localhost:8081';
const API = process.env.API_URL ?? 'http://localhost:8000';
const OUT = new URL('./screenshots/', import.meta.url).pathname;
const PASSWORD = 'Demo1234!';
mkdirSync(OUT, { recursive: true });

// ---- look up demo data through the API, so the script does not depend on database ids ----
async function apiLogin(email, password = PASSWORD) {
  const r = await fetch(`${API}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) });
  if (!r.ok) throw new Error(`Cannot log in ${email} (${r.status}). Is the backend running on ${API} with demo data?`);
  return (await r.json()).access_token;
}
const get = async (token, path) => (await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } })).json();

const [mom, kader, officer] = await Promise.all(['ibu.maria@nutrisense.id', 'kader.oesapa@nutrisense.id', 'officer@nutrisense.id'].map((e) => apiLogin(e)));
const momKids = await get(mom, '/api/children');
const [kid1, kid2] = momKids;
const first = (c) => c.name.split(' ')[0];
const momKidIds = new Set(momKids.map((c) => c.id));
const kaderCases = await get(kader, '/api/cases?status_filter=open,in_progress,referred');
const kid2Case = kaderCases.find((c) => c.child_id === kid2.id);
const otherCases = kaderCases.filter((c) => !momKidIds.has(c.child_id));
const areaChild = (await get(kader, '/api/dashboard/children?filter=all&limit=50')).rows.find((r) => !momKidIds.has(r.child_id));
const pending = (await get(officer, '/api/supply-requests')).filter((r) => r.status === 'pending_approval');
if (!kid2Case || otherCases.length < 2 || !areaChild || pending.length < 2) {
  throw new Error('Demo data is not in its starting state. Restart the backend on a fresh database (see README.md).');
}

// ---- runner ----
const results = [];
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});

async function session(label, login, fn) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const issues = [];
  let expected = []; // API errors a step deliberately causes (e.g. a wrong password)
  page.on('pageerror', (e) => issues.push(`JS error: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) issues.push(`console: ${m.text().slice(0, 160)}`);
  });
  page.on('response', (r) => {
    const path = r.url().replace(API, '');
    if (r.url().startsWith(`${API}/api/`) && r.status() >= 400 && !expected.some((x) => path.startsWith(x))) {
      issues.push(`HTTP ${r.status()} ${r.request().method()} ${path}`);
    }
  });
  const step = async (name, f, { allow = [] } = {}) => {
    issues.length = 0;
    expected = allow;
    try {
      await f();
      await page.waitForTimeout(1200);
    } catch (e) {
      issues.push(`FAILED: ${e.message.split('\n')[0].slice(0, 200)}`);
    }
    const n = String(results.length + 1).padStart(2, '0');
    await page.screenshot({ path: `${OUT}${n}-${label}-${name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png` }).catch(() => undefined);
    results.push({ label, name, ok: issues.length === 0, issues: [...issues] });
    expected = [];
  };
  const go = async (path) => {
    await page.goto(`${APP}${path}`);
    await page.waitForTimeout(2200);
  };
  const scroll = async (y) => {
    await page.mouse.move(195, 500);
    await page.mouse.wheel(0, y);
    await page.waitForTimeout(400);
  };
  // The web build keeps earlier screens mounted underneath, so always act on the last match.
  const text = (s, exact = true) => page.getByText(s, { exact }).last();
  const field = (label) => page.getByLabel(label).last();
  if (login) {
    await page.goto(`${APP}/login`);
    await page.waitForTimeout(2000);
    await page.getByText(login).click();
    await text('Masuk').click();
    await page.waitForTimeout(2500);
  }
  await fn({ page, step, go, scroll, text, field });
  await ctx.close();
}

const measure = async ({ go, text, field }, childId, kg, cm) => {
  await go(`/child/${childId}/measure`);
  await text('Lanjut').click();
  await text('Saya siap memasukkan angka').click();
  await field('⚖️ Berat badan (kg)').fill(kg);
  await field(/Panjang badan|Tinggi badan/).fill(cm);
  await text('Tidak').click(); // oedema: no
  await text('Lanjut').click();
  await text('Simpan').click();
  await text('Pengukuran tersimpan', false).waitFor({ timeout: 20000 });
};
const SYMPTOM_BOX = '💬 Ceritakan kondisi anak (bahasa apa saja)';

// ---- sign-up, settings and password (a brand-new mother) ----
await session('signup', null, async ({ page, step, go, scroll, text, field }) => {
  const email = `ibu.uji${Date.now() % 1e6}@example.id`;
  await step('login page', async () => {
    await go('/login');
    await text('✉️ Email').click();
    await field('✉️ Email').fill('ibu.maria@nutrisense.id');
    await field('🔑 Kata sandi').fill('salah12345');
    await text('Masuk').click();
    await text('atau kata sandi salah', false).waitFor();
    await text('Lupa kata sandi?').click();
  }, { allow: ['/api/auth/login'] });
  await step('sign-up step 1 shows mistakes', async () => {
    await text('Daftar sebagai Ibu / pengasuh').click();
    await text('Lanjut').click();
    await text('Mohon isi nama Anda', false).waitFor();
  });
  await step('sign-up step 1 filled', async () => {
    await field('🙂 Nama lengkap').fill('Ibu Yohana Lede');
    await field('📱 Nomor HP').fill(`0857${String(Date.now()).slice(-8)}`);
    await field('✉️ Email (opsional)').fill(email);
    await field('🔑 Kata sandi').fill('Anakku2026!');
    await field('🔑 Ulangi kata sandi').fill('Anakku2026!');
    await text('Kata sandi kuat', false).waitFor();
  });
  await step('sign-up step 2 and create account', async () => {
    await text('Lanjut').click();
    await text('Oesapa', true).click();
    await page.getByRole('switch').first().click();
    await scroll(900);
    await text('Buat akun').click();
    await text('Tambah anak', false).waitFor({ timeout: 15000 });
  });
  await step('edit profile in settings', async () => {
    await go('/settings');
    await field('Nama lengkap').fill('Ibu Yohana Lede Bana');
    await text('Simpan perubahan').click();
    await text('Perubahan tersimpan', false).waitFor();
  });
  await step('change password', async () => {
    await text('Ubah kata sandi').click();
    await field('Kata sandi saat ini').fill('Anakku2026!');
    await field('Kata sandi baru').fill('Baru2026!!');
    await field('Ulangi kata sandi').fill('Baru2026!!');
    await text('Simpan').click();
    await text('Kata sandi berhasil diubah', false).waitFor();
  });
  await step('text size', async () => {
    await text('Besar').click();
    await go('/home');
    await go('/settings');
    await text('Normal').click();
  });
  await step('log out and back in with the new password', async () => {
    await scroll(4000);
    await text('Keluar').click();
    await page.waitForURL(/\/login$/);
    await text('✉️ Email').click();
    await field('✉️ Email').fill(email);
    await field('🔑 Kata sandi').fill('Baru2026!!');
    await text('Masuk').click();
    await page.waitForURL(/\/home$/, { timeout: 15000 });
  });
});

// ---- mother ----
await session('mother', 'ibu.maria@nutrisense.id', async (h) => {
  const { page, step, go, scroll, text, field } = h;
  await step('home today checklist', async () => {
    await go('/home');
    await text('Untuk hari ini').waitFor();
  });
  await step('child profile', async () => {
    await go(`/child/${kid1.id}`);
    await scroll(1500);
    await scroll(1500);
  });
  await step('growth history chart tabs', async () => {
    await go(`/child/${kid1.id}/history`);
    await text('Berat').click();
    await text('Tinggi').click();
  });
  await step('development checklist', async () => {
    await go(`/child/${kid1.id}/development`);
    await page.getByText('✓ Ya, sudah bisa').first().click();
  });
  await step('recipes', async () => {
    await go(`/child/${kid1.id}/recipes`);
    await page.getByText('Lihat resep').first().click();
  });
  await step('nutrition plan', () => go(`/child/${kid1.id}/nutrition`));
  await step('guided measurement', () => measure(h, kid1.id, '11.3', '84.2'));
  await step('log a meal', async () => {
    await go(`/child/${kid1.id}/meal?action=manual`);
    for (const f of ['Nasi putih', 'Telur ayam rebus', 'Bayam']) await page.getByText(f, { exact: false }).last().click();
    await text('Simpan makanan').click();
    await text('Yang sudah ada', false).waitFor({ timeout: 20000 });
  });
  await step('symptoms: tapping a danger sign warns at once', async () => {
    await go(`/child/${kid1.id}/symptoms`);
    await text('Kejang').click();
    await text('🚨 Perlu pertolongan').waitFor();
  });
  await step('symptoms: typed danger sign gives one clear warning', async () => {
    await go(`/child/${kid2.id}/symptoms`);
    await field(SYMPTOM_BOX).fill('badannya panas sejak kemarin dan napasnya cepat sekali');
    await text('Periksa gejala').click();
    await text('Dipahami sebagai', false).waitFor({ timeout: 20000 });
    const warnings = await page.getByText('🚨 Perlu pertolongan', { exact: true }).count();
    if (warnings !== 1) throw new Error(`expected 1 red warning, found ${warnings}`);
    if (await page.getByText('Tidak apa-apa, Bunda', { exact: false }).count()) throw new Error('reassuring text shown in an emergency');
    await text('Bunda tidak sendiri', false).waitFor();
  });
  await step('symptoms: negated text stays calm', async () => {
    await go(`/child/${kid1.id}/symptoms`);
    await field(SYMPTOM_BOX).fill('tidak demam, tidak sesak, cuma pilek');
    await text('Periksa gejala').click();
    await text('Dipahami sebagai', false).waitFor({ timeout: 20000 });
    if (await page.getByText('🚨 Perlu pertolongan', { exact: true }).count()) throw new Error('false emergency');
  });
  await step('nutriscan start screen', async () => {
    await go('/nutriscan');
    await text('Foto makanan').waitFor();
    await text('kelompok hari ini', false).waitFor();
  });
  await step('nutriscan: foods on hand to the best dish', async () => {
    await go(`/food/${kid1.id}?action=pick`);
    for (const f of ['Telur ayam rebus', 'Bayam', 'Nasi putih']) await field(f).click();
    await text('✨ Cari menu terbaik').click();
    await text(`Cocok untuk ${first(kid1)}`, false).waitFor({ timeout: 20000 });
    await text('Semua bahan tersedia', false).waitFor();
  });
  await step('nutriscan: noodle swap, recipe and shopping list', async () => {
    await go(`/food/${kid1.id}?action=pick`);
    for (const f of ['Nasi putih', 'Mi instan (matang)']) await field(f).click();
    await text('✨ Cari menu terbaik').click();
    await text('Mi instan sedikit gizinya', false).waitFor({ timeout: 20000 });
    await text('Lihat resep').click();
    await text('Cara membuat', false).waitFor();
    await text('Perlu dibeli atau dipetik', false).waitFor();
  });
  await step('nutriscan: cooked dish is logged as a meal', async () => {
    await text('✓ Sudah dimasak? Catat').click();
    await text('Tersimpan di catatan makan', false).waitFor({ timeout: 15000 });
  });
  await step('tanya nuri', async () => {
    await go('/assistant');
    await text('Makan').click();
    await page.getByText('Apa menu untuk anak susah makan?').last().click();
    await text('Nuri — panduan AI', false).waitFor({ timeout: 20000 });
  });
  await step('packages', async () => {
    await go('/pickups');
    await text('Paket gizi').waitFor();
  });
  await step('privacy switches', async () => {
    await go('/privacy');
    await page.getByRole('switch').nth(3).click();
    await page.waitForTimeout(1000);
    await page.getByRole('switch').nth(3).click();
  });
  await step('health guide', () => go('/guide'));
  await step('add a child', async () => {
    await go('/child/new');
    await field('Nama').fill('Maria Kecil Fanggidae');
    await field('Tanggal lahir (TTTT-BB-HH)').fill('2025-06-01');
    await text('Simpan').click();
    await text('Bagaimana cara mengukur', false).waitFor({ timeout: 15000 });
  });
});

// ---- Kader ----
await session('kader', 'kader.oesapa@nutrisense.id', async (h) => {
  const { page, step, go, scroll, text, field } = h;
  await step('home my area', async () => {
    await go('/home');
    await text('Wilayah saya', false).waitFor();
  });
  await step('filters and paging', async () => {
    await text('Semua').click();
    await text('Filter lainnya', false).click();
    await text('🔴 Risiko tinggi').click();
    await page.waitForTimeout(1000);
    await text('Hapus filter').click();
    await scroll(20000);
    const all = page.getByText(/^Lihat semua \(\d+\)/);
    if (await all.count()) await all.first().click();
    const more = page.getByText('Tampilkan lagi', { exact: false });
    if (await more.count()) await more.last().click();
  });
  await step('search shows plain words, no codes', async () => {
    await go('/home');
    await field('Cari nama anak').fill(first(kid2));
    await page.waitForTimeout(1500);
    const code = page.getByText(/[a-z]+_[a-z]+/);
    if (await code.count()) throw new Error(`raw code visible: ${await code.first().innerText()}`);
    await page.getByText(new RegExp(first(kid2))).last().click();
  });
  await step('cases', () => go('/cases'));
  await step('share a note with the family', async () => {
    await go(`/case/${kid2Case.id}`);
    await scroll(1500);
    await field('Tambah catatan').fill('Sudah dikunjungi. Beri telur setiap hari dan kontrol 2 minggu lagi.');
    await field('👪 Bagikan catatan ini ke keluarga').click();
    await text('Tambah catatan').click();
    await text('Dibagikan ke keluarga', false).waitFor({ timeout: 10000 });
  });
  await step('logistics', () => go('/logistics'));
  await step('locker pickup screen', () => go('/scan'));
  await step('measure a child', () => measure(h, areaChild.child_id, '9.1', '80.5'));
  await step('settings opened directly keeps saved details', async () => {
    await go('/settings');
    const v = await field('Nama lengkap').inputValue();
    if (!v.startsWith('Kader')) throw new Error(`name field shows "${v}"`);
  });
});

// ---- officer and doctor ----
await session('officer', 'officer@nutrisense.id', async ({ page, step, go, scroll, text }) => {
  await step('dashboard', async () => {
    await go('/dashboard');
    await scroll(1500);
  });
  await step('cases and reviews', () => go('/cases'));
  await step('package options are readable', async () => {
    await go(`/supply/${pending[1].id}`);
    await scroll(900);
    for (const bad of ['too far for family', 'hub_out_of_stock', 'why_', 'drone']) {
      if (await page.getByText(bad, { exact: false }).count()) throw new Error(`raw text shown: ${bad}`);
    }
  });
  await step('approve a package', async () => {
    await go(`/supply/${pending[0].id}`);
    await scroll(900);
    await text('Setujui').click();
    await page.waitForTimeout(2000);
  });
  await step('logistics: requests and lockers, no drones', async () => {
    await go('/logistics');
    await text('Loker').click();
    if (await page.getByText('drone', { exact: false }).count()) throw new Error('drone still shown');
  });
  await step('review a case', async () => {
    await go(`/case/${otherCases[0].id}`);
    await scroll(1200);
  });
});
await session('doctor', 'doctor@nutrisense.id', async ({ step, go, scroll }) => {
  await step('dashboard', () => go('/dashboard'));
  await step('case', async () => {
    await go(`/case/${otherCases[1].id}`);
    await scroll(1200);
  });
});

// ---- back to the mother: the Kader's note arrived ----
await session('mother', 'ibu.maria@nutrisense.id', async ({ page, step, go, text }) => {
  await step('sees Kader note as recommendation', async () => {
    await go(`/child/${kid2.id}`);
    await text('Rekomendasi tenaga kesehatan', false).waitFor({ timeout: 10000 });
    await text('Beri telur setiap hari', false).waitFor();
  });
  await step('notification in her language and date format', async () => {
    await go('/notifications');
    await page.getByText('Pesan dari tenaga kesehatan', { exact: true }).first().waitFor();
    if (await page.getByText(/[a-z] \/ [A-Z]/).count()) throw new Error('mixed-language notification');
    if (await page.getByText(/\d+\/\d+\/\d{4}/).count()) throw new Error('US-style date shown');
  });
});

// ---- logged out: inner screens go to login ----
await session('logged-out', null, async ({ page, step, go }) => {
  await step('inner screens redirect to login', async () => {
    for (const path of ['/settings', `/child/${kid1.id}`, `/case/${kid2Case.id}`]) {
      await go(path);
      await page.waitForTimeout(800);
      if (!page.url().endsWith('/login')) throw new Error(`${path} stayed on ${page.url()}`);
    }
  }, { allow: ['/api/'] });
});

await browser.close();
const failed = results.filter((r) => !r.ok);
for (const r of results) {
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  [${r.label}] ${r.name}${r.ok ? '' : `\n        ${r.issues.join('\n        ')}`}`);
}
console.log(`\n${results.length - failed.length}/${results.length} steps passed. Screenshots: ${OUT}`);
process.exit(failed.length ? 1 : 0);
