# UVelocity

Game balap 3D dengan garasi bengkel, akun pembalap, multiplayer realtime, ekonomi rupiah virtual, pembelian mobil dan pelek, cat/striping berbayar, pengaturan akses kendaraan oleh administrator, serta jeda salat bersama berdasarkan lokasi pemain.

**Identitas:** splash pertama memakai logo Universitas Ibn Khaldun Bogor yang diberikan pengguna dengan teks **`create by civitas UIKA`**. Setelah itu tampil logo UVelocity tersendiri. Aset mobil dan lingkungan dari versi sebelumnya tetap digunakan.

## Mulai dalam beberapa langkah

Paket ini berisi aplikasi lengkap yang perlu dijalankan pada server. Membuka `client/index.html` langsung dari berkas tidak menjalankan akun, database, atau multiplayer.

### Cara utama: Docker Compose

Siapkan Docker dengan Compose dan Node.js 24 untuk menjalankan pembuat konfigurasi. Semua perintah dijalankan dari folder `uvelocity-online` hasil ekstraksi.

```bash
node scripts/setup.mjs
docker compose up --build -d
docker compose exec app node dist/server/scripts/admin-create.js
```

Perintah pertama membuat `.env` dengan kata sandi PostgreSQL acak. Konfigurasi yang sudah ada tidak ditimpa. Perintah kedua membangun aplikasi, menjalankan PostgreSQL, dan menerapkan migrasi database secara otomatis. Perintah ketiga meminta email, nama, dan kata sandi administrator; masukan kata sandi disembunyikan. Tidak ada akun admin atau kata sandi bawaan.

Buka **http://localhost:3000**. Daftar sebagai pembalap atau masuk dengan akun administrator yang baru dibuat.

```bash
docker compose ps
docker compose logs --tail=100 app
docker compose stop
docker compose start
```

`stop` menghentikan layanan tanpa menghapus data. Database memakai volume `postgres_data`. Jangan menghapus volume jika ingin mempertahankan akun, koleksi, dan saldo.

### Bermain dengan teman pada jaringan yang sama

Pada pemasangan baru, ganti contoh alamat berikut dengan alamat IP komputer server yang dapat dijangkau teman:

```bash
node scripts/setup.mjs --origin http://192.168.1.10:3000
docker compose up --build -d
```

Teman membuka **alamat yang sama** pada browser masing-masing, membuat akun sendiri, lalu memasukkan kode ruang yang dibuat host. Izinkan koneksi TCP port 3000 pada firewall server. Akses melalui alamat yang berbeda dari `ALLOWED_ORIGINS` akan ditolak untuk operasi akun dan transaksi.

Jika `.env` sudah ada, ubah `APP_ORIGIN`, `ALLOWED_ORIGINS`, dan `BIND_ADDRESS=0.0.0.0` langsung, kemudian jalankan `docker compose up -d --force-recreate app`. Jangan membuat database baru hanya untuk mengganti alamat. HTTP lokal digunakan untuk pengujian LAN; pemasangan internet menggunakan HTTPS di bagian berikut.

### Pemasangan internet dengan HTTPS

Siapkan server yang dapat menjalankan container, domain yang diarahkan ke server tersebut, serta akses masuk port 80 dan 443. Pada pemasangan baru:

```bash
node scripts/setup.mjs --origin https://balap.example.com
docker compose -f compose.yaml -f compose.https.yaml up --build -d
docker compose exec app node dist/server/scripts/admin-create.js
```

Ganti domain contoh dengan domain milik Anda. Berkas tambahan menjalankan Caddy sebagai proxy HTTPS dan WebSocket. Konfigurasi hasil setup mengaktifkan `COOKIE_SECURE=true`, `TRUST_PROXY=1`, origin yang tepat, dan membatasi port langsung aplikasi ke loopback. Database tidak membuka port ke internet.

Untuk instalasi yang sudah berisi data, ubah `.env` tanpa mengganti `POSTGRES_PASSWORD` atau volume: `APP_ORIGIN=https://domain-anda`, `ALLOWED_ORIGINS=https://domain-anda`, `PUBLIC_HOST=domain-anda`, `COOKIE_SECURE=true`, `TRUST_PROXY=1`, `BIND_ADDRESS=127.0.0.1`. Jalankan kembali perintah Compose dengan kedua berkas tersebut.

