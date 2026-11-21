# Verifikasi implementasi UVelocity 1.3.0

Tanggal verifikasi: **20 November 2026**. Lingkungan pengujian: Linux, Node.js **24.22.3**, PostgreSQL native **18.7**, TypeScript, SDK Colyseus **0.18.10**, serta Three.js **r128** untuk geometri renderer.

Dokumen ini membedakan hasil pengujian otomatis dari hal yang masih perlu dicoba pada browser dan server tujuan. Tidak ada klaim bahwa aplikasi telah dipasang pada domain publik.

## Verifikasi pembaruan 1.3.0

Pembaruan ini meliputi layout ponsel, ergonomi dan lifecycle input sentuh, tombol utama pada header Garasi/hasil, pengurangan scroll, pembedaan model Regera dan Venom F5, serta penambahan Panther sebagai kendaraan ke-16. Hasil lengkap backend/realtime di bagian berikut adalah **riwayat verifikasi basis 1.2.0**, Pengujian yang diulang untuk versi ini dicatat dalam bagian 1.3.0; angka historis tetap menyebut versi asalnya.

### Antarmuka dan input

- `npm run test:ui`: **17/17 kelompok lulus**, termasuk aksi header yang hanya muncul satu kali, label **Pakai mobil ini**, pengaktifan kendaraan tersimpan, pratinjau tanpa transaksi, serta pembayaran kosmetik melalui review.
- `npm run test:media-ui`: **8/8 kelompok lulus**, termasuk satu tombol **Kembali ke garasi** sebelum metrik/tabel, callback keluar satu kali, serta iframe yang sama saat kembali, loading, dan hasil.
- `npm run typecheck`: **lulus** setelah perubahan komponen akhir.
- `node --check public/game/game.js`: **lulus**; stylesheet HUD dapat diparse dengan PostCSS.
- `node tests/renderer/verify.cjs --finish-only`: **10 kelompok lulus**, tanpa warning/error pada harness. Pemeriksaan ini dijalankan setelah perbaikan input, sebelum revisi kedua GLB; verifikasi geometri akhir dicatat terpisah di bawah.

Tes pointer menjalankan handler game yang disertakan: gas, kemudi, dan nitro bersamaan; dua jari pada satu pedal; pembatalan satu jari tanpa melepas jari lain; kehilangan pointer capture; fallback pelepasan di luar tombol; reset saat pause, disembunyikan, blur, serta salat; dan pelepasan lama yang tidak boleh membatalkan sentuhan baru. Input selama pause/salat/tersembunyi/finis tetap diblokir.

Aturan CSS ditelaah untuk viewport arena 320 × 544, 360 × 644, dan 740 × 272. Angka ukuran dalam dokumentasi berasal dari aturan CSS, bukan pengukuran screenshot browser. Pada lebar 320, kelompok kontrol memerlukan 308 piksel termasuk tepi sehingga masih ada 12 piksel antara kelompok kiri dan kanan. Header/strip ruang disisihkan oleh aplikasi induk; instrumen berakhir 12 piksel di atas tombol kemudi/pedal.

Percobaan membuka server lokal aplikasi melalui browser pengujian tidak berhasil: koneksi lokal ditolak dan pengamatan halaman kemudian dibatasi kebijakan browser. Tidak ada klaim screenshot UI, interaksi multi-touch perangkat fisik, FPS, atau shader GPU telah diverifikasi. Server lokal memakai PostgreSQL pengujian terpisah; halaman fixture dan akun pengujian tidak dimasukkan ke paket.

### Database dan kompatibilitas kendaraan

- Pengujian upgrade identitas dengan PostgreSQL native: **4/4 lulus**. Migrasi 012/013 mempertahankan inventory, wallet, purchase, tampilan berbayar, ledger, audit, respons idempoten, penawaran yang belum diterapkan, serta tuning/fisika/hadiah admin. Nama khusus operator tidak ditimpa.
- Pemeriksaan upgrade lama yang langsung terdampak penambahan katalog: **4/4 lulus** (appearance, cat, thumbnail, kelengkapan katalog 16 kendaraan).
- Gate backend penuh menjalankan **71 tes**: **69 lulus** pada percobaan pertama. Dua kegagalan berasal dari fixture yang mengasumsikan ruleset awal versi 2; migrasi 013 menerbitkan versi 3. Fixture diperbaiki untuk membaca versi aktif, lalu file backend dan identitas yang terdampak dijalankan ulang: **18/18 lulus**, mencakup kedua kegagalan sebelumnya. Tidak ada kegagalan backend tersisa; suite lain yang sudah lulus tidak diulang tanpa kebutuhan.
- Alur Panther yang diperiksa mencakup beli, equip, cat berbayar, akses gratis admin lalu dikunci kembali, kepemilikan permanen, serta tuning terpisah. Warna awal `#19252e` mengikuti foto; harga Rp150.000 dan parameter 170 / 10.8 / 0.88 adalah keseimbangan game.
- Batas room tetap **15 peserta total / 14 bot maksimum**. Katalog 16 kendaraan tidak menaikkan jumlah peserta dalam satu pertandingan.

