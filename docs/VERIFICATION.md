# Verifikasi implementasi UVelocity

Tanggal verifikasi: **20 November 2026**. Lingkungan pengujian: Linux, Node.js **24.22.3**, PostgreSQL native **18.7**, TypeScript, SDK Colyseus **0.18.10**, serta Three.js **r128** untuk geometri renderer.

Dokumen ini membedakan hasil pengujian otomatis dari hal yang masih perlu dicoba pada browser dan server tujuan. Tidak ada klaim bahwa aplikasi telah dipasang pada domain publik.

## Ringkasan hasil

| Pemeriksaan | Hasil aktual | Cakupan |
| --- | --- | --- |
| TypeScript seluruh proyek | Lulus | Klien React, kontrak bersama, backend, skrip, dan tes |
| Build produksi | Lulus | Bundle React/Vite dan keluaran Node.js |
| Simulasi, protokol, dan klien | **22/22 lulus** | SDK WebSocket nyata, shared physics, prediction, reconnect, dan lifecycle renderer |
| Backend PostgreSQL | **14/14 lulus** | Database native, migrasi, autentikasi, pembelian, saldo, tuning, hasil, dan audit |
| Integrasi seluruh adapter + aset statis | **9/9 bagian lulus** | Server aplikasi sebenarnya, HTTP, cookie, PostgreSQL, SDK Colyseus, dan serving produksi |
| Renderer dan bengkel | Lulus 6 kelompok pemeriksaan | Identitas aset, ruang bengkel, 8 × 3 paket roda, preview, lifecycle online, dan tiga dunia; tanpa WebGL GPU |
| Server pengembangan | Lulus | HTTP, socket HMR Vite, vite-ping, dan dua klien Colyseus pada satu port; shutdown bersih |
| Konfigurasi pemasangan | Lulus pemeriksaan lokal | Setup untuk localhost/LAN/HTTPS, rahasia acak, perlindungan file yang sudah ada, dan sintaks YAML |

Build memiliki peringatan ukuran chunk JavaScript utama sekitar 571 kB sebelum gzip. Build tetap berhasil; angka itu bukan pengukuran waktu muat atau frame rate perangkat.

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

Pengujian ini membuktikan perilaku logika dan protokol pada kondisi tes. Ini bukan benchmark banyak ruang serentak, pengalaman internet lintas wilayah, atau pengukuran 15 perangkat dengan GPU nyata.

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
10. Warna pelek bertahan pada sesi berikutnya dan tidak melewati pemeriksaan kepemilikan.
11. Aturan performa yang sudah dipublikasikan tidak diubah; balapan lama tetap memakai versi awalnya.
12. Settlement bersamaan menghasilkan satu hadiah; DNF menghasilkan nol; replay dengan hasil yang berbeda ditolak.
13. Saldo setiap akun yang diuji cocok dengan jumlah ledger-nya.
14. Query histori dibatasi dan akses admin ditolak oleh server untuk pemain biasa.

## Integrasi aplikasi yang sebenarnya

Perintah setelah build:

```bash
INTEGRATION_STATIC=1 node tests/with-postgres.mjs tests/integration.ts
```

Di PowerShell, set `$env:INTEGRATION_STATIC='1'` sebelum menjalankan `npm run test:integration`. `npm run test:integration` tanpa flag menjalankan delapan bagian layanan dan jaringan; flag menambahkan pemeriksaan aset statis sebagai bagian kesembilan.

Tes memakai `createApplication()` dari server yang sama dengan aplikasi produksi, PostgreSQL native, request HTTP sebenarnya, dan klien Colyseus sebenarnya. Cakupannya:

- Register/login, perubahan cookie sesi, profil, dan kepemilikan awal.
- Pembelian pelek serta penyimpanan warna pelek lewat HTTP.
- Admin dibuat secara eksplisit untuk tes; topup, harga, tuning, dan hadiah diterbitkan lewat API admin.
- Lookup kode privat, ticket dari cookie akun, join dua klien, readiness, start host, dan pergerakan melalui input.
- Publikasi tuning saat balapan berjalan tidak mengubah versi balapan tersebut. Balapan berikutnya memperoleh versi baru.
- Balapan dengan batas waktu **3,5 detik** berakhir dan hasil DNF tersimpan di PostgreSQL.
- Logout mencabut akses HTTP, ticket, socket aktif, dan hak reconnect.
- HTML React, iframe game, logo, dan delapan GLB dilayani dari build produksi. Header GLB diperiksa melalui request range. Inline event handler yang bertentangan dengan CSP tidak ada pada HTML game.

**Batas penting:** alur akhir tes integrasi sengaja menghasilkan DNF agar singkat dan terukur. Pengujian hadiah finish positif dan idempotency dilakukan pada suite PostgreSQL; keberhasilan menyelesaikan lintasan diperiksa pada suite fisika. Tidak ada klaim satu tes browser end-to-end telah mengemudi sampai menang dan menerima hadiah.

## Renderer, bengkel, dan roda

Perintah: `npm run test:renderer`.

Harness portabel memuat berkas yang disertakan dalam proyek, memakai Three.js, DOM LinkeDOM, serta Canvas 2D native untuk membuat tekstur. Daftar detail serta batasnya ada di [GRAPHICS.md](GRAPHICS.md).

Pemeriksaan meliputi SHA-256 delapan GLB dan modul lingkungan yang dipertahankan; geometri/material bengkel yang valid; area servis tengah yang bebas; delapan kendaraan dikombinasikan dengan tiga paket roda dan pemulihan roda asli; kamera showroom; kualitas dan suasana; barrier model; rendering dari snapshot; input; mute; exit yang menunggu konfirmasi aplikasi; pencegahan perhitungan lap/hasil lokal; dan pergantian ketiga sirkuit.

`WebGLRenderer` serta `PMREMGenerator` diganti dengan pencatat keadaan pada harness. Hasilnya tidak memverifikasi kompilasi shader oleh driver, gambar akhir refleksi/bayangan, antialiasing, audio yang benar-benar terdengar, FPS, atau sentuhan pada perangkat nyata. Bagian tersebut tetap perlu ditinjau pada browser sasaran.

## Server pengembangan

Perintah: `npm run test:dev`. Pengujian memakai PostgreSQL native dan socket sungguhan untuk memastikan HMR Vite dan Colyseus dapat berbagi port tanpa menyelesaikan dua handshake pada koneksi yang sama. Koneksi HMR, ping Vite, dua peserta ruang, health HTTP, serta penutupan seluruh listener lulus. Perbaikan routing upgrade dibatasi pada mode pengembangan yang menyajikan klien.

## Hal yang belum diuji pada lingkungan tujuan

- Menjalankan image Docker dan proxy Caddy: konfigurasi tersedia dan sintaks diperiksa, tetapi tidak ada Docker daemon dalam lingkungan pengembangan ini.
- DNS, sertifikat TLS publik, firewall server tujuan, dan akses WebSocket dari jaringan internet.
- Beban banyak ruang bersamaan, pemulihan bencana, dan restorasi backup pada infrastruktur operator.
- Gameplay manusia pada browser/GPU desktop dan ponsel yang berbeda.

File `.env`, database sementara, kata sandi, token sesi, dan modul dependensi lokal tidak disertakan dalam paket distribusi.