Paket ini belum dipasang pada domain publik. Domain, DNS, server, sertifikat yang terbit, serta konektivitas internet perlu diverifikasi pada lingkungan tujuan. Docker/Caddy disertakan sebagai konfigurasi deployment; runtime Docker tidak tersedia dalam lingkungan pengembangan tempat paket ini diuji.

## Pengembangan tanpa Docker

Gunakan Node.js 24 dan PostgreSQL 18 dengan database kosong serta pengguna pemilik database. Versi minimum Node dalam manifest adalah 22.12.0; verifikasi paket ini dilakukan dengan Node 24.22.3 dan PostgreSQL 18.7.

```bash
npm ci
node scripts/setup.mjs
```

Sesuaikan `DATABASE_URL` dalam `.env` dengan PostgreSQL yang telah Anda siapkan. Pertahankan `APP_ORIGIN=http://localhost:3000`, `ALLOWED_ORIGINS=http://localhost:3000`, dan `COOKIE_SECURE=false` untuk pengembangan lokal.

```bash
npm run db:migrate
npm run admin:create
npm run dev
```

Server pengembangan menyediakan React, API, aset 3D, dan WebSocket pada origin yang sama. `npm run dev` memakai mode pengembangan meskipun berkas `.env` dibuat untuk produksi.

Untuk build produksi tanpa Docker:

```bash
npm run build
npm start
```

Pastikan `NODE_ENV=production` di lingkungan proses. Jika menggunakan port native selain 3000, sesuaikan `PORT`, `APP_ORIGIN`, dan `ALLOWED_ORIGINS` bersama-sama. `PUBLIC_PORT` hanya mengatur pemetaan port Docker.

## Alur pemain

1. **Daftar / masuk.** Akun baru memperoleh Subaru BRZ, roda standar, dan Rp25.000 kredit game satu kali.
2. **Garasi.** Putar mobil dengan menyeret, perbesar dengan scroll, pilih sudut depan/samping/belakang, dan dengarkan profil mesin. Garasi memakai lingkungan bengkel 3D.
3. **Showroom.** Pratinjau 15 kendaraan. Mobil berlabel **Milik permanen** selalu bisa dipakai; **Akses gratis admin** bisa dipakai selama dibuka. **Beli akses permanen** membeli kendaraan satu kali dengan saldo akun, termasuk ketika sedang dibuka gratis.
4. **Bengkel.** Pilih kendaraan yang dimiliki, paket pelek, warna bodi/pelek, lapisan metallic/gloss/matte, dan salah satu pola striping. Pratinjau tidak memotong saldo. Tekan **Tinjau biaya & pasang**, periksa rincian, lalu **Bayar & pasang**. Memilih kembali tampilan yang tersimpan gratis.
5. **Balapan.** Buat ruang atau masukkan kode teman. Pilih sirkuit, jumlah lap, slot manusia, bot, kesulitan, dan kontak antarmobil. Semua pemain menekan **Saya siap balapan**, lalu host memulai persiapan. Status **Memuat arena / Arena siap** menunjukkan perangkat masing-masing. Hitungan 3–2–1 baru berjalan setelah semua arena dan model siap, menggunakan waktu start yang sama dari server.
6. **Lokasi & jeda salat.** Atur GPS atau lokasi manual dari Profil. Jika waktu salat seorang peserta masuk, seluruh ruang membeku minimal 15 menit. Setelah itu semua peserta yang masih berada di ruang menekan **Siap melanjutkan**, lalu menunggu hitungan bersama. Jakarta digunakan jika lokasi tidak diperoleh.
7. **Finish.** Server menentukan lap, posisi, hasil, dan hadiah. Layar hasil menampilkan hadiah akun sendiri. Transaksi dapat diperiksa di profil.

Semua peserta harus berada pada layanan UVelocity yang sama. Kode ruang tidak menghubungkan dua server instalasi yang terpisah.

### Kendaraan dan sirkuit