### Renderer, model akhir, dan build

- Suite renderer penuh: **16 kelompok verifikasi lulus**, **0 warning / 0 error**. Memeriksa 16 model/cockpit, cat pelek standar, tiga paket pelek per mobil, lima pola striping pada setiap model (80 pasangan model/pola), lifecycle input sentuh, readiness, jeda salat, dan perlambatan finisher. Tidak memakai GPU/WebGL nyata.
- Perbedaan geometri dua hypercar diverifikasi melalui GLTFLoader dan raycast: **9/9** sampel area kanopi Regera mengenai atap/kaca; **0/9** pada area tengah kokpit Venom. Sampel permukaan kap juga berbeda. Panther mempunyai siluet MPV, anchor roda/lampu/exhaust sesuai metadata, posisi dashboard kanan yang lebih tinggi, serta waveform diesel yang finite.
- **13 GLB lama dan 4 modul lingkungan/fallback identik SHA-256** dengan paket dasar. Hanya dua GLB hypercar ditinjau ulang dan satu GLB Panther ditambahkan. Sebelas migrasi terdahulu tetap identik.
- Tiga model akhir ditinjau melalui render depan/belakang Blender Cycles CPU; Panther juga dari samping. Bingkai kaca, bumper, lampu, pelek, splitter dan detail yang mengambang telah dirapikan berdasarkan render. Berkas hasil inspeksi berada di `docs/previews/`.
- Typecheck seluruh proyek **lulus** setelah helper tes diperbaiki agar menerima tipe loadout beku dengan nullability yang benar.
- Build produksi **lulus**. Bundle utama 663,73 kB / 218,69 kB gzip; CSS 88,81 kB / 18,89 kB gzip. Vite tetap memberi peringatan ukuran chunk di atas 500 kB; ini bukan kegagalan build ataupun pengukuran FPS.

### Integrasi HTTP, PostgreSQL, dan multiplayer akhir

`INTEGRATION_STATIC=1 npm run test:integration`: **10/10 langkah lulus**, memakai aplikasi server sebenarnya, PostgreSQL native terpisah, cookie/CSRF HTTP, serta SDK Colyseus melalui WebSocket.

Langkah baru Panther menjalankan topup admin, pembelian, pengaktifan mobil, pemeriksaan kosmetik bawaan, bergabung ke lobi, readiness/barrier arena, hitungan bersama, lalu gas yang menghasilkan kecepatan dan perpindahan posisi resmi dari server. Statistik serta ruleset yang dibekukan tetap cocok dengan katalog. Shell React, HTML game, branding, cockpit dan seluruh **16 GLB** dilayani dari build produksi, termasuk pemeriksaan byte-range GLB. Pengujian ini tidak memakai browser atau akun produksi.

## Riwayat verifikasi basis 1.2.0

| Pemeriksaan | Hasil aktual | Cakupan |
| --- | --- | --- |
| TypeScript seluruh proyek | Lulus | Klien React, kontrak bersama, backend, skrip, dan tes |
| Build produksi | Lulus | Bundle React/Vite dan keluaran Node.js |
| Simulasi, protokol, dan klien | **61/61 lulus** | SDK WebSocket nyata, shared physics, prediction, reconnect, start/jeda, pemulihan flag cat, hasil tanpa menunggu bot, serta coasting/interpolasi finisher |
| Backend PostgreSQL | **67/67 lulus** | Database native, sebelas migrasi, ekonomi/cat pelek/striping dan tarif admin, salat, unggahan MP3/JPEG/foto kendaraan, audit, CAS, dan penyajian byte range |
| Integrasi seluruh adapter + aset statis | **9/9 bagian lulus** | Server aplikasi sebenarnya, HTTP, cookie, PostgreSQL, SDK Colyseus, dan serving produksi |
| Renderer dan bengkel | **Lulus, tanpa warning/error dalam harness** | Identitas seluruh 15 GLB, cat pelek bawaan selektif pada 15 mobil, roda/striping, tiga dunia, 15 cockpit, barrier, prayer, dan rollout finis; tanpa WebGL GPU |
| Interaksi React aplikasi | **17/17 skenario lulus** | Cat pelek bawaan/striping berbayar dan tarif admin, Garasi milik sendiri vs seluruh Showroom, navigasi melingkar, refresh foto tanpa reset renderer, serta iframe yang tetap mounted dan kontrol inert ketika jeda |
| Antarmuka lokasi/jeda salat | **4/4 kelompok lulus** | GPS eksplisit/cadangan, pembatalan permintaan lama, jam server, persetujuan ruang dan token |
| Antarmuka media/loading | **8/8 kelompok lulus** | Audio, unggahan XHR, admin CAS, overlay/server barrier, prioritas salat, fokus keyboard, serta iframe hasil tetap tampil |
| Antarmuka foto kendaraan | **5/5 kelompok lulus** | Foto/fallback, unggahan, pergantian model, pembatalan, konflik versi, penghapusan, serta cleanup komponen |
| Dependensi produksi | Lulus | Instalasi `npm ci --omit=dev --ignore-scripts` terpisah dan decoding/encoding JPEG dengan sharp 0.35.5 |
| Identitas dan JPEG contoh | Lulus pemeriksaan aset | Kedua logo kampus memiliki alpha transparan, logo TI disalin tanpa perubahan; JPEG 1672 × 941 diterima validator server |
| Server pengembangan | Lulus | HTTP, socket HMR Vite, vite-ping, dan dua klien Colyseus pada satu port; shutdown bersih |
| Konfigurasi pemasangan | Pemeriksaan dari v1.1 dipertahankan | Berkas setup/Compose tidak diubah; runtime Docker tetap belum dijalankan di lingkungan ini |

