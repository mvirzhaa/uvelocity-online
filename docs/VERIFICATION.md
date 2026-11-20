# Verifikasi implementasi UVelocity

Tanggal verifikasi: **20 November 2026**. Lingkungan pengujian: Linux, Node.js **24.22.3**, PostgreSQL native **18.7**, TypeScript, SDK Colyseus **0.18.10**, serta Three.js **r128** untuk geometri renderer.

Dokumen ini membedakan hasil pengujian otomatis dari hal yang masih perlu dicoba pada browser dan server tujuan. Tidak ada klaim bahwa aplikasi telah dipasang pada domain publik.

## Ringkasan hasil

| Pemeriksaan | Hasil aktual | Cakupan |
| --- | --- | --- |
| TypeScript seluruh proyek | Lulus | Klien React, kontrak bersama, backend, skrip, dan tes |
| Build produksi | Lulus | Bundle React/Vite dan keluaran Node.js |
| Simulasi, protokol, dan klien | **48/48 lulus** | SDK WebSocket nyata, shared physics, prediction, reconnect, dan lifecycle renderer |
| Backend PostgreSQL | **33/33 lulus** | Database native, migrasi, autentikasi, pembelian, saldo, tuning, hasil, audit, serta lokasi/window salat |
| Integrasi seluruh adapter + aset statis | **9/9 bagian lulus** | Server aplikasi sebenarnya, HTTP, cookie, PostgreSQL, SDK Colyseus, dan serving produksi |
| Renderer dan bengkel | **Lulus, tanpa warning/error dalam harness** | Identitas 8 aset lama, 15 kendaraan, roda/striping, tiga dunia, loading barrier, serta freeze/resume; tanpa WebGL GPU |
| Interaksi React aplikasi | **7/7 skenario lulus** | Transaksi bengkel/admin, status pemuatan arena, serta iframe yang tetap mounted dan kontrol latar inert ketika jeda |
| Antarmuka lokasi/jeda salat | **4/4 kelompok lulus** | GPS eksplisit/cadangan, pembatalan permintaan lama, jam server, persetujuan ruang dan token |
| Server pengembangan | Lulus | HTTP, socket HMR Vite, vite-ping, dan dua klien Colyseus pada satu port; shutdown bersih |
| Konfigurasi pemasangan | Lulus pemeriksaan lokal | Setup untuk localhost/LAN/HTTPS, rahasia acak, perlindungan file yang sudah ada, dan sintaks YAML |

Build memiliki peringatan ukuran chunk JavaScript utama di atas batas peringatan Vite sebelum gzip. Build tetap berhasil; angka itu bukan pengukuran waktu muat atau frame rate perangkat.

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
- **15 pembalap menyelesaikan setiap satu dari tiga lintasan** melalui simulasi bersama. Ini merupakan tes fisika dengan pengemudi otomatis untuk slot manusia, bukan rekaman 15 orang memainkan browser.
- Start renderer yang dibatalkan, pemuatan model gagal, tombol unready selama pemuatan, socket setelah dispose, dan token reconnect yang diputar ulang diperiksa.
- Pemulihan pilihan lobi setelah kunci admin diuji: kode error dipertahankan, klien menunggu fase lobi, pilihan resmi yang berbeda dikirim sekali, balapan aktif tidak diubah, dan respons lama tidak dipasang pada ruang/sesi baru.

Pengujian ini membuktikan perilaku logika dan protokol pada kondisi tes. Ini bukan benchmark banyak ruang serentak, pengalaman internet lintas wilayah, atau pengukuran 15 perangkat dengan GPU nyata.

## Jeda salat dan kesiapan ulang

Pengujian PostgreSQL mencakup kelima batas masuk/keluar window pribadi tepat 15 menit; ihtiyat 2 menit tanpa menggandakan penyesuaian Zuhur; 44 pilihan kota, WIB/WITA/WIT termasuk Jayapura, dan pergantian tanggal setempat. Dua kota mendapat jadwal independen. Koordinat dibulatkan/divalidasi, waktu atau zona yang dikirim klien ditolak, dan fallback polar menampilkan alasan Jakarta.