| Kendaraan | Harga awal kredit game |
| --- | ---: |
| Subaru BRZ | Kendaraan awal |
| Kaze Rally | Rp180.000 |
| Apex GT | Rp220.000 |
| Cinder V8 | Rp350.000 |
| Nissan Skyline R34 GT-R | Rp650.000 |
| Veloce R | Rp900.000 |
| Lamborghini Aventador | Rp1.400.000 |
| Bugatti Veyron Polisi 77 | Rp1.800.000 |
| BMW M Hybrid V8 | Rp1.650.000 |
| BMW M4 GT4 (F82) | Rp620.000 |
| Mercedes-AMG GT4 | Rp780.000 |
| Mercedes-Benz SLS AMG GT3 | Rp1.050.000 |
| Batmobile 1989 | Rp1.300.000 |
| Koenigsegg Jesko Absolut | Rp2.400.000 |
| Hennessey Venom F5 | Rp2.200.000 |

Tiga sirkuit: **Neon City**, **Azure Coast**, dan **Frostpeak Pass**. Masing-masing mempertahankan geometri lintasan, lingkungan kota/pantai/pegunungan es, serta pilihan suasana senja dan malam. Detail grafis dapat dipilih Ringan, Seimbang, atau Tinggi.

Harga dapat berbeda jika administrator mengubah katalog. Tujuh model tambahan merupakan rekonstruksi 3D khusus berdasarkan referensi pengguna; bukan mesh pabrikan, hasil scan, atau salinan aset game lain. BMW M4 memakai bentuk F82, Batmobile mengikuti versi 1989, Jesko Absolut memakai dua sirip ekor tanpa sayap Attack, dan Venom F5 memakai sayap sesuai foto referensi. Delapan aset kendaraan sebelumnya dipertahankan tanpa perubahan berkas GLB. Angka performa adalah parameter simulasi arcade, bukan klaim spesifikasi mobil asli. Varian Polisi 77 adalah desain fiktif untuk game.

### Batas ruang

- 1–20 lap.
- 1–15 slot pemain manusia.
- 0–14 bot.
- Jumlah slot manusia + bot maksimum **15 peserta total**. Untuk memainkan 14 bot, pilih satu slot manusia. Untuk empat teman dan enam bot, gunakan empat slot manusia serta enam bot.
- Ruang bersifat pribadi dan ditemukan melalui kode undangan.
- Mode kontak: tabrakan aktif atau tanpa kontak.
- Siap di lobi dan siap di arena adalah dua tahap terpisah. Server menunggu pengakuan pemuatan model, pembangunan grid, dan frame arena yang sudah dirender oleh setiap pemain. Selama menunggu, mobil diam, waktu balapan nol, dan belum ada hitungan mundur.
- Pemuatan gagal, pemain terputus, membatalkan kesiapan, atau melewati batas waktu persiapan 45 detik mengembalikan ruang ke lobi. Peserta memilih Siap kembali; server tidak memulai dengan pemain yang masih tertinggal.
- Menu biasa tidak menjeda balapan pemain lain. Kontrol lokal dilepas ketika menu terbuka. Jeda salat adalah penghentian bersama yang diputuskan server untuk seluruh ruang.
- Sambungan yang terputus sementara mencoba tersambung kembali; bila kesempatan reconnect habis atau pemain keluar sebelum finish, hasilnya DNF.

### Jeda salat bersama

Waktu **Subuh, Zuhur, Asar, Magrib, dan Isya** mengikuti lokasi masing-masing akun. Pada Profil, pemain dapat menekan tombol lokasi perangkat, memilih salah satu dari 44 kota secara manual. Jika GPS ditolak/tidak tersedia, gunakan Jakarta sebagai cadangan. Izin GPS diminta ketika tombol ditekan; tidak ada pelacakan lokasi terus-menerus. HTTPS diperlukan agar Geolocation berfungsi di pemasangan internet; HTTP LAN tetap mendukung pemilihan kota secara manual.

Saat waktu salat salah satu anggota masuk, **semua pemain dan bot dalam ruang itu dibekukan**. Posisi, waktu lap, dan waktu balapan tetap. Adegan 3D tetap dimuat. Jeda ruang berlangsung sekurang-kurangnya 15 menit sejak server membekukan permainan; jadwal anggota lain yang masuk kemudian memperpanjang batas minimum agar pemicu baru juga mendapat 15 menit.