Build memiliki peringatan ukuran chunk JavaScript utama di atas batas peringatan Vite sebelum gzip: sekitar **663 kB**, atau **218 kB gzip** pada build verifikasi. Build tetap berhasil; angka itu bukan pengukuran waktu muat atau frame rate perangkat.

## Multiplayer dan simulasi

Perintah: `npm test`.

- SDK Colyseus sungguhan membuka ruang dengan **2, 4, 8, dan 15 klien manusia** dalam lingkungan pengujian.
- Ticket sekali pakai harus berasal dari sesi yang sesuai. Loadout yang belum dimiliki ditolak.
- Readiness, host, countdown, snapshot, dan gerak resmi diperiksa melalui pesan socket.
- Waktu simulasi dibandingkan dengan waktu nyata pada **30 Hz dan 90 Hz**. Masalah timer ganda yang ditemukan selama integrasi telah diperbaiki dan dilindungi pemeriksaan khusus.
- Simulasi **120 ms round-trip latency**, koneksi terputus, reconnect, batas kesempatan reconnect, pencabutan sesi, dan pengiriman ulang hasil privat diperiksa.
- Prediksi klien memakai simulasi gerak yang sama, mengulang hanya input yang belum diakui, dan menyelaraskan satu input terhadap satu langkah simulasi.
- Input yang dikirim berlebihan tidak memperoleh tambahan waktu fisika. Kontrol yang kedaluwarsa berhenti, bukan mempertahankan gas atau membuat mobil mundur terus-menerus.
- Gate harus dilalui berurutan. Melintasi garis start pertama kali atau bergerak mundur tidak dapat menambah lap secara tidak sah.
- **15 pembalap menjalani setiap satu dari tiga lintasan** melalui simulasi bersama: empat slot manusia memakai pengemudi uji otomatis dan sebelas bot memakai kontrol bot. Seluruh manusia finis; bot yang masih tertinggal menjadi DNF ketika manusia terakhir finis. Ini merupakan tes fisika, bukan rekaman 15 orang memainkan browser.
- Start renderer yang dibatalkan, pemuatan model gagal, tombol unready selama pemuatan, socket setelah dispose, dan token reconnect yang diputar ulang diperiksa.
- Pemulihan pilihan lobi setelah kunci admin diuji: kode error dipertahankan, klien menunggu fase lobi, pilihan resmi yang berbeda dikirim sekali, balapan aktif tidak diubah, dan respons lama tidak dipasang pada ruang/sesi baru.

Pengujian ini membuktikan perilaku logika dan protokol pada kondisi tes. Ini bukan benchmark banyak ruang serentak, pengalaman internet lintas wilayah, atau pengukuran 15 perangkat dengan GPU nyata.

## Hasil tanpa menunggu bot dan perlambatan setelah finis

Sembilan pengujian baru dalam `tests/race/finish.test.ts` mencakup kecepatan yang tetap positif tepat saat crossing; perlambatan monoton sampai nol; penolakan gas, nitro, rem, setir, serta reset setelah finis; dan pembekuan lap, gate, progres, jarak penilaian, serta timestamp. Finisher bergerak sebagai ghost sehingga tidak menghambat peserta lain.

Pengujian runtime membuktikan balapan berhenti pada tick manusia terakhir finis/DNF, bot yang sudah finis mempertahankan hasil, dan bot tersisa mendapat DNF sesuai progres. Pemain terputus masih mengikuti grace reconnect lama. Roster manusia kosong, seluruh manusia keluar, serta deadline tidak meninggalkan balapan bot berjalan selamanya.

Pengujian room memakai SDK Colyseus sungguhan dengan layanan settlement uji: hasil dikirim setelah peserta manusia selesai tanpa menunggu bot, retry setelah pengakuan commit sengaja dihilangkan menggunakan satu result yang dibekukan, dan jeda salat menghentikan coasting. Transaksi kredit PostgreSQL sendiri tetap diverifikasi oleh suite backend; ini tidak diklaim sebagai satu tes browser sampai finish dan menerima uang.

Tiga regresi tambahan pada `tests/race/client.test.ts` memeriksa interpolasi x/z/heading/speed/kemudi finisher lokal dan remote dari snapshot yang sama-sama sudah finis. Snapshot pertama tidak ditarik kembali ke sisi sebelum garis, metadata skor tetap terbaru, dan pergantian fase salat/settlement membuang history lama. Tidak ada input atau prediksi baru bagi finisher.

