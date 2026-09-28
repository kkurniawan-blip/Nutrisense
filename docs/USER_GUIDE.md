# NutriSense user guide

How to start NutriSense and use it as a mother, a Kader, a health officer or a doctor.
The app's screens are in Bahasa Indonesia by default. Labels below are written the way they appear in the app, with English in brackets where helpful. You can switch to English on the login screen or in **Profil → Pengaturan**.

- [1. Start the app](#1-start-the-app)
- [2. Log in or sign up](#2-log-in-or-sign-up)
- [3. Mothers and caregivers](#3-mothers-and-caregivers)
- [4. Kaders](#4-kaders)
- [5. Health officers and doctors](#5-health-officers-and-doctors)
- [6. Good to know](#6-good-to-know)

## 1. Start the app

NutriSense has two parts: the **server** (backend) and the **app**. Use a hosted link if you have one (see [Put it online](../README.md#put-it-online)). Otherwise run both on your own computer. You need Python 3.11 and Node.js 22.

**Terminal 1: the server**
```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate    # Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt                    # first time only
uvicorn app.main:app --host 0.0.0.0 --port 8000
```
The first start takes about 20 seconds. It creates demo data (48 children in East Nusa Tenggara, 6 lockers and a drone fleet) and trains the risk model.

**Terminal 2: the app**
```bash
cd mobile
npm install          # first time only
npx expo start
```
- **On a phone:** install **Expo Go** from the Play Store or App Store and scan the QR code. The phone and the computer must be on the same Wi-Fi.
- **In a browser:** press `w` in the same terminal.
- **If the phone cannot connect:** on the login screen tap ⚙️ **Alamat server** (server address) and enter the computer's address, for example `http://192.168.1.10:8000`.

## 2. Log in or sign up

![Login, sign-up and a new account](images/1-login-signup.png)

- **Demo accounts** are listed on the login screen. Tap one to fill it in. The password for all of them is `Demo1234!`.

  | Account | Role |
  |---|---|
  | `ibu.maria@nutrisense.id` | Mother of Adel and Budi |
  | `kader.oesapa@nutrisense.id` | Kader Martha Lay, Oesapa |
  | `officer@nutrisense.id` | Dinas Kesehatan officer |
  | `doctor@nutrisense.id` | Doctor |

- **New mother account:** tap **Daftar sebagai Ibu / pengasuh** (sign up as a mother / caregiver).
  1. **Akun Anda:** name, email, phone (optional) and a password. The meter shows how strong the password is.
  2. **Wilayah & izin:** pick your village, then choose permissions. Only the first one, for recording your child's data, is required.
- **Kader, officer and doctor accounts** are created by the Dinas Kesehatan administrator. Self sign-up is not available for these roles.
- **Forgot your password?** Ask your Kader or the Puskesmas to reset it.

## 3. Mothers and caregivers

Tabs at the bottom: **Beranda** (home) · **Tanya Nuri** (ask Nuri) · **NutriScan** · **Paket** (packages) · **Profil**.

![Home, measurement result, meal result and an urgent symptom](images/2-mother-daily.png)

### Every day: Beranda
- Pick your child at the top.
- **Hari ini untuk …** (today for …) lists what to do today. Green means done. Orange means it still needs doing: tap the line to do it.
- Big buttons: **Catat makan** (log a meal), **Catat tumbuh** (measure), **Cek gejala** (check symptoms) and **Tanya Nuri**.

### Measure your child: Catat tumbuh
Four steps:
1. Choose lying down (under 2 years) or standing.
2. Read how to measure.
3. Enter weight and length/height. The app warns you if a number looks wrong.
4. Check the numbers and save.

The result is in plain words, for example 🟢 *Pertumbuhan baik* (growing well), 🟡 *Perlu dipantau* (keep an eye on it) or 🟠 *Perlu perhatian* (needs attention). Below it is a short list of what you can do. The detailed AI numbers are under **Lihat detail analisis AI**.

### Log meals: NutriScan
- Tap the camera button in the middle of the tab bar.
- Take a photo, or pick the foods from the list.
- The result shows:
  - **Yang sudah ada:** food groups already on the plate;
  - **Yang bisa dilengkapi:** groups you could add;
  - **💡 Ide sederhana:** one easy idea;
  - **… / 8 kelompok hari ini:** today's food variety score. Aim for 5 or more.
- **Lihat ide menu** opens cheap, quick recipes with ingredients from the local market.

### When your child is sick: Cek gejala
- Tap the symptoms, or type how your child is in your own words, e.g. *"anaknya diare 2 hari, lemas sekali"*.
- 🚨 If there is a danger sign, the app shows **Segera cari pertolongan medis** (seek medical help now) with a button to call your Kader. Go to the Puskesmas right away.
- **Panduan kesehatan** (health guide) lists the danger signs and basic care. It works without internet.

![Growth history, Tanya Nuri, packages and a Kader's recommendation](images/3-mother-more.png)

### Your child's page
Tap your child's card on Beranda. The page follows five steps:

| Step | What it shows |
|---|---|
| **Pantau** (monitor) | Latest numbers and the growth chart for height, weight and weight-for-height, with **Apa artinya?** (what does it mean?) |
| **Pahami** (understand) | The latest result, in plain words |
| **Perbaiki** (improve) | Meal plan and recipes |
| **Ikuti** (follow) | Development checklist and play ideas for the week |
| **Tindak lanjut** (follow-up) | **Tim …**, the child's care team, with notes from the Kader or doctor and when they last checked |

### Ask a question: Tanya Nuri
Choose a topic (**Pertumbuhan** growth, **Makan** eating, **Gejala** symptoms, **Perkembangan** development). Tap a suggested question or type your own. Nuri's answers are general guidance, not a medical diagnosis.

### Packages: Paket
- Shows your child's health status, what to do at home, and any nutrition package waiting for you.
- To collect a package, show the **QR code** or tell the **6-digit code** at the locker.
- Packages are extra support. They are not required.

### Your account: Profil → Pengaturan
Change your name, phone, village, password, language and **text size** (Normal, Besar or Sangat besar). **Data & privasi** shows what is shared and with whom, and lets you change your permissions.

## 4. Kaders

Tabs: **Beranda** · **Kasus** (cases) · **Tanya Nuri** · **Logistik** · **Profil**.

![Kader home, a child's page, sharing a note and locker pickup](images/4-kader.png)

- **Wilayah saya** (my area) counts the children who need follow-up 🔴, need attention 🟠 or are on track 🟢. Tap a count to see those children.
- **Daftar kunjungan** (visit list) is sorted by priority, most urgent first.
  - Search by name.
  - Filter by **Semua** (all), **Prioritas**, **Baru** (new) or **Tindak lanjut** (follow-up).
  - **Filter lainnya** filters by village, risk, last measured, or children who need a visit.
  - Tap **Lihat anak** to open a child.
- **Measure a child** from the child's page, the same way a mother does. Measurements taken without signal are sent later.
- **Kasus:**
  - Check an AI result: you can confirm or raise it. Only a doctor or officer can lower a high-risk result.
  - Write a note. Turn on 👪 **Bagikan catatan ini ke keluarga** (share this note with the family) and the mother sees it on her child's page as a health worker recommendation.
- **Pengambilan loker** (locker pickup): scan the mother's QR code, or type her 6-digit code, to open the locker.

## 5. Health officers and doctors

![Dashboard, package options, drone fleet and the doctor's dashboard](images/5-officer-doctor.png)

- **Dasbor** (dashboard): children, stunting rate, urgent cases, the village map, the stunting forecast and how well the AI model performs.
- **Kasus:** results the AI flagged for checking. Set the correct risk level and add a clinical note.
- **Logistik → Permintaan paket** (package requests): open a request to see every way to deliver it: locker stock, drone or courier. The app explains why each one is or isn't possible, then **Setujui** (approve). Doctors approve items that need a prescription.
- **Logistik → Armada drone** (drone fleet): battery, range and flights in progress.

## 6. Good to know

- **No signal?** Measurements, meals and symptoms are saved on the phone and sent automatically later. A banner shows what is waiting and says ✓ *Data berhasil disinkronkan* when everything is sent.
- **Shared phone?** Logging out removes that account's saved pages and unsent data from the phone. The app warns you first if something has not been sent yet.
- **AI:**
  - Everything works without an AI key except photo NutriScan and free-form Tanya Nuri answers.
  - To turn those on, put `NUTRISENSE_ANTHROPIC_API_KEY=...` in `backend/.env` and restart the server.
  - The risk model is trained on simulated children. Treat its results as decision support, not a diagnosis. Every result screen says so.
- **Start over with fresh demo data:** stop the server, delete `backend/nutrisense.db`, and start it again.