Setelah batas minimum tercapai, setiap peserta manusia yang masih berada di ruang harus menekan **Siap melanjutkan**. Host tidak bisa melewati peserta yang belum siap. Semua siap memulai hitungan mundur bersama selama 3 detik; kendaraan tetap diam sampai server membuka balapan. Reconnect mengharuskan persetujuan ulang; peserta yang sudah keluar atau habis masa reconnect dikeluarkan dari daftar kesiapan. Tidak ada kick atau logout otomatis karena salat.

Jika jeda datang saat persiapan arena, upaya start tersebut dibatalkan dengan aman. Setelah semua menyatakan siap melanjutkan, pemain kembali ke lobi dan menjalani pemeriksaan arena seluruh perangkat lagi. Lokasi baru atau login ulang tidak mempersingkat jeda aktif.

Jadwal dihitung lokal di server dengan Adhan, sudut 20°/18°, Asar Shafi, dan ihtiyat 2 menit. Antarmuka menyebutnya **perhitungan lokasi**, bukan umpan jadwal resmi Kemenag. Koordinat GPS disimpan dengan pembulatan dua desimal dan tidak dibagikan ke anggota ruang. Batas jeda serta zona waktu ditentukan server. Penjelasan lengkap tersedia di [docs/PRAYER.md](docs/PRAYER.md).

### Kontrol

| Tombol | Fungsi |
| --- | --- |
| W / panah atas | Gas |
| S / panah bawah | Rem, kemudian mundur |
| A dan D / panah kiri dan kanan | Kemudi |
| Shift / Spasi | Nitro |
| C | Ganti kamera balapan |
| R | Minta reset kendaraan |
| Esc / P | Menu dan pelepasan kontrol lokal |
| M | Suara |

Kontrol sentuh tersedia untuk layar kecil. Dukungan perangkat dan performa grafis perlu dicoba pada perangkat sasaran sebelum digunakan untuk acara atau turnamen.

## Kredit rupiah virtual, pelek, cat, dan striping

Rp di dalam aplikasi adalah **kredit permainan**. Tidak ada pembayaran uang nyata, gateway pembayaran, tarik tunai, atau konversi saldo menjadi uang nyata.

Aturan hadiah awal: Rp10.000 untuk finish, Rp1.000 per lap, dan bonus posisi pertama/kedua/ketiga Rp15.000/Rp8.000/Rp4.000. Batas awal Rp50.000 per balapan; finish terlalu cepat di bawah batas aturan tidak mendapat hadiah. DNF bernilai nol. Administrator dapat menerbitkan aturan baru. Balapan yang sudah berjalan tetap memakai aturan yang dikunci saat pertandingan dibuat.

Empat pilihan roda: standar, Six-Spoke (Rp20.000), Multi-Spoke (Rp35.000), dan Mesh (Rp50.000). Paket yang dibeli dapat dipakai pada kendaraan yang dimiliki. Paket roda disesuaikan terhadap ukuran roda masing-masing mobil; roda standar asli dapat dipulihkan. Warna pelek tersedia untuk paket custom, sementara roda standar mempertahankan material model aslinya.

Modifikasi ini bersifat kosmetik. Setiap kendaraan yang dimiliki menyimpan satu konfigurasi tersendiri: warna bodi, lapisan, pelek, warna pelek, desain striping, dan warna striping. Berpindah mobil memulihkan tampilannya; tidak membayar ulang untuk memakai tampilan yang sudah terpasang. Belum tersedia beberapa preset untuk satu kendaraan, upgrade mesin, suspensi, atau body kit.

### Biaya bengkel awal

| Layanan | Biaya kredit game |
| --- | ---: |
| Perubahan warna bodi dan/atau lapisan dalam satu pemasangan | Rp10.000 |
| Perubahan warna pelek custom | Rp5.000 |
| Twin Racing | Rp15.000 |
| Offset Sport | Rp18.000 |
| Side Sweep | Rp12.000 |
| Circuit Lines | Rp20.000 |
| Heritage Bands | Rp22.000 |
| Melepas striping yang sedang terpasang | Rp5.000 |