Suite renderer penuh dijalankan untuk cockpit/wheels/striping. Setelah perubahan rollout, pemeriksaan terarah `node tests/renderer/verify.cjs --finish-only` mengulang lifecycle online/dashboard/barrier/prayer dan memeriksa rollout visual tiga detik: pose, roda, kamera, HUD, serta suara melambat; pengiriman fase hasil tetap langsung; snapshot hasil yang berulang tidak memulai ulang animasi; dan seluruh data hasil resmi tidak berubah. Tidak ada warning/error dalam kedua jalur harness.

## Jeda salat dan kesiapan ulang

Pengujian PostgreSQL mencakup kelima batas masuk/keluar window pribadi tepat 15 menit; ihtiyat 2 menit tanpa menggandakan penyesuaian Zuhur; 44 pilihan kota, WIB/WITA/WIT termasuk Jayapura, dan pergantian tanggal setempat. Dua kota mendapat jadwal independen. Koordinat dibulatkan/divalidasi, waktu atau zona yang dikirim klien ditolak, dan fallback polar menampilkan alasan Jakarta.

Perubahan lokasi pada permintaan pertama sesudah azan tetap menangkap window lokasi lama. Membuat ulang layanan, login ulang, serta 12 perubahan/pembacaan bersamaan tidak dapat memperpendek window aktif. HTTP423 menutup gameplay/transaksi/admin, sementara autentikasi, profil, dan koreksi lokasi tetap tersedia; saldo, inventory, dan loadout tidak berubah oleh jeda.

Tes realtime memakai SDK Colyseus sungguhan dan jam server yang diinjeksi, sehingga 15 menit dapat dilompati deterministik tanpa mengurangi durasi produksi. Pemeriksaan meliputi:

- Seluruh manusia, bot, posisi, lap, dan waktu simulasi tetap beku; ruang lain tetap berjalan.
- Waktu minimum 15 menit sejak pembekuan dan persetujuan eksplisit seluruh peserta sebelum hitungan 3 detik bersama.
- Timestamp mulai jeda dan batas minimum memakai satu pembacaan jam server. Tes ruang nyata memajukan jam injeksi 2 milidetik pada setiap pembacaan untuk memastikan pergantian milidetik tidak mengurangi durasi 15 menit; temuan dua pembacaan jam yang sempat berbeda telah diperbaiki.
- Jadwal anggota kedua memperpanjang deadline, mengganti token, dan menghapus persetujuan lama. Konfirmasi terlalu awal atau memakai token lama ditolak.
- Pause saat countdown, pause saat loading, serta hasil persistensi start yang datang terlambat tidak dapat melewati jeda atau barrier arena.
- Reconnect selama window pribadi tidak melakukan kick/logout. Putus sambungan menghapus kesiapan peserta; keluar/grace expiry mengeluarkannya dari daftar persetujuan agar peserta yang tersisa bisa lanjut.
- Respons pemeriksaan jadwal yang lambat tidak memberi bot/manusia tambahan langkah simulasi atau menggeser batas azan. Status tidak tersedia menahan seluruh simulasi sampai dapat dipercaya.
- Pemain yang keluar saat pemeriksaan terakhir kesiapan masih berlangsung tidak membuat peserta tersisa yang sudah siap terjebak menunggu.
- Klien tidak menyimpan input yang ditekan ketika fase beku. Persetujuan lanjut menunggu arena serta frame nyata; token baru, drop, reconnect, atau renderer berganti membatalkan konfirmasi lama.

Tidak ada koordinat lokasi pribadi di payload ruang. Aturan minimum pribadi dan ruang berbeda secara sengaja: window pribadi dihitung dari jadwal azan, sedangkan ruang mendapat sekurang-kurangnya 15 menit sejak pembekuan terdeteksi. Uji jam ini memverifikasi keputusan program, bukan kesesuaian jadwal dengan azan masjid tertentu. Perhitungannya tidak mengklaim umpan resmi Kemenag.

## Akun, database, dan ekonomi

Perintah: `npm run test:backend`.

Pembungkus pengujian menjalankan PostgreSQL native sementara, bukan SQLite atau database dalam memori. Database dan kredensial pengujian dibuat khusus lalu dibuang. Pengujian mencakup:

1. Migrasi berulang dan seed katalog yang sebenarnya.
2. Kendaraan awal dan kredit Rp25.000 diberikan sekali secara atomik.
3. Hash kata sandi, cookie HttpOnly, sesi, logout, CSRF, Origin, serta otorisasi admin.
4. Ticket balap yang terikat sesi, kedaluwarsa, dan sekali pakai.
5. Permintaan pembelian bersamaan dan retry hanya mendebit satu kali.
6. Dua pembelian yang masing-masing terjangkau tetapi totalnya melebihi saldo tidak menghasilkan saldo negatif.
7. Topup dengan referensi bisnis yang sama tidak menggandakan saldo atau audit.
8. Kegagalan SQL setelah debit memulihkan seluruh transaksi: saldo, kepemilikan, ledger, dan idempotency.
9. Versi katalog dan kepemilikan loadout divalidasi server.
10. Cat dan striping harus melewati penawaran bengkel; PUT loadout atau pesan realtime dengan kosmetik belum dibayar ditolak. Tampilan tersimpan dipulihkan gratis.
11. Aturan performa yang sudah dipublikasikan tidak diubah; balapan lama tetap memakai versi awalnya.
12. Settlement bersamaan menghasilkan satu hadiah; DNF menghasilkan nol; replay dengan hasil yang berbeda ditolak.
13. Saldo setiap akun yang diuji cocok dengan jumlah ledger-nya.
14. Query histori dibatasi dan akses admin ditolak oleh server untuk pemain biasa.
15. Upgrade dari database versi lima migrasi dengan akun lama, pembelian, warna tersimpan, dan tuning admin mempertahankan data setelah migrasi 006/007/008/009/010/011.
16. Penawaran tidak mendebit saldo. Apply bersamaan dan retry menyimpan satu debit serta satu tampilan; SQL gagal memulihkan seluruh perubahan.
17. Kedaluwarsa, perubahan harga/layanan, versi tampilan yang berubah, dan saldo kurang menolak pemasangan tanpa debit parsial.
18. Cat, pelek, desain striping, serta warna striping disimpan per kendaraan permanen. No-op dan perpindahan ke tampilan tersimpan tidak dibayar ulang.
19. Buka/kunci admin tidak memberi atau mencabut inventory. Pembeli permanen tetap dapat bermain setelah kendaraan dikunci.
20. Kendaraan gratis yang dikunci ditolak untuk lobi/start baru, termasuk ketika pemain terdampak bukan host; kendaraan pada pertandingan berjalan tetap memakai pilihan yang dibekukan.

## Cat pelek bawaan, warna striping, dan tarif admin

Sembilan regresi tambahan pada `server/services/__tests__/cosmetic-paint.integration.test.ts` dan pembaruan suite appearance memakai PostgreSQL native. Status `stockRimPainted` membedakan material pabrik dari pengecatan berbayar: memilih warna perak yang sama dengan nilai placeholder pertama kali tetap dikenai layanan cat pelek, sedangkan penggunaan konfigurasi tersimpan/no-op tidak mendebit ulang.

Pengujian mencakup pengembalian finishing pabrik berbayar; pergantian paket pelek yang tidak dapat mengubah flag secara gratis; RGB tersembunyi yang tidak diterapkan pada finishing pabrik; penolakan kosmetik melalui PUT loadout/admission/pesan ruang; retry pembayaran; serta pemulihan data saat transaksi gagal. Payload arena membawa keadaan cat yang telah dibayar dan dibekukan pada awal pertandingan.

Harga bodi/lapisan, pelek, dan warna striping dibaca dari katalog admin. Pengujian mengubah tarif, menonaktifkan layanan, membuat tarif nol, dan mengganti harga setelah penawaran dibuat. Penawaran lama ditolak tanpa debit jika versi/harga tidak sesuai. Mengganti warna pada desain striping yang sama memakai `stripe-paint`; memasang atau mengganti desain berikut warna pilihannya memakai tepat satu layanan desain.

Upgrade 010 → 011 mempertahankan harga/ketersediaan/versi katalog admin, saldo, kepemilikan, tampilan lama, serta respons pembayaran yang sudah committed. Status cat pelek bawaan lama dimulai false. Penawaran lama yang belum dipakai kedaluwarsa agar pemanggil meminta rincian sesuai aturan biaya baru. Hanya label default layanan pelek disesuaikan agar mencakup pelek bawaan dan custom.

Pemeriksaan renderer terarah `node tests/renderer/verify.cjs --stock-paint-only` memuat seluruh 15 model asli, lalu memeriksa material pabrik, pengecatan pada RGB placeholder yang sama, ganti warna, kembali ke finishing pabrik, perpindahan paket custom, dan dispose. Material, geometri, serta tekstur sumber tetap utuh; dua instance model yang sama tidak saling mewarnai. Empat roda Veyron diverifikasi terhadap fixture partisi triangle UV yang terpisah dari implementasi, sehingga ban, rem, logo, dan detail noncat memakai material asli. Snapshot lokal/remote yang hanya mengganti flag tetap memperbarui tampilan, snapshot berulang tidak membuat ulang material, serta lifecycle dashboard/loading/salat/finis tetap berjalan. Tidak ada warning/error pada harness ini. Ini memeriksa geometri/material dan integrasi renderer CPU, bukan hasil shader/GPU atau FPS browser.

## Unggahan dan penyimpanan media admin

Empat belas pengujian baru dalam `server/services/__tests__/media.integration.test.ts` memakai PostgreSQL native dan HTTP aplikasi sebenarnya. MP3 uji merupakan nada sintetis; tidak ada lagu atau akun nyata yang di-seed ke aplikasi.