Perubahan lokasi pada permintaan pertama sesudah azan tetap menangkap window lokasi lama. Membuat ulang layanan, login ulang, serta 12 perubahan/pembacaan bersamaan tidak dapat memperpendek window aktif. HTTP423 menutup gameplay/transaksi/admin, sementara autentikasi, profil, dan koreksi lokasi tetap tersedia; saldo, inventory, dan loadout tidak berubah oleh jeda.

Tes realtime memakai SDK Colyseus sungguhan dan jam server yang diinjeksi, sehingga 15 menit dapat dilompati deterministik tanpa mengurangi durasi produksi. Pemeriksaan meliputi:

- Seluruh manusia, bot, posisi, lap, dan waktu simulasi tetap beku; ruang lain tetap berjalan.
- Waktu minimum 15 menit sejak pembekuan dan persetujuan eksplisit seluruh peserta sebelum hitungan 3 detik bersama.
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
15. Upgrade dari database versi lima migrasi dengan akun lama, pembelian, warna tersimpan, dan tuning admin mempertahankan data setelah migrasi 006/007/008.
16. Penawaran tidak mendebit saldo. Apply bersamaan dan retry menyimpan satu debit serta satu tampilan; SQL gagal memulihkan seluruh perubahan.
17. Kedaluwarsa, perubahan harga/layanan, versi tampilan yang berubah, dan saldo kurang menolak pemasangan tanpa debit parsial.
18. Cat, pelek, desain striping, serta warna striping disimpan per kendaraan permanen. No-op dan perpindahan ke tampilan tersimpan tidak dibayar ulang.
19. Buka/kunci admin tidak memberi atau mencabut inventory. Pembeli permanen tetap dapat bermain setelah kendaraan dikunci.
20. Kendaraan gratis yang dikunci ditolak untuk lobi/start baru, termasuk ketika pemain terdampak bukan host; kendaraan pada pertandingan berjalan tetap memakai pilihan yang dibekukan.

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
- HTML React, iframe game, logo, dan kelima belas GLB dilayani dari build produksi. Header GLB diperiksa melalui request range. Inline event handler yang bertentangan dengan CSP tidak ada pada HTML game.

**Batas penting:** alur akhir tes integrasi sengaja menghasilkan DNF agar singkat dan terukur. Pengujian hadiah finish positif dan idempotency dilakukan pada suite PostgreSQL; keberhasilan menyelesaikan lintasan diperiksa pada suite fisika. Tidak ada klaim satu tes browser end-to-end telah mengemudi sampai menang dan menerima hadiah.

## Renderer, bengkel, dan roda

Perintah: `npm run test:renderer`.

Harness portabel memuat berkas yang disertakan dalam proyek, memakai Three.js, DOM LinkeDOM, serta Canvas 2D native untuk membuat tekstur. Daftar detail serta batasnya ada di [GRAPHICS.md](GRAPHICS.md).

Pemeriksaan meliputi SHA-256 delapan GLB dan modul lingkungan yang dipertahankan; geometri/material bengkel yang valid; area servis tengah yang bebas; kelima belas kendaraan dikombinasikan dengan tiga paket roda dan pemulihan roda asli; lima desain striping mengikuti triangle permukaan cat dengan kaca/lampu/ban tetap terpisah; kamera showroom; kualitas dan suasana; barrier model; rendering dari snapshot; input; mute; exit yang menunggu konfirmasi aplikasi; pencegahan perhitungan lap/hasil lokal; dan pergantian ketiga sirkuit. Fase jeda mempertahankan arena, menahan gerak roda/efek/input, serta tetap memenuhi barrier frame untuk kesiapan melanjutkan.

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

Perintah tambahan: `npm run test:prayer-ui`. Empat kelompok pemeriksaannya mencakup permintaan GPS hanya setelah klik, pembulatan koordinat, penyimpanan Jakarta ketika GPS gagal, error yang tidak menyatakan sukses palsu, respons pengguna lama yang dibatalkan, logout/401, jam server/label zona, serta kesiapan manual yang menunggu `readyIds`. Timer browser yang mencapai nol tidak membuka game sendiri; token baru menghapus kesiapan lokal.

Tes DOM ini tidak mengukur tata letak CSS, gambar WebGL, atau pengalaman sentuh browser.

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