Pemasangan striping, penggantian desain, atau penggantian warna striping dikenakan biaya layanan desain yang dipilih. Melepas striping hanya dikenakan biaya jika sebelumnya memang terpasang. Memilih warna/desain yang sama tidak dikenakan biaya. Harga akhir berasal dari penawaran server dan dapat diubah admin. Penawaran berlaku 10 menit; perubahan harga, layanan, atau tampilan oleh sesi lain memerlukan rincian baru sebelum membayar.

Pembayaran cat dan striping hanya berlaku pada mobil yang dimiliki permanen. Mobil gratis sementara memakai tampilan bawaan; pemain tetap dapat memakai paket pelek yang sudah dimiliki. Saldo tidak dipotong oleh slider warna, kartu pratinjau, atau perpindahan mobil. Kredit, konfigurasi, dan riwayat transaksi disimpan bersama dalam satu transaksi PostgreSQL; retry memakai identitas yang sama.

### Aturan buka/kunci kendaraan

| Status kendaraan untuk pemain | Admin membuka | Admin mengunci kembali |
| --- | --- | --- |
| Sudah dibeli / diberikan sebagai kendaraan awal | Dapat dimainkan permanen | Tetap dapat dimainkan permanen |
| Belum dibeli | Dapat dimainkan selama akses gratis terbuka | Terkunci untuk pemilihan dan balapan baru |

Admin **membuka akses** tanpa memberikan kepemilikan. Pemain bisa membeli kendaraan yang sedang gratis agar memilikinya permanen. Pengaturan ketersediaan penjualan terpisah dari buka/kunci akses. Menghentikan penjualan tidak mengambil kepemilikan yang sudah dibeli.

Server memeriksa akses ketika menyimpan pilihan, bergabung ruang, mengubah pilihan di lobi, dan memulai balapan. Jika mobil gratis yang sedang aktif dikunci kembali, profil memilih kendaraan milik pemain sebagai pengganti. Balapan yang sudah dimulai mempertahankan kendaraan dan tampilannya hingga selesai.

## Administrator

Masuk melalui halaman login yang sama menggunakan akun admin. Menu **Admin** muncul berdasarkan peran yang divalidasi server.

- **Pemain & kredit:** cari nama/email/ID, pilih penerima, isi jumlah, alasan, dan referensi. Tinjau sebelum menambahkan saldo. Pengiriman ulang memakai identitas transaksi yang sama sehingga kredit tidak digandakan.
- **Performa mobil:** atur kecepatan maksimum, waktu 0–100, dan handling dalam rentang yang diizinkan. Publikasikan versi baru dengan alasan perubahan.
- **Harga & toko:** pilih kendaraan untuk membuka/mengunci akses gratis, mengatur harga pembelian permanen, dan mengaktifkan/menonaktifkan penjualan. Pilih jasa cat/striping untuk mengubah harga atau ketersediaan layanan. Setiap perubahan memerlukan alasan dan tercatat di audit. Kunci admin tidak mencabut kepemilikan permanen.
- **Hadiah balapan:** atur hadiah finish, per lap, podium, durasi minimum, dan batas hadiah.
- **Riwayat admin:** lihat operator, waktu, alasan, serta nilai sebelum/sesudah perubahan.

Pembuatan admin adalah tindakan operator di terminal, bukan pilihan pada formulir pendaftaran umum. CLI hanya membuat akun baru dan tidak diam-diam mempromosikan akun pemain yang sudah ada. Untuk otomasi privat, CLI juga menerima `ADMIN_EMAIL`, `ADMIN_DISPLAY_NAME`, dan `ADMIN_PASSWORD` melalui lingkungan proses; jangan memasukkannya ke repository atau membagikannya dalam tangkapan layar.

## Memperbarui pemasangan dari versi sebelumnya

Pertahankan `.env` dan volume/database yang sudah digunakan. Buat backup, ganti sumber aplikasi dengan paket ini, lalu jalankan `docker compose up --build -d` atau `npm ci`, `npm run db:migrate`, dan `npm run build` pada pemasangan native. Jangan membuat database baru atau menghapus volume.