- MP3 MPEG1/2/2.5, CBR/VBR, pemotongan tag nonaudio, dan penolakan frame rusak/terpotong diuji. JPEG didekode sepenuhnya, diorientasikan ulang, dan disimpan ulang tanpa metadata asli.
- Batas ukuran, dimensi, kuota koleksi, unggahan bersamaan, deduplikasi berdasarkan isi, serta invariant database diperiksa.
- Akun pemain biasa, sesi yang hilang, Origin asing, CSRF salah, dan jeda salat ditolak untuk mutasi admin.
- Aktivasi membutuhkan versi yang tepat; perubahan bersamaan menghasilkan satu pemenang dan konflik yang jelas. Berkas aktif tidak dapat dihapus.
- Pool PostgreSQL baru membaca kembali byte media yang sama, membuktikan media tidak hanya tersimpan di memori proses.
- GET, HEAD, range normal/suffix, range yang ditolak, ETag/304, serta If-Range diperiksa melalui HTTP. Respons tidak membocorkan identitas pengunggah.
- Unggahan, aktivasi, penghapusan, dan audit disimpan secara transaksional. Pengulangan unggahan yang sama tidak menggandakan media atau audit upload.

JPEG contoh `examples/media/uvelocity_loading.jpg` juga dijalankan melalui validator upload produksi: format JPEG, dimensi 1672 × 941, dan hasil pemrosesan di bawah batas 10 MiB. Musik contoh tidak diaktifkan pada konfigurasi produksi.

## Foto kendaraan dan migrasi 010

Sebelas pengujian tambahan dalam `server/services/__tests__/vehicle-thumbnails.integration.test.ts` memakai PostgreSQL native dan HTTP sebenarnya:

- Upgrade database dengan sembilan migrasi menjadi sepuluh mempertahankan harga, status akses, kepemilikan, wallet, tuning, serta pengaturan musik/loading yang sudah tersimpan.
- JPEG, PNG, dan WebP benar-benar didekode menjadi pixel, dinormalisasi di dalam 512 × 288 tanpa crop/pembesaran, lalu disimpan menjadi WebP. Proporsi, tepi gambar, alpha, orientasi, dan penghapusan metadata diperiksa.
- Berkas palsu, MIME yang tidak cocok, gambar rusak/terpotong, ukuran melebihi batas, dan animasi ditolak.
- Admin nonaktif, pemain biasa, cookie hilang, Origin asing, CSRF salah, dan jeda salat menolak mutasi.
- Penggantian dan penghapusan bersamaan hanya menerima versi yang tepat. Foto mempunyai versi terpisah dan tidak mengubah harga/versi katalog, inventory, loadout, atau kredit.
- Penggantian/penghapusan membuang byte foto lama secara atomik. Kegagalan audit yang disengaja membatalkan transaksi dan memulihkan foto lama beserta versinya.
- Koneksi database baru membaca kembali byte yang sama; GET, HEAD, ETag/304, URL baru pada penggantian, dan 404 untuk aset yang dihapus diuji melalui HTTP.

Perintah antarmuka: `npm run test:vehicle-images-ui`. Lima kelompok DOM memakai React, LinkeDOM, dan batas jaringan terkontrol. Cakupannya meliputi lazy loading, `contain`, alt sesuai model, fallback ikon, penolakan URL foto asing, validasi berkas/alasan, upload File asli dengan CSRF/progress, pencegahan submit ganda, cancel, draft per model, konflik yang dimuat ulang tanpa retry otomatis, konfirmasi hapus, request lama, unmount, dan pelepasan Blob URL. Tes memastikan tidak ada permintaan pembelian, perubahan harga, tuning, atau equip dari komponen foto.

Tidak ada foto mobil asli yang di-seed; admin mengisi setiap model. Validasi antarmuka ini tidak menggantikan pemeriksaan layout/pixel browser sasaran.

## Integrasi aplikasi yang sebenarnya

Perintah setelah build:

```bash
INTEGRATION_STATIC=1 node tests/with-postgres.mjs tests/integration.ts
```

Di PowerShell, set `$env:INTEGRATION_STATIC='1'` sebelum menjalankan `npm run test:integration`. `npm run test:integration` tanpa flag menjalankan delapan bagian layanan dan jaringan; flag menambahkan pemeriksaan aset statis sebagai bagian kesembilan.

Tes memakai `createApplication()` dari server yang sama dengan aplikasi produksi, PostgreSQL native, request HTTP sebenarnya, dan klien Colyseus sebenarnya. Cakupannya:

- Register/login, perubahan cookie sesi, profil, dan kepemilikan awal.
- Pembelian pelek dan quote/apply cat/striping lewat HTTP; penawaran saat saldo kurang, topup, retry dengan kunci sama, serta pemeriksaan tidak ada debit ganda.
- Admin dibuat secara eksplisit untuk tes; topup, harga, tuning, dan hadiah diterbitkan lewat API admin.
- Lookup kode privat, ticket dari cookie akun, join dua klien, readiness, start host, dan pergerakan melalui input.
- Publikasi tuning saat balapan berjalan tidak mengubah versi balapan tersebut. Balapan berikutnya memperoleh versi baru. Striping yang dibayar masuk ke snapshot multiplayer dan tetap dibekukan untuk pertandingan itu.
- Balapan dengan batas waktu **3,5 detik** berakhir dan hasil DNF tersimpan di PostgreSQL.
- Logout mencabut akses HTTP, ticket, socket aktif, dan hak reconnect.
- HTML React, iframe game, modul cockpit, ketiga logo, dan kelima belas GLB dilayani dari build produksi. Pengaturan media awal kosong dan dapat dibaca melalui API. Header GLB diperiksa melalui request range. Inline event handler yang bertentangan dengan CSP tidak ada pada HTML game.

