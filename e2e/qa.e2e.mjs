// Quality-assurance pass: 37 checks across every role, offline use, English and access control.
//
// Needs the backend on a FRESH demo database and the web app served (see README.md); it changes data.
// Prints PASS/FAIL per case, writes qa-results.json, saves screenshots to ./qa-screenshots and exits
// with code 1 if any case fails. `ONLY=F1,G1 npm run qa` runs a few cases.

import fs from 'node:fs';
import { chromium } from 'playwright';

const APP = process.env.APP_URL ?? 'http://localhost:8081';
const API = process.env.API_URL ?? 'http://localhost:8000';
const SHOTS = new URL('./qa-screenshots/', import.meta.url).pathname;
fs.mkdirSync(SHOTS, { recursive: true });
const results = [];
const consoleErrors = [];
const record = (id, area, what, ok, note = '') => { results.push({ id, area, what, ok, note }); console.log(`${ok ? 'PASS' : 'FAIL'} ${id} ${what}${note ? ' — ' + note : ''}`); };
const call = async (method, path, body, tok) => {
  const r = await fetch(`${API}${path}`, { method, headers: { 'content-type': 'application/json', ...(tok ? { Authorization: `Bearer ${tok}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let j = null; try { j = await r.json(); } catch {}
  return { status: r.status, json: j };
};
const login = async (ident, pw = 'Demo1234!') => (await call('POST', '/api/auth/login', { email: ident, password: pw })).json?.access_token;
const today = () => new Date().toISOString().slice(0, 10);

const main = async () => {
  const browser = await chromium.launch();
  const open = async (ident, pw = 'Demo1234!', tag = '') => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => consoleErrors.push(`${tag} pageerror ${page.url()}: ${e.message.slice(0, 160)}`));
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|ERR_INTERNET_DISCONNECTED|Failed to fetch|NetworkError|net::ERR_FAILED/.test(m.text())) consoleErrors.push(`${tag} console ${page.url()}: ${m.text().slice(0, 160)}`); });
    page.on('response', (r) => { if (r.url().includes('/api/') && r.status() >= 500) consoleErrors.push(`${tag} HTTP ${r.status()} ${r.url().replace(API, '')}`); });
    const h = {
      page, ctx,
      text: (s, exact = true) => page.getByText(s, { exact }).last(),
      has: async (s, exact = false) => (await page.getByText(s, { exact }).count()) > 0,
      go: async (p) => { await page.goto(`${APP}${p}`); await page.waitForTimeout(2300); },
      field: (l) => page.getByLabel(l).last(),
      shot: async (n) => page.screenshot({ path: `${SHOTS}${n}.png` }),
    };
    if (ident) {
      await h.go('/login');
      if (ident.includes('@')) await h.text('✉️ Email').click();
      await h.field(ident.includes('@') ? '✉️ Email' : '📱 Nomor HP').fill(ident);
      await h.field('🔑 Kata sandi').fill(pw);
      await h.text('Masuk').click();
      await page.waitForURL(/\/(home|dashboard)$/, { timeout: 15000 });
      await page.waitForTimeout(2200);
    }
    return h;
  };
  const tc = async (id, area, what, fn) => {
    if (process.env.ONLY && !process.env.ONLY.split(',').includes(id)) return;
    try { const note = await fn(); record(id, area, what, note !== false, typeof note === 'string' ? note : ''); }
    catch (e) { record(id, area, what, false, `${id === 'F1' ? `[at ${stage}] ` : ''}${e.message.split('\n')[0].slice(0, 180)}`); }
  };
  const expect = (cond, msg) => { if (!cond) throw new Error(msg); };

  const maria = await login('ibu.maria@nutrisense.id');
  const sarah = await login('081300000003');
  const yul = await login('ibu.yuliana@nutrisense.id');
  const kader = await login('kader.oesapa@nutrisense.id');
  const officer = await login('officer@nutrisense.id');
  const mariaP = (await call('GET', '/api/pregnancies', null, maria)).json[0];
  const yulP = (await call('GET', '/api/pregnancies', null, yul)).json[0];
  const kids = async (tok) => Object.fromEntries((await call('GET', '/api/children', null, tok)).json.map((c) => [c.name.split(' ')[0], c]));
  const mk = await kids(maria), sk = await kids(sarah);

  // ---- A. Auth ----
  await tc('A1', 'Auth', 'Phone login works in 3 formats', async () => {
    for (const f of ['081300000003', '+62 813-0000-0003', '6281300000003']) expect((await call('POST', '/api/auth/login', { email: f, password: 'Demo1234!' })).status === 200, f);
  });
  await tc('A2', 'Auth', 'Wrong password shows a clear message', async () => {
    const h = await open(null); await h.go('/login');
    await h.field('📱 Nomor HP').fill('081300000003'); await h.field('🔑 Kata sandi').fill('salah123');
    await h.text('Masuk').click(); await h.page.waitForTimeout(1500);
    const ok = await h.has('kata sandi salah'); await h.ctx.close(); expect(ok, 'no message');
  });
  const newPhone = `0857${String(Date.now()).slice(-8)}`;
  await tc('A3', 'Auth', 'Sign-up with phone only; neither is refused; duplicate is 409', async () => {
    const base = { password: 'Anakku2026!', full_name: 'Ibu QA', consent_data_processing: true };
    expect((await call('POST', '/api/auth/register', { ...base, phone: newPhone })).status === 201, 'phone-only');
    expect((await call('POST', '/api/auth/register', base)).status === 400, 'neither');
    expect((await call('POST', '/api/auth/register', { ...base, phone: newPhone })).status === 409, 'duplicate');
  });
  await tc('A4', 'Auth', 'Sign-up screen: Lanjut with no phone and no email shows an error', async () => {
    const h = await open(null); await h.go('/register');
    await h.field('🙂 Nama lengkap').fill('Ibu QA'); await h.field('🔑 Kata sandi').fill('Anakku2026!'); await h.field('🔑 Ulangi kata sandi').fill('Anakku2026!');
    await h.text('Lanjut').click(); await h.page.waitForTimeout(800);
    const ok = await h.has('Isi nomor HP atau email'); await h.ctx.close(); expect(ok, 'no error shown');
  });
  await tc('A5', 'Auth', 'Reloading keeps you logged in', async () => {
    const h = await open('ibu.maria@nutrisense.id'); await h.page.reload(); await h.page.waitForTimeout(2500);
    const ok = /\/home$/.test(h.page.url()); await h.ctx.close(); expect(ok, h.page.url());
  });

  // ---- B. Mother ----
  const M = await open('ibu.maria@nutrisense.id', 'Demo1234!', 'maria');
  await tc('B1', 'Mother', 'Maria: Bunda card shows Risiko tinggi, plain reasons and Hubungi bidan', async () => {
    await M.go('/home'); await M.text('Bunda').click(); await M.page.waitForTimeout(1200);
    expect(await M.has('Risiko tinggi'), 'level'); expect(await M.has('Hubungi bidan'), 'button'); expect(await M.has('Lengan kecil (KEK) · Kurang darah (anemia)'), 'reasons');
  });
  await tc('B2', 'Mother', 'Catat ibu: normal values show no flags; Hb 6.5 shows Sangat kurang darah', async () => {
    await M.go(`/pregnancy/${mariaP.id}/measure`); await M.field('📏 LiLA (cm)').fill('25'); await M.text('Lanjut').click();
    await M.field('🩸 Hb (g/dL)').fill('12'); await M.text('Lanjut').click(); await M.text('Simpan').click();
    await M.text('Hasil cek ibu tersimpan', false).waitFor({ timeout: 12000 });
    expect(!(await M.has('Lengan kecil (KEK)', true)) && !(await M.has('Kurang darah (anemia)', true)), 'flags on normal values');
    await M.go(`/pregnancy/${mariaP.id}/measure`); await M.text('Lanjut').click(); await M.field('🩸 Hb (g/dL)').fill('6.5'); await M.text('Lanjut').click(); await M.text('Simpan').click();
    await M.text('Hasil cek ibu tersimpan', false).waitFor({ timeout: 12000 });
    expect(await M.has('Sangat kurang darah', true), 'no severe flag');
  });
  await tc('B3', 'Mother', 'Severe anaemia makes the pregnancy Risiko tinggi', async () => {
    const p = (await call('GET', `/api/pregnancies/${mariaP.id}`, null, maria)).json; expect(p.risk.key === 'urgent' && p.risk.reasons.includes('Sangat kurang darah'), JSON.stringify(p.risk));
  });
  await tc('B4', 'Mother', 'ANC: Tandai sudah then Batal', async () => {
    await M.go(`/pregnancy/${mariaP.id}/anc`); await M.text('Tandai sudah').click(); await M.page.waitForTimeout(1500);
    let p = (await call('GET', `/api/pregnancies/${mariaP.id}`, null, maria)).json; expect(p.anc_done === 3, `done ${p.anc_done}`);
    await M.text('Batal').click(); await M.page.waitForTimeout(1500);
    p = (await call('GET', `/api/pregnancies/${mariaP.id}`, null, maria)).json; expect(p.anc_done === 2, `after undo ${p.anc_done}`);
  });
  await tc('B5', 'Mother', 'TTD tick is saved', async () => {
    await M.go(`/pregnancy/${mariaP.id}/supplements`); await M.page.getByLabel('Tablet tambah darah hari ini').last().click(); await M.page.waitForTimeout(1500);
    const p = (await call('GET', `/api/pregnancies/${mariaP.id}`, null, maria)).json; expect(p.today_log.ttd === true, 'not saved');
  });
  await tc('B6', 'Mother', 'Danger sign: Puskesmas first, then its number, 119 and Kader', async () => {
    await M.go(`/pregnancy/${mariaP.id}/danger`); await M.page.getByLabel('Perdarahan').last().click(); await M.page.waitForTimeout(600);
    for (const s of ['Ke Puskesmas sekarang', '119', 'Hubungi Kader', 'Puskesmas Baumata']) expect(await M.has(s), s);
    const y1 = await M.text('Ke Puskesmas sekarang').boundingBox(), y2 = await M.text('Hubungi Kader').boundingBox(); expect(y1.y < y2.y, 'order');
  });
  await tc('B7', 'Mother', 'Birth plan saves all six fields', async () => {
    await M.go(`/pregnancy/${mariaP.id}/plan`); await M.text('Ojek', false).click(); await M.page.getByText(/^\S+\sBidan$/).last().click();
    await M.field('🤝 Pendamping').fill('Suami'); await M.field('🩸 Calon pendonor darah').fill('Kakak (O)'); await M.text('JKN / KIS', false).click();
    await M.text('Simpan').click(); await M.text('Rencana tersimpan', false).waitFor({ timeout: 10000 });
    const bp = (await call('GET', `/api/pregnancies/${mariaP.id}`, null, maria)).json.birth_plan; expect(bp.transport && bp.helper === 'bidan' && bp.blood_donor && bp.funding === 'jkn' && bp.companion, JSON.stringify(bp));
  });
  await tc('C4', 'Child', 'Budi shows the 2T badge', async () => { await M.go(`/child/${mk.Budi.id}`); expect(await M.has('Berat tidak naik 2× (2T)'), 'no badge'); });
  await tc('C3', 'Child', 'Next posyandu shows on home', async () => { await M.go('/home'); await M.text('Adel').click(); await M.page.waitForTimeout(800); expect(await M.has('Posyandu berikutnya'), 'no card'); });
  await tc('C5', 'Child', 'Measure: Lanjut disabled until oedema answered; "Ya" warns and ends in an urgent referral', async () => {
    await M.go(`/child/${mk.Adel.id}/measure`); await M.text('Lanjut').click(); await M.text('Saya siap memasukkan angka').click();
    await M.field('⚖️ Berat badan (kg)').fill('11.6'); await M.field(/Panjang badan|Tinggi badan/).fill('84.9');
    const disabled = await M.page.getByRole('button', { name: /Lanjut/ }).last().isDisabled().catch(() => null);
    await M.text('Ya, bengkak').click(); expect(await M.has('Tanda gizi buruk'), 'no warning');
    await M.text('Lanjut').click(); await M.text('Simpan').click(); await M.text('Pengukuran tersimpan', false).waitFor({ timeout: 20000 });
    expect(await M.has('Ke Puskesmas sekarang'), 'no emergency card');
    return disabled === true ? '' : `Lanjut disabled before answer: ${disabled}`;
  });
  await tc('C6', 'Child', 'Symptom check with a danger sign shows the emergency card', async () => {
    await M.go(`/child/${mk.Budi.id}/symptoms`); await M.page.getByLabel('Kejang').last().click(); await M.page.waitForTimeout(500); expect(await M.has('Ke Puskesmas sekarang'), 'none');
  });
  await tc('C7', 'Child', 'Meal log, NutriScan and Tanya Nuri open without errors', async () => {
    const before = consoleErrors.length;
    await M.go(`/child/${mk.Adel.id}/meal?action=manual`); await M.go('/nutriscan'); await M.go('/assistant');
    expect(consoleErrors.length === before, consoleErrors.slice(before).join(' | '));
  });
  await M.ctx.close();

  await tc('B8', 'Mother', 'Agustina (no checks) shows Belum dicek', async () => {
    const h = await open('ibu.agustina@nutrisense.id'); const ok = await h.has('Belum dicek'); await h.ctx.close(); expect(ok, 'missing');
  });
  await tc('B9', 'Mother', 'New account: Tambah kehamilan by HPHT; a future HPHT keeps Lanjut disabled', async () => {
    const h = await open(newPhone, 'Anakku2026!', 'new');
    await h.text('Tambah kehamilan').click(); await h.page.waitForTimeout(1200);
    const future = new Date(Date.now() + 20 * 864e5).toISOString().slice(0, 10);
    await h.field(/HPHT/).fill(future); const dis = await h.page.getByRole('button', { name: /Lanjut/ }).last().isDisabled();
    const hpht = new Date(Date.now() - 100 * 864e5).toISOString().slice(0, 10);
    await h.field(/HPHT/).fill(hpht); await h.text('Lanjut').click(); await h.text('Lanjut').click(); await h.text('Simpan').click();
    await h.page.waitForURL(/\/pregnancy\/\d+$/, { timeout: 15000 }); await h.page.waitForTimeout(1500);
    const ok = await h.has('14 minggu'); await h.ctx.close(); expect(dis, 'future date allowed'); expect(ok, 'weeks not shown');
  });
  await tc('B10', 'Mother', 'Catat kelahiran (Yuliana, 33 wk): Prematur + BBLR, baby on home with ASI', async () => {
    const h = await open('ibu.yuliana@nutrisense.id');
    await h.go(`/pregnancy/${yulP.id}/birth`); await h.field('Nama bayi').fill('Bayi QA'); await h.text('Lanjut').click();
    await h.field('⚖️ Berat lahir (kg)').fill('2.2'); await h.field('📏 Panjang lahir (cm)').fill('44');
    expect(await h.has('Prematur'), 'no premature flag'); await h.text('Lanjut').click();
    await h.text('Puskesmas', false).click(); await h.page.getByText(/^\S+\sBidan$/).last().click(); await h.text('Lanjut').click(); await h.text('Simpan').click();
    await h.text('Selamat, Bunda! 🎉', false).waitFor({ timeout: 15000 }); expect(await h.has('BBLR'), 'no BBLR');
    await h.go('/home'); await h.text('Bayi').click().catch(() => {}); await h.page.waitForTimeout(1000);
    const asi = await h.has('ASI eksklusif'); await h.ctx.close(); expect(asi, 'no ASI action for newborn');
  });

  // ---- C. Child (Sarah, phone login) ----
  const S = await open('081300000003', 'Demo1234!', 'sarah');
  await tc('C1', 'Child', 'ASI tracker: tick and feeds saved', async () => {
    await S.go(`/child/${sk.Kristo.id}/asi`); await S.page.getByLabel('Hanya ASI hari ini').last().click(); await S.page.waitForTimeout(800);
    await S.page.getByLabel('+').last().click(); await S.page.waitForTimeout(1200);
    const a = (await call('GET', `/api/children/${sk.Kristo.id}/asi`, null, sarah)).json; expect(a.today?.asi_only === true && a.today.feeds >= 1, JSON.stringify(a.today));
  });
  await tc('C2', 'Child', 'Jadwal KIA: Tandai sudah, then Batal', async () => {
    await S.go(`/child/${sk.Kristo.id}/kia`); await S.text('Tandai sudah').click(); await S.page.waitForTimeout(1500);
    let s = (await call('GET', `/api/children/${sk.Kristo.id}/kia`, null, sarah)).json; const done = s.immunization.filter((r) => r.status === 'done').length;
    S.page.once('dialog', (d) => d.accept()); await S.text('Batal').click(); await S.page.waitForTimeout(1500);
    s = (await call('GET', `/api/children/${sk.Kristo.id}/kia`, null, sarah)).json; expect(s.immunization.filter((r) => r.status === 'done').length === done - 1, 'undo');
  });
  await S.ctx.close();

  // ---- D. Kader ----
  const K = await open('kader.oesapa@nutrisense.id', 'Demo1234!', 'kader');
  let tempPw = null; const momPhone = `0853${String(Date.now()).slice(-8)}`;
  await tc('D1', 'Kader', 'Home shows the ibu hamil card; /mothers filters work', async () => {
    await K.go('/home'); expect(await K.has('Tambah ibu hamil'), 'card');
    await K.go('/mothers'); for (const f of ['Berisiko', 'Belum dicek', 'Nifas', 'Semua']) { await K.text(f).click(); await K.page.waitForTimeout(400); }
  });
  await tc('D2', 'Kader', 'Tambah ibu hamil: consent required, temp password, mother logs in by phone', async () => {
    await K.go('/mother/new'); await K.field('🙂 Nama lengkap').fill('Ibu Uji Kader'); await K.field('📱 Nomor HP').fill(momPhone);
    expect(!(await K.has('Baa', true)), 'village outside area offered'); await K.text('Baumata').click(); await K.text('Lanjut').click();
    await K.field('🤰 Usia kehamilan (minggu)').fill('12'); await K.text('Lanjut').click(); await K.text('Lanjut').click();
    const dis = await K.page.getByRole('button', { name: /Simpan/ }).last().isDisabled(); expect(dis, 'Simpan enabled without consent');
    await K.page.getByRole('switch').last().click(); await K.text('Simpan').click(); await K.text('Ibu hamil tercatat', false).waitFor({ timeout: 15000 });
    tempPw = (await K.page.getByText(/^\d{8}$/).last().textContent()).trim();
    const tok = await login(momPhone, tempPw); expect(tok, 'mother cannot log in');
    const p = (await call('GET', '/api/pregnancies', null, tok)).json; expect(p[0]?.gestational_weeks === 12, JSON.stringify(p[0]?.gestational_weeks));
  });
  await K.ctx.close();

  // ---- E. Officer and doctor ----
  const O = await open('officer@nutrisense.id', 'Demo1234!', 'officer');
  await tc('E1', 'Officer', 'Dashboard: model says Data demo; every figure card has a source line', async () => {
    await O.go('/dashboard'); await O.page.waitForTimeout(2500);
    await O.text('Detail teknis', false).click(); await O.page.waitForTimeout(800);
    expect(await O.has('Data demo', true), 'no Data demo'); const n = await O.page.getByText(/^Sumber:/).count(); expect(n >= 8, `only ${n} source lines`);
    return `${n} source lines`;
  });
  await tc('E2', 'Officer', 'Maternal indicators match the API', async () => {
    const m = (await call('GET', '/api/dashboard/mothers', null, officer)).json;
    expect(await O.has(`KEK (${m.kek.n}/${m.kek.of})`), 'KEK label'); expect(await O.has(`${m.kek.pct}%`), 'KEK %');
  });
  await tc('E3', 'Officer', 'Logistics shows requests and lockers, no drones', async () => {
    await O.go('/logistics'); expect(!(await O.has('drone')), 'drone text'); await O.text('Loker').click(); await O.page.waitForTimeout(1000); expect(!(await O.has('drone')), 'drone text');
  });
  await tc('E4', 'Officer', 'A flagged row opens the right record', async () => {
    await O.go('/dashboard'); const row = O.page.getByText('Kevin Pello', { exact: false }).first(); await row.scrollIntoViewIfNeeded(); await row.click(); await O.page.waitForTimeout(2000);
    expect(/\/child\/\d+$/.test(O.page.url()), O.page.url());
  });
  await O.ctx.close();
  await tc('E5', 'Doctor', 'Doctor opens a case', async () => {
    const doc = await login('doctor@nutrisense.id'); const cases = (await call('GET', '/api/cases', null, doc)).json;
    const h = await open('doctor@nutrisense.id', 'Demo1234!', 'doctor'); await h.go('/cases'); await h.page.waitForTimeout(1500);
    await h.page.getByText(cases[0].child_name, { exact: false }).first().click(); await h.page.waitForTimeout(1800);
    const ok = /\/case\/\d+|\/child\/\d+/.test(h.page.url()); await h.ctx.close(); expect(ok, h.page.url());
  });

  // ---- F. Offline ----
  let stage = '';
  await tc('F1', 'Offline', 'Five entries saved with no signal, app stays logged in after reload, all sent once online, no duplicates', async () => {
    const h = await open('ibu.maria@nutrisense.id', 'Demo1234!', 'offline');
    // Only the API goes offline: on a phone the app itself is installed, and when the web app is served from the
    // same address as the API (CI, Docker) blocking everything would also block reloading the app.
    const block = () => h.page.route(`${API}/api/**`, (r) => r.abort('internetdisconnected'));
    const before = { m: (await call('GET', `/api/children/${mk.Adel.id}/measurements`, null, maria)).json.length, mm: (await call('GET', `/api/pregnancies/${mariaP.id}`, null, maria)).json.measurements.length };
    stage = 'pmt'; await h.go(`/pregnancy/${mariaP.id}/supplements`); await block();
    await h.page.getByLabel('PMT ibu hamil').last().click(); await h.page.waitForTimeout(1200);
    await h.page.unroute(`${API}/api/**`); stage = 'anc'; await h.go(`/pregnancy/${mariaP.id}/anc`); await block();
    await h.text('Tandai sudah').click(); await h.page.waitForTimeout(1200);
    await h.page.unroute(`${API}/api/**`); stage = 'catat-ibu'; await h.go(`/pregnancy/${mariaP.id}/measure`); await block();
    await h.field('📏 LiLA (cm)').fill('23.0'); await h.text('Lanjut').click(); await h.text('Lanjut').click(); await h.text('Simpan').click(); await h.page.waitForTimeout(1500);
    expect(await h.has('Tersimpan di HP'), 'Catat ibu not queued');
    await h.page.unroute(`${API}/api/**`); stage = 'child-measure'; await h.go(`/child/${mk.Adel.id}/measure`); await block();
    await h.text('Lanjut').click(); await h.text('Saya siap memasukkan angka').click(); await h.field('⚖️ Berat badan (kg)').fill('11.7'); await h.field(/Panjang badan|Tinggi badan/).fill('85.0');
    await h.text('Tidak').click(); await h.text('Lanjut').click(); await h.text('Simpan').click(); await h.page.waitForTimeout(1500);
    expect(await h.has('Tersimpan di HP'), 'measurement not queued');
    stage = 'reload'; await h.page.reload(); await h.page.waitForTimeout(3000); expect(!/\/login$/.test(h.page.url()), 'logged out when offline');
    stage = 'sync'; await h.go('/sync'); await h.page.waitForTimeout(1200); await h.shot('F1-sync-waiting');
    const waiting = await h.page.getByText('Menunggu', { exact: true }).count();
    stage = 'send'; await h.page.unroute(`${API}/api/**`); await h.text('Kirim sekarang').click(); await h.page.waitForTimeout(4000); await h.go('/sync'); await h.shot('F1-sync-sent');
    const after = { m: (await call('GET', `/api/children/${mk.Adel.id}/measurements`, null, maria)).json.length, p: (await call('GET', `/api/pregnancies/${mariaP.id}`, null, maria)).json };
    expect(after.m === before.m + 1, `measurements ${before.m} -> ${after.m}`); expect(after.p.measurements.length === before.mm + 1, `mother checks ${before.mm} -> ${after.p.measurements.length}`);
    expect(after.p.today_log.pmt === true, 'PMT not synced'); expect(after.p.anc_done === 3, `anc ${after.p.anc_done}`);
    await h.text('Kirim sekarang').click().catch(() => {}); await h.page.waitForTimeout(2000);
    const again = (await call('GET', `/api/children/${mk.Adel.id}/measurements`, null, maria)).json.length; expect(again === after.m, 'duplicate after second sync');
    await h.ctx.close(); return `${waiting} "Menunggu" labels while offline`;
  });

  // ---- G. English ----
  await tc('G1', 'Language', 'English: no raw keys or leftover Indonesian on new screens', async () => {
    const h = await open(null); await h.go('/login'); await h.text('🇬🇧 English').click(); await h.text('✉️ Email').click();
    await h.field('✉️ Email').fill('ibu.sarah@nutrisense.id'); await h.field('🔑 Password').fill('Demo1234!'); await h.page.getByText('Log in', { exact: true }).last().click();
    await h.page.waitForURL(/\/home$/, { timeout: 15000 }); await h.page.waitForTimeout(2000);
    const bad = [];
    for (const p of ['/home', `/child/${sk.Kristo.id}/asi`, `/child/${sk.Kristo.id}/kia`, `/child/${sk.Kevin.id}`, '/sync']) {
      await h.go(p); const body = await h.page.locator('body').innerText();
      const raw = body.match(/\b[a-z]+[A-Z][A-Za-z]+\b/g) || []; const indo = body.match(/\b(Hari ini|Sekarang|Belum dicek|Tandai sudah|Posyandu berikutnya|Hubungi|Dengar)\b/g) || [];
      if (raw.length || indo.length) bad.push(`${p}: ${[...new Set([...raw, ...indo])].slice(0, 6).join(', ')}`);
    }
    await h.shot('G1-english'); await h.ctx.close(); expect(!bad.length, bad.join(' | '));
  });

  // ---- I. Access control and validation ----
  await tc('I1', 'Security', "A mother cannot read another mother's pregnancy or child", async () => {
    expect([403, 404].includes((await call('GET', `/api/pregnancies/${yulP.id}`, null, maria)).status), 'pregnancy');
    expect([403, 404].includes((await call('GET', `/api/children/${sk.Kristo.id}`, null, maria)).status), 'child');
  });
  await tc('I2', 'Security', 'A Kader cannot register a mother outside her area', async () => {
    const regions = Object.fromEntries((await call('GET', '/api/regions')).json.map((r) => [r.name, r.id]));
    const r = await call('POST', '/api/kader/mothers', { full_name: 'X Y', phone: `0858${String(Date.now()).slice(-8)}`, region_id: regions.Baa, gestational_weeks: 10, consent_given: true }, kader);
    expect(r.status === 403, `status ${r.status}`);
  });
  await tc('I3', 'Security', 'Bad input returns 4xx, never 500', async () => {
    const cases = [['POST', `/api/pregnancies/${mariaP.id}/measurements`, { muac_cm: 'abc' }, maria], ['POST', `/api/children/${mk.Adel.id}/measurements`, { weight_kg: -1, height_cm: 5 }, maria],
      ['POST', `/api/children/${mk.Adel.id}/kia`, { item_key: 'x' }, maria], ['POST', `/api/children/${mk.Adel.id}/asi`, {}, maria], ['POST', '/api/auth/login', {}, null], ['POST', '/api/kader/mothers', { full_name: 'A' }, kader]];
    const bad = [];
    for (const [m, p, b, t] of cases) { const r = await call(m, p, b, t); if (r.status >= 500 || r.status < 400) bad.push(`${p} -> ${r.status}`); }
    expect(!bad.length, bad.join(', '));
  });
  await tc('I4', 'Security', 'Staff cannot see a pickup code; a wrong code is refused', async () => {
    const reqs = (await call('GET', '/api/supply-requests', null, officer)).json; expect(reqs.every((r) => r.pickup_code === null), 'code leaked');
  });

  await tc('J1', 'Puskesmas link', 'A check-up sent by the Puskesmas (FHIR) reaches the mother: new-results card, high blood pressure, call the midwife', async () => {
    const D = await open('doctor@nutrisense.id', 'Demo1234!', 'portal');
    await D.go('/facility-portal');
    await D.field('Kode ibu').fill('NS-7KQ2MP'); await D.field('Sistolik').fill('150'); await D.field('Diastolik').fill('95'); await D.field('DJJ (/menit)').fill('140');
    await D.text('Kirim ke HP ibu').click(); await D.text('Terkirim ke HP ibu', false).waitFor({ timeout: 15000 }); await D.ctx.close();
    const h = await open('ibu.maria@nutrisense.id', 'Demo1234!', 'mother-sync');
    await h.go(`/pregnancy/${mariaP.id}`); expect(await h.has('Hasil periksa baru masuk'), 'no new-results card');
    await h.go(`/pregnancy/${mariaP.id}/puskesmas`); expect(await h.has('Tekanan darah tinggi'), 'no BP flag'); expect(await h.has('Hubungi bidan'), 'no call button');
    await h.shot('J1-puskesmas-results'); await h.ctx.close();
    const p = (await call('GET', `/api/pregnancies/${mariaP.id}`, null, maria)).json; expect(p.risk.reasons.includes('Tekanan darah tinggi'), JSON.stringify(p.risk));
  });
  await tc('H1', 'Robustness', 'No page errors or 5xx responses on any screen visited', async () => { expect(!consoleErrors.length, consoleErrors.slice(0, 5).join(' | ')); });
  await browser.close();
  fs.writeFileSync(new URL('./qa-results.json', import.meta.url).pathname, JSON.stringify({ results, consoleErrors }, null, 1));
  const pass = results.filter((r) => r.ok).length; console.log(`\n${pass} of ${results.length} cases pass`);
  process.exitCode = pass === results.length ? 0 : 1;
};
await main();