Migrasi tambahan **006** menambahkan akses global, tampilan per kendaraan, serta penawaran/transaksi bengkel. Migrasi **007** menambahkan tujuh kendaraan dan versi aturan baru dengan mempertahankan tuning serta kebijakan hadiah admin sebelumnya. Migrasi **008** menambahkan lokasi dan window jeda salat pribadi yang persisten. Warna dan pelek aktif akun lama dipindahkan ke tampilan mobil terkait; akun, saldo, koleksi, ledger, dan versi aturan lama tetap dipertahankan. Pengujian upgrade menggunakan database berisi akun dan konfigurasi lama, bukan hanya database kosong.

## Membuat ulang model tambahan

GLB siap pakai sudah tersedia di paket; server produksi tidak perlu Blender. Sumber pembuat geometri disertakan:

```bash
node scripts/build-racecar-expansion.cjs --publish
node scripts/build-hypercar-expansion.cjs --publish
```

Skrip memakai Three.js yang dibundel dan menulis kembali tujuh GLB baru saja. `scripts/modeling-kit.cjs` memuat helper permukaan bodi, material, bukaan roda, hierarchy roda/kemudi, dan eksportir glTF. Catatan asal serta ukuran geometri permainan berada di metadata masing-masing model. Gambar pemeriksaan model, bila disertakan, dibuat dengan Blender Cycles CPU dan bukan tangkapan layar gameplay browser.

## Komponen teknis

- **Node.js + TypeScript + Express:** HTTP, autentikasi, toko, admin, dan penyajian klien.
- **Colyseus + WebSocket:** ruang multiplayer dan simulasi kendaraan di server. Klien mengirim kontrol; server menentukan posisi resmi, checkpoint, finish, dan hasil.
- **React:** login, profil, garasi, toko, ruang, dan admin.
- **Three.js r128 + GLTFLoader:** model dan dunia 3D yang dipertahankan dari game sebelumnya. Aset dimuat dari server sendiri, bukan CDN.
- **PostgreSQL:** akun, sesi, tiket balap, kepemilikan, konfigurasi, ledger saldo, hasil, versi aturan, audit, serta lokasi/jeda salat pribadi.
- **Adhan + geo-tz/all:** perhitungan jadwal dan penentuan zona waktu dari lokasi di server; tidak memerlukan panggilan API jadwal eksternal.

Autentikasi menggunakan cookie HttpOnly, hash scrypt, pemeriksaan Origin/CSRF, pembatasan permintaan, dan tiket balap sekali pakai yang terikat sesi. Saldo menggunakan integer besar dalam database. Pembelian, topup, dan hadiah memakai transaksi atomik serta pencegahan penggandaan. Data akun/saldo tidak bergantung pada `localStorage`; penyimpanan browser hanya dipakai untuk preferensi tampilan/suara dan token reconnect sementara.

Dokumentasi detail: [docs/API.md](docs/API.md), [docs/GRAPHICS.md](docs/GRAPHICS.md), [docs/PRAYER.md](docs/PRAYER.md), dan [docs/VERIFICATION.md](docs/VERIFICATION.md).

## Pengujian

```bash
npm ci
npm run typecheck
npm run build
npm test
npm run test:backend
npm run test:integration
npm run test:renderer
npm run test:ui
npm run test:prayer-ui
npm run test:dev
```

`npm test` menjalankan pengujian simulasi, jaringan Colyseus, serta sinkronisasi klien. Pengujian backend dan integrasi membuat PostgreSQL native sementara dengan paket dev `embedded-postgres`, lalu menghapus datanya setelah selesai. Database aplikasi yang sedang digunakan tidak dipakai oleh pembungkus tersebut. Pengujian renderer menggunakan geometri Three.js, DOM, dan Canvas native; ini bukan uji visual GPU pada browser.

Lihat laporan verifikasi untuk hasil aktual dan batas pengujian. Lingkungan ini tidak memiliki Docker daemon; image/container deployment belum dijalankan di sini. Sesi gameplay dengan manusia pada jaringan internet, sentuhan perangkat nyata, serta FPS lintas GPU masih memerlukan verifikasi setelah pemasangan.

## Operasional dan batas implementasi

Jalankan **satu proses server game** untuk versi ini. PostgreSQL menyimpan data persisten, sedangkan ruang dan simulasi pertandingan berjalan dalam memori server. Jika proses dimulai ulang, pertandingan yang belum selesai ditandai terhenti; saldo tidak dihitung dari klaim klien. Versi ini belum menyediakan pemulihan pertandingan setelah server restart, matchmaking lintas region, Redis presence, atau deployment beberapa node.