**Batas penting:** alur akhir tes integrasi sengaja menghasilkan DNF agar singkat dan terukur. Pengujian hadiah finish positif dan idempotency dilakukan pada suite PostgreSQL; keberhasilan menyelesaikan lintasan diperiksa pada suite fisika. Tidak ada klaim satu tes browser end-to-end telah mengemudi sampai menang dan menerima hadiah.

## Renderer, bengkel, dan roda

Perintah: `npm run test:renderer`.

Harness portabel memuat berkas yang disertakan dalam proyek, memakai Three.js, DOM LinkeDOM, serta Canvas 2D native untuk membuat tekstur. Daftar detail serta batasnya ada di [GRAPHICS.md](GRAPHICS.md).

Pemeriksaan meliputi SHA-256 seluruh lima belas GLB dan modul lingkungan yang dipertahankan; geometri/material bengkel yang valid; area servis tengah yang bebas; kelima belas kendaraan dikombinasikan dengan tiga paket roda dan pemulihan roda asli; lima desain striping mengikuti triangle permukaan cat dengan kaca/lampu/ban tetap terpisah; kamera showroom; kualitas dan suasana; barrier model; rendering dari snapshot; input; mute; exit yang menunggu konfirmasi aplikasi; pencegahan perhitungan lap/hasil lokal; dan pergantian ketiga sirkuit. Fase jeda mempertahankan arena, menahan gerak roda/efek/input, serta tetap memenuhi barrier frame untuk kesiapan melanjutkan.

Kelima belas GLB juga dibandingkan langsung dengan byte pada ZIP v1.1 yang dipulihkan dan semuanya identik. Cockpit baru diuji menggunakan proyeksi kamera dan raycast area jalan pada tiga rasio layar, geometri valid untuk setiap model, arah putaran setir dari snapshot, perubahan near clipping, pemulihan visibilitas eksterior, serta pelepasan sumber daya. Ini memeriksa struktur/geometri, bukan gambar GPU akhir.

`WebGLRenderer` serta `PMREMGenerator` diganti dengan pencatat keadaan pada harness. Hasilnya tidak memverifikasi kompilasi shader oleh driver, gambar akhir refleksi/bayangan, antialiasing, audio yang benar-benar terdengar, FPS, atau sentuhan pada perangkat nyata. Bagian tersebut tetap perlu ditinjau pada browser sasaran.

## Interaksi React untuk transaksi bengkel dan jeda

Perintah: `npm run test:ui`. Tes menjalankan komponen React yang sebenarnya dengan LinkeDOM serta batas HTTP terskrip. Ini menguji interaksi dan payload antarmuka; transaksi database sendiri diuji terpisah menggunakan PostgreSQL.

- Memilih warna tidak mengirim apply atau mengurangi saldo. Rincian biaya muncul sebelum tombol pembayaran.
- Respons pembayaran yang sengaja dihilangkan setelah commit dapat dicoba ulang dengan identitas transaksi yang sama; antarmuka menerima satu hasil pembayaran.
- Pergantian dua mobil yang dimiliki memulihkan warna masing-masing tanpa pembayaran tambahan.
- Pemilihan Twin Racing masuk ke penawaran, pembayaran, dan tampilan tersimpan.
- Mobil gratis sementara memakai tampilan bawaan ketika digunakan; memasuki Bengkel memilih kendaraan milik pemain. Admin menampilkan kontrol akses terpisah serta kategori jasa cat/striping.
- Panel persiapan membedakan status Siap di lobi dari status Arena siap, menampilkan perangkat yang masih memuat, serta menyembunyikan tombol start selama tahap loading.
- Saat snapshot ruang masuk ke `prayer_pause` lalu `resume_countdown`, iframe yang sama tetap ada, kontrol aplikasi di belakang overlay bersifat inert, dan tidak ada persetujuan otomatis. Kontrol terbuka hanya pada fase berjalan dari server.
- Garasi memuat hanya kendaraan milik permanen, sedangkan Showroom menampilkan semua model. Tombol Sebelumnya/Berikutnya berputar melalui daftar yang sesuai tanpa equip atau transaksi otomatis; konfigurasi tersimpan ikut dipratinjau.
- Mobil gratis admin yang sedang aktif tidak dimasukkan ke Garasi dan tidak diganti secara diam-diam di server. Pembelian baru muncul setelah inventory dimuat ulang. Satu/nol mobil menonaktifkan navigasi dan keadaan kosong menyediakan jalur ke Showroom.
- Perubahan inventory yang datang terlambat selama loading, balapan, atau jeda tidak mengganti arena. Pembaruan metadata foto saja tidak memicu reset renderer/model ataupun mutasi ekonomi.
- Memilih warna perak pertama kali pada pelek standar mengirim flag pengecatan dan meminta penawaran, bukan langsung equip. Pengembalian finishing pabrik melewati penawaran berbayar; menggunakan kembali konfigurasi tersimpan dan pergantian paket yang sudah dimiliki tidak membayar ulang.
- Warna striping terlihat sebelum grid desain, tidak bisa dipilih tanpa pola, memakai tarif recolor tersendiri untuk desain yang sama, dan sudah termasuk biaya saat memasang desain baru.
- Tiga kontrol tarif admin memakai katalog yang sama dengan harga server. Harga nol dan status layanan nonaktif terlihat jelas. Perubahan harga saat penawaran terbuka menuntut pembaruan rincian sebelum pembayaran; saldo tidak dipotong oleh pratinjau.

