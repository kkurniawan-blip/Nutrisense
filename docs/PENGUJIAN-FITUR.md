# Pengujian fitur NutriSense (black-box)

Tanggal: 2026-10-09 · Hasil: **83 dari 83 fitur berhasil**

| No | Area | Fitur | Skenario | Hasil yang diharapkan | Hasil | Keterangan |
|---|---|---|---|---|---|---|
| A1 | Akun | Masuk dengan nomor HP<br>*Log in with a phone number* | Isi nomor HP 0813 0000 0003 dan kata sandi, tekan Masuk | Beranda ibu terbuka | ✅ Berhasil |  |
| A2 | Akun | Masuk dengan email<br>*Log in with email* | Pilih Email, isi email dan kata sandi | Dasbor petugas terbuka | ✅ Berhasil |  |
| A3 | Akun | Pesan kata sandi salah<br>*Wrong password message* | Masuk dengan kata sandi salah | Muncul pesan bahasa Indonesia, tetap di halaman masuk | ✅ Berhasil |  |
| A4 | Akun | Daftar akun ibu (2 langkah)<br>*Mother sign-up (2 steps)* | Isi nama, nomor HP, kata sandi; pilih desa; setujui data; Buat akun | Akun dibuat dan ibu diajak menambah anak | ✅ Berhasil |  |
| A5 | Akun | Pemeriksaan isian daftar<br>*Sign-up form checks* | Tekan Lanjut tanpa nomor HP/email | Muncul pesan “Isi nomor HP atau email” | ✅ Berhasil |  |
| A6 | Akun | Ubah profil<br>*Edit profile* | Ubah nama di Pengaturan, Simpan perubahan | Nama baru tersimpan | ✅ Berhasil |  |
| A7 | Akun | Ganti bahasa ke Inggris dan kembali<br>*Switch language to English and back* | Pilih English di Pengaturan, lalu Indonesia | Tampilan berganti bahasa | ✅ Berhasil |  |
| A8 | Akun | Ukuran teks besar<br>*Large text size* | Pilih Besar di Pengaturan | Teks membesar, tetap tanpa geser ke samping di 390 px | ✅ Berhasil |  |
| A9 | Akun | Ubah kata sandi<br>*Change password* | Isi kata sandi lama dan baru | Kata sandi berubah; perangkat ini tetap masuk | ✅ Berhasil |  |
| A10 | Akun | Keluar dan data HP dibersihkan<br>*Log out clears the phone* | Tekan Keluar di Profil | Kembali ke halaman masuk; token dan data tersimpan terhapus; halaman dalam dialihkan ke masuk | ✅ Berhasil |  |
| A11 | Akun | Batas percobaan masuk<br>*Login attempt limit* | 6 kali kata sandi salah pada satu akun | Akun dikunci sementara (pesan 429) dan percobaan dicatat | ✅ Berhasil |  |
| B1 | Anak | Beranda ibu dan tugas hari ini<br>*Mother home and today’s tasks* | Buka beranda, pilih anak | Status anak, “Untuk hari ini” dan Posyandu berikutnya tampil | ✅ Berhasil |  |
| B2 | Anak | Profil anak dan status pertumbuhan<br>*Child profile and growth status* | Buka profil Budi | Status dalam kata sederhana, lencana 2T, grafik | ✅ Berhasil |  |
| B3 | Anak | Catat pengukuran (4 langkah)<br>*Record a measurement (4 steps)* | Isi berat 11.4 kg, tinggi 84.6 cm, tidak bengkak, Simpan | Pengukuran tersimpan dan hasil tampil | ✅ Berhasil |  |
| B4 | Anak | Tolak angka yang tidak mungkin<br>*Impossible values blocked* | Isi tinggi 300 cm, Lanjut | Peringatan merah di langkah periksa; Simpan tidak bisa ditekan | ✅ Berhasil |  |
| B5 | Anak | Riwayat dan grafik pertumbuhan<br>*Growth history and chart* | Buka riwayat, ganti tab Berat dan BB/TB | Grafik standar WHO berganti tanpa galat | ✅ Berhasil |  |
| B6 | Anak | Analisis risiko stunting<br>*Stunting risk analysis* | Buka Detail analisis Budi | Alasan dan faktor penyebab tampil, berlabel AI | ✅ Berhasil |  |
| B7 | Anak | Rencana gizi mingguan<br>*Weekly nutrition plan* | Buka Rencana gizi | Kebutuhan harian dan keragaman makanan tampil | ✅ Berhasil |  |
| B8 | Anak | Resep bahan lokal<br>*Local recipes* | Buka Resep, tekan Lihat resep | Bahan dan cara membuat tampil | ✅ Berhasil |  |
| B9 | Anak | Daftar perkembangan<br>*Development checklist* | Tandai “Ya, sudah bisa” lalu muat ulang | Jawaban tersimpan | ✅ Berhasil |  |
| B10 | Anak | Catat makan dan keragaman<br>*Meal log and diversity* | Pilih nasi, telur, bayam; Simpan makanan | Makan tersimpan; kelompok makanan dihitung | ✅ Berhasil |  |
| B11 | Anak | NutriScan: foto makanan<br>*NutriScan: meal photo* | Pilih foto makanan dari galeri | Tanpa AI: pesan bahasa Indonesia dan ajakan pilih manual; tidak macet | ✅ Berhasil |  |
| B12 | Anak | NutriScan: menu dari bahan di rumah<br>*NutriScan: dish from ingredients at home* | Pilih telur, bayam, nasi; Cari menu terbaik; Lihat resep; Sudah dimasak? Catat | Menu cocok, resep, daftar belanja; masakan tercatat | ✅ Berhasil |  |
| B13 | Anak | Cek gejala: tanda bahaya<br>*Symptom check: danger sign* | Ketuk “Kejang” | Peringatan merah, tombol Ke Puskesmas, 119 dan Kader | ✅ Berhasil |  |
| B14 | Anak | Cek gejala: cerita dengan kata sendiri<br>*Symptom check: free text* | Tulis “tidak demam, cuma pilek”, Periksa gejala | Dipahami dengan benar, tidak ada peringatan palsu | ✅ Berhasil |  |
| B15 | Anak | Jadwal KIA: tandai dan batalkan<br>*KIA schedule: mark and undo* | Tandai sudah pada imunisasi, lalu Batal | Status berubah lalu kembali | ✅ Berhasil |  |
| B16 | Anak | Catatan ASI eksklusif<br>*Exclusive breastfeeding log* | Centang “Hanya ASI hari ini” dan tambah 1 kali menyusu | Tersimpan untuk hari ini | ✅ Berhasil |  |
| B17 | Anak | Tambah anak<br>*Add a child* | Isi nama, tanggal lahir, Simpan | Anak baru tercatat dan diajak mengukur | ✅ Berhasil |  |
| B18 | Anak | Ekspor data anak (HL7 FHIR)<br>*Export the child record (HL7 FHIR)* | Buka “Data & privasi” di profil anak, tekan “Ekspor catatan anak (FHIR)” | Pesan “Data siap dibagikan”; Bundle berisi Patient dan Observation | ✅ Berhasil |  |
| B19 | Anak | Hapus data anak<br>*Delete a child’s record* | Hapus anak yang baru ditambah | Anak dan catatannya terhapus | ✅ Berhasil |  |
| B20 | Anak | Cek gejala: bayi di bawah 2 bulan<br>*Symptom check: baby under 2 months* | Bayi 20 hari: lihat tanda bahaya bayi, ketuk “Demam” | Tanda bahaya bayi muda tampil; demam langsung peringatan merah dengan tombol 119 | ✅ Berhasil |  |
| C1 | Nuri | Tanya Nuri<br>*Ask Nuri* | Pilih ide “Apa menu untuk anak susah makan?” | Jawaban singkat berlabel AI | ✅ Berhasil |  |
| C2 | Nuri | Nuri mengenali tanda bahaya<br>*Nuri spots danger signs* | Tulis “Saya hamil dan keluar darah dari jalan lahir” | Jawaban diawali “Segera ke Puskesmas atau telepon 119” | ✅ Berhasil |  |
| C3 | Nuri | Riwayat percakapan Nuri<br>*Nuri chat history* | Buka ulang Tanya Nuri | Pertanyaan sebelumnya masih ada | ✅ Berhasil |  |
| C4 | Panduan | Panduan kesehatan<br>*Health guide* | Buka Panduan kesehatan | Tanda bahaya dan saran sumber WHO/Kemenkes tampil | ✅ Berhasil |  |
| C5 | Notifikasi | Notifikasi dan tandai dibaca<br>*Notifications and mark as read* | Buka Notifikasi, Tandai semua dibaca | Semua notifikasi terbaca | ✅ Berhasil |  |
| C6 | Privasi | Atur persetujuan data<br>*Data consent settings* | Nyalakan “Data penelitian”, Simpan; matikan lagi | Pilihan tersimpan | ✅ Berhasil |  |
| C7 | Paket | Paket gizi dan kode ambil<br>*Nutrition package and pickup code* | Buka Paket | Paket siap diambil tampil dengan QR dan kode 6 digit | ✅ Berhasil |  |
| C8 | Akun | Profil dan tim perawatan<br>*Profile and care team* | Buka Profil dan profil anak | Tim (Kader, Puskesmas) dengan tombol telepon | ✅ Berhasil |  |
| D1 | Ibu hamil | Profil kehamilan<br>*Pregnancy profile* | Buka Kehamilan | Usia kehamilan, HPL, risiko dan alasan tampil | ✅ Berhasil |  |
| D2 | Ibu hamil | Periksa hamil K1–K6: tandai dan batal<br>*Antenatal visits: mark and undo* | Tandai sudah K3, lalu Batal | Jumlah kunjungan naik lalu kembali | ✅ Berhasil |  |
| D3 | Ibu hamil | Catat LiLA dan Hb ibu<br>*Mother MUAC and Hb* | LiLA 22.5, Hb 10.2, Simpan | Tersimpan; KEK dan anemia ditandai dengan saran | ✅ Berhasil |  |
| D4 | Ibu hamil | Tablet tambah darah hari ini<br>*Today’s iron tablet* | Centang tablet tambah darah | Tercatat untuk hari ini | ✅ Berhasil |  |
| D5 | Ibu hamil | Rencana persalinan<br>*Birth plan* | Pilih tempat, transportasi, penolong, pendamping, donor, biaya; Simpan | Rencana tersimpan | ✅ Berhasil |  |
| D6 | Ibu hamil | Lapor tanda bahaya (ada sinyal)<br>*Report a danger sign (online)* | Pilih Perdarahan, Laporkan | Laporan terkirim; Kader menerima notifikasi | ✅ Berhasil |  |
| D7 | Ibu hamil | Lapor tanda bahaya tanpa sinyal<br>*Report a danger sign with no signal* | Tanpa sinyal: pilih Perdarahan, Laporkan; lalu sinyal kembali | Tombol telepon 119/Puskesmas/Kader muncul; laporan menunggu lalu terkirim sekali | ✅ Berhasil |  |
| D8 | Ibu hamil | Status sinkron<br>*Sync status* | Buka Status sinkron setelah data terkirim | Tidak ada yang menunggu; riwayat “Terkirim” | ✅ Berhasil |  |
| D9 | Ibu hamil | Tambah kehamilan<br>*Add a pregnancy* | Akun baru: isi tanggal HPHT 100 hari lalu | Kehamilan 14 minggu tercatat; tanggal masa depan ditolak | ✅ Berhasil |  |
| D10 | Ibu hamil | Catat kelahiran<br>*Record the birth* | Yuliana: nama bayi, berat 2.2 kg, panjang 44 cm, tempat, penolong; Simpan | Anak baru dibuat; BBLR/prematur ditandai; masa nifas mulai | ✅ Berhasil |  |
| D11 | Ibu hamil | Kunjungan nifas (KF/KN)<br>*Postnatal visits (KF/KN)* | Tandai sudah kunjungan nifas pertama, lalu Batal | Kunjungan tercatat lalu kembali | ✅ Berhasil |  |
| E1 | Puskesmas | Kode ibu dan QR untuk bidan<br>*Mother code and QR for the midwife* | Buka Hasil dari Puskesmas, tekan QR | Kode NS-… dan QR tampil | ✅ Berhasil |  |
| E2 | Puskesmas | Kirim hasil periksa dari Puskesmas (portal)<br>*Send check-up results from the Puskesmas (portal)* | Petugas isi kode ibu, berat, LiLA, TD 150/95, Hb, DJJ; Kirim ke HP ibu | Terkirim; hasil masuk ke HP ibu dengan TD tinggi ditandai; Kader diberi tahu | ✅ Berhasil |  |
| E3 | Puskesmas | Terima data HL7 FHIR dari sistem Puskesmas<br>*Receive HL7 FHIR data from a Puskesmas system* | Kirim Bundle FHIR dengan kunci fasilitas; kirim ulang; kunci salah | 201 dibuat, 200 diganti (tidak dobel), 401 ditolak | ✅ Berhasil |  |
| E4 | Puskesmas | Matikan dan nyalakan hubungan<br>*Switch the link off and on* | Matikan hubungan ke Puskesmas, lalu nyalakan lagi | Hubungan mati lalu aktif dengan kode baru | ✅ Berhasil |  |
| F1 | Kader | Beranda Kader: wilayah dan prioritas<br>*Kader home: area and priorities* | Buka beranda Kader | Ringkasan wilayah dan daftar prioritas kunjungan | ✅ Berhasil |  |
| F13 | Kader | Tanda bahaya ibu hamil: tindak lanjut<br>*Maternal danger sign: follow-up* | Kartu merah di beranda; buka; Sudah saya hubungi; Tidak bisa dihubungi; Sudah ke Puskesmas/bidan | Kartu tetap ada sampai hasil dicatat; “Tidak bisa dihubungi” tidak menutup; hasil menutup peringatan | ✅ Berhasil |  |
| F2 | Kader | Cari dan filter anak<br>*Search and filter children* | Cari “Budi”; filter Risiko tinggi | Daftar tersaring, tanpa kode mentah | ✅ Berhasil |  |
| F3 | Kader | Daftar ibu hamil dan filter<br>*Pregnant mothers list and filters* | Buka Ibu hamil, pilih Berisiko, Belum dicek, Nifas, Semua | Daftar berganti sesuai filter | ✅ Berhasil |  |
| F4 | Kader | Tambah ibu hamil (4 langkah)<br>*Add a pregnant mother (4 steps)* | Isi nama, HP, desa; usia hamil 12 minggu; persetujuan; Simpan | Akun ibu dibuat dengan kata sandi sementara; ibu bisa masuk dengan HP | ✅ Berhasil |  |
| F5 | Kader | Tambah anak dengan nomor HP ibu<br>*Add a child by the mother’s phone number* | Isi nomor HP ibu, nama, tanggal lahir, Simpan | Anak masuk ke akun ibu tersebut | ✅ Berhasil |  |
| F6 | Kader | Kader mengukur anak di posyandu<br>*Kader measures a child* | Ukur anak di wilayah: 9.1 kg, 80.5 cm | Tersimpan, “diukur oleh Kader” | ✅ Berhasil |  |
| F7 | Kader | Daftar dan detail kasus<br>*Case list and detail* | Buka Kasus, buka kasus Budi | Kasus urut prioritas; detail dengan tanda bahaya dan Telepon keluarga | ✅ Berhasil |  |
| F8 | Kader | Ubah status kasus<br>*Change a case status* | Pilih status “Ditangani” | Status kasus berubah | ✅ Berhasil |  |
| F9 | Kader | Catatan untuk keluarga<br>*Note shared with the family* | Tulis catatan, centang “Bagikan ke keluarga”, Tambah catatan | Catatan tampil di HP ibu sebagai rekomendasi | ✅ Berhasil |  |
| F10 | Kader | Serah terima paket di loker (kode 6 digit)<br>*Locker handover (6-digit code)* | Ganti loker ke Baumata, masukkan kode paket ibu, Buka loker | Paket tercatat diambil | ✅ Berhasil |  |
| F12 | Kader | Kirim data anak ke SATUSEHAT<br>*Send a child record to SATUSEHAT* | Kader tekan “Kirim ke SATUSEHAT (FHIR)” di profil anak | Pengiriman tercatat dan hasilnya tampil | ✅ Berhasil |  |
| F11 | Kader | Notifikasi Kader<br>*Kader notifications* | Buka Notifikasi | Tanda bahaya ibu dan hasil Puskesmas tampil di atas | ✅ Berhasil |  |
| G1 | Petugas | Dasbor wilayah<br>*Area dashboard* | Buka Dasbor | Angka anak, stunting, kasus, sumber data; indikator ibu hamil | ✅ Berhasil |  |
| G2 | Petugas | Kinerja model AI (Detail teknis)<br>*AI model performance* | Buka Detail teknis | Label Data demo, akurasi, FNR, model pembanding, matriks kebingungan | ✅ Berhasil |  |
| G3 | Petugas | Proyeksi dan peta wilayah<br>*Projection and area map* | Muat proyeksi, peta dan daftar ditandai | Data tersedia tanpa galat | ✅ Berhasil |  |
| G4 | Petugas | Tinjau hasil AI<br>*Review an AI result* | Buka kasus yang menunggu tinjauan, pilih tingkat, tulis catatan, Simpan | Tinjauan tersimpan dan hilang dari antrian | ✅ Berhasil |  |
| G5 | Petugas | Setujui permintaan paket<br>*Approve a package request* | Buka permintaan, lihat pilihan jalur, Setujui | Paket disetujui dan kode ambil dibuat | ✅ Berhasil |  |
| G6 | Petugas | Tolak permintaan paket<br>*Reject a package request* | Buka permintaan lain, Tolak | Permintaan ditolak | ✅ Berhasil |  |
| G7 | Petugas | Logistik: loker, isi ulang, simulasi<br>*Logistics: lockers, restock, simulation* | Buka tab Loker; Percepat simulasi +30 mnt | Stok loker tampil; simulasi berjalan | ✅ Berhasil |  |
| G8 | Petugas | Tinjau kasus anak<br>*Review a child case* | Buka kasus anak lain | Riwayat, alasan dan tindakan tampil | ✅ Berhasil |  |
| G9 | Dokter | Dokter menulis catatan klinis<br>*Doctor writes a clinical note* | Dokter buka kasus Budi, tulis catatan klinis, Simpan; ubah status ke Dirujuk | Catatan dan status tersimpan | ✅ Berhasil |  |
| G10 | Admin | Admin membuat akun petugas<br>*Admin creates a staff account* | Admin buat akun Kader baru | Akun dibuat dan bisa masuk | ✅ Berhasil |  |
| G11 | Admin | Log audit dan model<br>*Audit log and models* | Admin buka log audit dan daftar model | Kegiatan tercatat; model aktif terdaftar | ✅ Berhasil |  |
| H1 | Keamanan | Ibu tidak bisa melihat anak keluarga lain<br>*A mother cannot see another family’s child* | Sarah membuka data anak Maria | Ditolak (403) | ✅ Berhasil |  |
| H2 | Keamanan | Kader hanya wilayahnya<br>*Kader sees only their area* | Kader Oesapa membuka anak di Soe | Ditolak (403) | ✅ Berhasil |  |
| H3 | Keamanan | Halaman dalam butuh masuk<br>*Inner pages need login* | Buka /settings tanpa masuk | Dialihkan ke halaman masuk | ✅ Berhasil |  |
| H4 | Kualitas | Bahasa Inggris lengkap<br>*Complete English interface* | Ibu memilih English, buka beranda dan profil anak | Tidak ada kunci mentah atau sisa bahasa Indonesia | ✅ Berhasil |  |
| H5 | Kualitas | Tidak ada galat halaman atau server<br>*No page or server errors* | Seluruh skenario di atas | Tidak ada galat JavaScript atau HTTP 5xx | ✅ Berhasil |  |