Backend dapat memvalidasi kontrol, kepemilikan, checkpoint, lap, urutan input, dan hasil server; ini bukan janji perlindungan menyeluruh terhadap semua bentuk cheating. Ukur kapasitas CPU, RAM, latency, dan jaringan pada server tujuan sebelum menaikkan jumlah ruang serentak.

Gunakan backup PostgreSQL untuk melindungi data. Contoh membuat backup dari Compose:

```bash
docker compose exec -T postgres pg_dump -U uvelocity -d uvelocity -Fc > uvelocity-backup.dump
```

Sesuaikan nama pengguna/database jika Anda menggantinya. Simpan backup di lokasi terpisah dan uji pemulihannya pada database terpisah sebelum dibutuhkan. Kata sandi, backup, serta `.env` tidak disertakan dalam paket distribusi.

Belum ada verifikasi email, reset kata sandi melalui email, login sosial, atau pembayaran otomatis. Jika lupa kata sandi, tidak ada tombol pemulihan palsu; penambahan alur pemulihan terverifikasi merupakan pekerjaan berikutnya.

### Pemecahan masalah

| Gejala | Pemeriksaan |
| --- | --- |
| GPS tidak tersedia pada alamat LAN | Gunakan pilihan kota manual atau pasang HTTPS. Lokasi cadangan adalah Jakarta. |
| Jeda salat sudah 15 menit tetapi belum lanjut | Periksa daftar kesiapan. Semua peserta yang masih berada di ruang harus menekan Siap melanjutkan. Pemicu salat baru dapat memperpanjang deadline. |
| Countdown start belum muncul | Periksa status Arena siap setiap pemain. Pemuatan gagal/batas 45 detik mengembalikan ruang ke lobi untuk mencoba ulang. |
| Login / pembelian ditolak karena origin | Cocokkan alamat browser dengan `APP_ORIGIN` dan `ALLOWED_ORIGINS`, termasuk skema dan port. |
| Login tidak bertahan pada HTTP lokal | Gunakan `COOKIE_SECURE=false` hanya untuk HTTP lokal; gunakan true untuk HTTPS. |
| Kode ruang tidak ditemukan | Periksa kedua pemain membuka instalasi/server yang sama; host mungkin sudah keluar atau ruang sudah ditutup. |
| Ruang kembali ke lobi ketika memuat arena | Pastikan semua tab game aktif/terlihat, aset dapat diunduh, dan semua pemain memuat ulang halaman setelah pembaruan server. Peserta yang gagal memuat diberi pesan; tekan Siap kembali setelah masalah selesai. |
| WebSocket gagal di hosting | Proxy harus meneruskan WebSocket dan trafik `/matchmake` ke proses Node yang sama. |
| Model 3D gagal dimuat | Periksa koneksi dan aset `/game/assets/cars/`; muat ulang. Pemain belum boleh siap jika model roster yang diperlukan gagal dimuat. |
| Grafis lambat | Aktifkan akselerasi grafis browser dan pilih kualitas Ringan; model tetap menggunakan aset yang sama. |
| Tidak ada menu Admin | Buat akun admin lewat CLI, kemudian masuk dengan akun tersebut. |
| Kredit tidak bertambah | Lihat hasil resmi, durasi minimum, status finish/DNF, serta riwayat transaksi. Topup ulang dengan referensi sama tidak menambah kredit lagi. |

## Kredit aset

[public/credits.html](public/credits.html) menyediakan kredit yang bisa dibuka dari bantuan dalam game. Atribusi model juga tersedia di [public/game/assets/CREDITS.txt](public/game/assets/CREDITS.txt); lisensi Three.js ada di [public/game/vendor/THREE-LICENSE.txt](public/game/vendor/THREE-LICENSE.txt). Metadata atribusi pada GLB dipertahankan. Suara mesin adalah sintesis khusus per kendaraan, bukan rekaman autentik kendaraan asli.

Referensi deployment: [image PostgreSQL resmi](https://hub.docker.com/_/postgres), [proxy Caddy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy), dan [transport WebSocket Colyseus](https://docs.colyseus.io/server/transport/ws).