Perintah tambahan: `npm run test:prayer-ui`. Empat kelompok pemeriksaannya mencakup permintaan GPS hanya setelah klik, pembulatan koordinat, penyimpanan Jakarta ketika GPS gagal, error yang tidak menyatakan sukses palsu, respons pengguna lama yang dibatalkan, logout/401, jam server/label zona, serta kesiapan manual yang menunggu `readyIds`. Timer browser yang mencapai nol tidak membuka game sendiri; token baru menghapus kesiapan lokal.

Tes DOM ini tidak mengukur tata letak CSS, gambar WebGL, atau pengalaman sentuh browser.

## Antarmuka musik dan loading

Perintah: `npm run test:media-ui`. Delapan kelompok skenario memakai komponen React sebenarnya dan LinkeDOM, dengan batas HTTP/XHR/audio terkontrol:

- Musik dimulai lewat gestur, mengikuti mute/pause/visibility, mempertahankan satu sumber audio, dan menolak promise pemutaran terlambat setelah berhenti.
- Unggahan mengirim File asli beserta kredensial/CSRF; progress, abort, serta error diperiksa.
- Admin mengunggah, mempratinjau, memilih, menyimpan, mengosongkan, dan menghapus media. Konflik versi tidak menimpa pengaturan admin lain.
- Respons polling dari identitas/sesi lama dibuang dan polling tidak memulai ulang lagu yang sama.
- Host langsung memperoleh loading; seluruh peserta melihat kesiapan nyata; angka semua siap belum menutup overlay sebelum countdown resmi server.
- Timeout lokal tidak membuka game sendiri; pembatalan, disconnect, token baru, dan prioritas salat tetap mengikuti server.
- Iframe yang sama tetap mounted/terlihat saat loading dan hasil, tanpa `stopRace()` yang menghilangkan rollout.
- Fokus keyboard masuk ke game sekali setelah loading ditutup; snapshot berulang tidak mengambil fokus lagi.

Pemutaran melalui speaker, kebijakan autoplay pada browser sasaran, visual CSS, dan audio decoding browser belum diuji secara manual. Validasi isi media server diuji terpisah dengan parser MP3 dan sharp.

## Pemeriksaan visual geometri kendaraan baru

Tujuh model tambahan dirender dengan **Blender 4.3.2, Cycles CPU** untuk meninjau bentuk bodi, bukaan roda, lampu, kaca, gril, aero, dan material. Temuan pada bentuk bumper, posisi lampu, sirip Batmobile, serta ruang warna material diperbaiki sebelum publikasi aset. Model merupakan rekonstruksi berdasarkan referensi, bukan aset pabrikan atau scan.

Render ini memeriksa geometri/material pada mesin render offline. Ia tidak membuktikan tampilan shader Three.js, kinerja GPU, atau frame rate gameplay browser. Aset delapan mobil sebelumnya tetap diverifikasi byte-identical melalui hash.

## Server pengembangan

Perintah: `npm run test:dev`. Pengujian memakai PostgreSQL native dan socket sungguhan untuk memastikan HMR Vite dan Colyseus dapat berbagi port tanpa menyelesaikan dua handshake pada koneksi yang sama. Koneksi HMR, ping Vite, dua peserta ruang, health HTTP, serta penutupan seluruh listener lulus. Perbaikan routing upgrade dibatasi pada mode pengembangan yang menyajikan klien.

## Hal yang belum diuji pada lingkungan tujuan

- Menjalankan image Docker dan proxy Caddy: konfigurasi tersedia dan sintaks diperiksa, tetapi tidak ada Docker daemon dalam lingkungan pengembangan ini.
- DNS, sertifikat TLS publik, firewall server tujuan, dan akses WebSocket dari jaringan internet.
- Beban banyak ruang bersamaan, pemulihan bencana, dan restorasi backup pada infrastruktur operator.
- Gameplay manusia pada browser/GPU desktop dan ponsel yang berbeda.

File `.env`, database sementara, kata sandi, token sesi, dan modul dependensi lokal tidak disertakan dalam paket distribusi.
