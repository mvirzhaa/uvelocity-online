# UVelocity

Game balap 3D dengan garasi bengkel, akun pembalap, multiplayer realtime, ekonomi rupiah virtual, pembelian mobil dan pelek, cat/striping berbayar, pengaturan akses kendaraan oleh administrator, serta jeda salat bersama berdasarkan lokasi pemain. Pembaruan **1.3.0** merapikan tampilan ponsel, kontrol sentuh, dan akses tombol utama tanpa scroll panjang; memperbarui bentuk 3D Koenigsegg Regera serta Hennessey Venom F5 sesuai referensi terbaru; dan menambahkan Isuzu Panther Grand Touring sebagai kendaraan ke-16. Fitur versi **1.2.0** tetap mencakup media garasi/loading dan foto kendaraan yang dikelola admin, kamera dashboard, koleksi Garasi khusus kendaraan milik pemain, navigasi Sebelumnya/Berikutnya, penyelesaian balapan tanpa menunggu bot, serta cat pelek bawaan dan tarif warna striping tersendiri yang dapat diatur admin.

**Identitas:** splash pertama memakai logo Universitas Ibn Khaldun Bogor dengan alpha transparan tanpa latar kotak-kotak, bersama logo **Teknik Informatika UIKA** yang diberikan pengguna. Teks **`create by civitas UIKA`** tetap ditampilkan. Setelah itu tampil logo UVelocity tersendiri. Aset mobil dan lingkungan dari versi sebelumnya tetap digunakan. Detail sumber logo ada di [docs/BRANDING.md](docs/BRANDING.md).

## Pembaruan 1.3.0

- **Aksi Garasi di atas:** tombol **Pakai mobil ini** dan **Masuk ke ruang balap** berada pada area judul **Garasi Anda**, dengan susunan yang membungkus pada layar sempit. Penggunaan konfigurasi tersimpan tidak dikenai biaya ulang; perubahan kosmetik tetap melalui **Tinjau biaya & pasang**.
- **Hasil pertandingan:** **Kembali ke garasi** berada di header hasil, sebelum statistik dan daftar peserta.
- **Arena HP:** arena memakai tinggi layar yang tersedia. Baris ruang/Menu mempunyai tempat tersendiri di atas arena. Speedometer serta peta diperkecil, dengan susunan khusus ketika HP diputar mendatar.
- **Kontrol dua ibu jari:** kemudi kiri/kanan berada di kiri, gas/rem di kanan, dan nitro memiliki tombol tersendiri. Gas dan kemudi dapat ditahan bersamaan. Setiap jari dilepas secara terpisah; pause, tab tersembunyi, kehilangan fokus, dan jeda salat tetap melepaskan seluruh kontrol.
- **Halaman lebih ringkas:** tinggi pratinjau menyesuaikan layar, panel lobi didahulukan pada HP, dan daftar panjang dibatasi pada area scroll tersendiri. Scroll yang diperlukan untuk formulir serta daftar panjang tetap tersedia agar seluruh isi bisa dijangkau.

**Kendaraan:** bentuk Koenigsegg kini mengikuti foto Regera terbaru, dengan kanopi melengkung dan sayap belakang melintang; Venom F5 mengikuti foto ungu dengan kokpit terbuka. Isuzu Panther Grand Touring memiliki kabin MPV tinggi, gril krom, roof rail, lampu terpisah, dan pijakan samping. Harga awal Panther adalah Rp150.000 kredit game, terkunci sampai dibeli atau dibuka admin. Harga, akses, serta performanya bisa diubah lewat admin seperti kendaraan lain.

Migrasi **012** menyelaraskan nama bawaan Koenigsegg menjadi **Regera**, tetap memakai ID historis `jesko-absolut` agar pembelian dan modifikasi pemain tidak hilang atau dibayar ulang. Nama khusus yang pernah diisi admin dipertahankan. Migrasi **013** menambahkan Panther dengan menyalin tuning, fisika, dan hadiah admin ke versi aturan baru. Tiga belas GLB lainnya, tiga lingkungan, dan sebelas migrasi terdahulu dipertahankan. CSS/JavaScript HUD serta URL model yang diperbarui memakai penanda cache baru.

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
2. **Garasi.** Hanya kendaraan milik permanen pemain, termasuk Subaru BRZ awal, yang tampil di koleksi ini. Gunakan **Sebelumnya/Berikutnya** untuk melihat mobil lain yang dimiliki. Putar mobil dengan menyeret, perbesar dengan scroll, pilih sudut depan/samping/belakang, dan dengarkan profil mesin. Garasi memakai lingkungan bengkel 3D. Musik MP3 yang dipilih admin tersedia di garasi; tekan tombol pemutaran jika browser meminta interaksi terlebih dahulu.
3. **Showroom.** Pratinjau seluruh 16 kendaraan, termasuk yang belum dibeli, melalui kartu atau **Sebelumnya/Berikutnya**. Mobil berlabel **Milik permanen** selalu bisa dipakai; **Akses gratis admin** bisa dipakai selama dibuka. **Beli akses permanen** membeli kendaraan satu kali dengan saldo akun, termasuk ketika sedang dibuka gratis.
4. **Bengkel.** Pilih kendaraan yang dimiliki, paket pelek, warna bodi/pelek, lapisan metallic/gloss/matte, dan salah satu pola striping. Pratinjau tidak memotong saldo. Tekan **Tinjau biaya & pasang**, periksa rincian, lalu **Bayar & pasang**. Memilih kembali tampilan yang tersimpan gratis.
5. **Balapan.** Buat ruang atau masukkan kode teman. Pilih sirkuit, jumlah lap, slot manusia, bot, kesulitan, dan kontak antarmobil. Semua pemain menekan **Saya siap balapan**, lalu host memulai persiapan. Halaman loading layar penuh memakai JPEG pilihan admin dan menunjukkan status **Memuat arena / Arena siap** setiap perangkat. Gambar loading tidak menutupi proses pemuatan mesin: arena tetap dirender di bawahnya. Halaman ini hilang ketika seluruh arena siap dan server mengirim hitungan 3–2–1 bersama.
6. **Lokasi & jeda salat.** Atur GPS atau lokasi manual dari Profil. Jika waktu salat seorang peserta masuk, seluruh ruang membeku minimal 15 menit. Setelah itu semua peserta yang masih berada di ruang menekan **Siap melanjutkan**, lalu menunggu hitungan bersama. Jakarta digunakan jika lokasi tidak diperoleh.
7. **Finish.** Server menentukan lap, posisi, hasil, dan hadiah. Layar hasil menampilkan hadiah akun sendiri. Transaksi dapat diperiksa di profil.

Semua peserta harus berada pada layanan UVelocity yang sama. Kode ruang tidak menghubungkan dua server instalasi yang terpisah.

### Mengganti mobil aktif

Buka **Garasi**, lalu pilih mobil dengan **Sebelumnya/Berikutnya** atau kartu pada **Kendaraan milik Anda**. Tombol **Ganti mobil** pada ringkasan **MOBIL AKTIF** langsung membuka bagian ini. **Sebelumnya/Berikutnya** menelusuri koleksi secara melingkar dan menampilkan urutan pilihan; tombol dinonaktifkan jika koleksi hanya berisi satu mobil. Klik **Pakai mobil ini** di area judul **Garasi Anda** untuk benar-benar mengaktifkan pilihan tersebut. Memilih kartu atau tombol navigasi saja menampilkan pratinjau. Ringkasan **MOBIL AKTIF** mengikuti pilihan yang berhasil disimpan pada server, bukan mobil yang sekadar sedang dilihat.

Untuk mobil yang belum dimiliki, buka **Showroom**, lalu klik **Beli akses permanen** atau **Gunakan selama dibuka** jika admin membuka akses gratis. Akses gratis sementara tidak memasukkan mobil ke koleksi Garasi; setelah dibeli permanen, mobil muncul di Garasi. Kembali dari pratinjau mobil belum dimiliki ke Garasi memilih pratinjau mobil milik pemain tanpa mengganti mobil aktif di server secara diam-diam. Berpindah ke mobil milik sendiri dengan konfigurasi tersimpan tidak membayar ulang. Jika Anda mengubah cat/striping sekaligus, tombol berubah menjadi **Tinjau biaya & pasang** agar biaya ditinjau sebelum diterapkan. Kendaraan dipilih sebelum persiapan atau pertandingan berjalan.

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
| Koenigsegg Regera | Rp2.400.000 |
| Hennessey Venom F5 | Rp2.200.000 |
| Isuzu Panther Grand Touring | Rp150.000 |

Tiga sirkuit: **Neon City**, **Azure Coast**, dan **Frostpeak Pass**. Masing-masing mempertahankan geometri lintasan, lingkungan kota/pantai/pegunungan es, serta pilihan suasana senja dan malam. Detail grafis dapat dipilih Ringan, Seimbang, atau Tinggi.

Harga dapat berbeda jika administrator mengubah katalog. Delapan model tambahan merupakan rekonstruksi 3D khusus berdasarkan referensi pengguna; bukan mesh pabrikan, hasil scan, atau salinan aset game lain. BMW M4 memakai bentuk F82, Batmobile mengikuti versi 1989, Koenigsegg mengikuti bentuk Regera pada foto terbaru, Venom F5 memakai kokpit terbuka serta roda emas sesuai foto, dan Panther mengikuti foto MPV gelap dengan trim krom. Delapan aset kendaraan sebelumnya dipertahankan tanpa perubahan berkas GLB. Angka performa adalah parameter simulasi arcade, bukan klaim spesifikasi mobil asli. Varian Polisi 77 adalah desain fiktif untuk game.

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

### Finis dan hasil langsung

Ketika semua pembalap manusia yang masih mengikuti pertandingan telah finis, balapan diselesaikan **tanpa menunggu bot yang belum finis**. Pembalap yang sudah keluar/DNF tidak menahan penyelesaian. Pemain yang sedang mencoba reconnect masih mengikuti masa tenggang yang sama dengan sebelumnya; ketika tenggang habis, statusnya menjadi DNF.

Waktu dan urutan finis dicatat saat garis benar-benar dilalui. Bot yang sudah finis mempertahankan hasilnya; bot yang masih tertinggal tercatat DNF dengan urutan berdasarkan progres terakhir. Hadiah mengikuti hasil resmi dan tetap disimpan satu kali oleh server.

Mobil yang sudah finis melepas gas dan nitro, lalu melambat bertahap melewati garis. Pemain tidak bisa menambah gas, mengaktifkan nitro, atau memakai reset untuk mengubah hasil setelah finis. Gerak setelah finis tidak menambah lap atau memperbaiki waktu. Hasil akhir langsung tampil setelah server menyimpannya; animasi melambat dapat berlanjut di belakang panel hasil tanpa menunda perhitungan pemenang.

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
| C | Ganti kamera balapan, termasuk kamera dashboard/interior |
| R | Minta reset kendaraan |
| Esc / P | Menu dan pelepasan kontrol lokal |
| M | Suara |

Kontrol sentuh tersedia untuk layar kecil. Dukungan perangkat dan performa grafis perlu dicoba pada perangkat sasaran sebelum digunakan untuk acara atau turnamen.

Kamera **dashboard/interior** menempatkan pandangan di posisi pengemudi, dengan dashboard dan setir 3D yang mengikuti arah kemudi kendaraan. Kamera pengejar dan kap tetap tersedia. Interior dibuat secara prosedural dan disesuaikan dengan dimensi/kelas mobil; ini bukan replika dashboard pabrikan satu per satu. Berpindah kamera tidak mengganti model eksterior atau kualitas grafis yang dipilih.

## Kredit rupiah virtual, pelek, cat, dan striping

Rp di dalam aplikasi adalah **kredit permainan**. Tidak ada pembayaran uang nyata, gateway pembayaran, tarik tunai, atau konversi saldo menjadi uang nyata.

Aturan hadiah awal: Rp10.000 untuk finish, Rp1.000 per lap, dan bonus posisi pertama/kedua/ketiga Rp15.000/Rp8.000/Rp4.000. Batas awal Rp50.000 per balapan; finish terlalu cepat di bawah batas aturan tidak mendapat hadiah. DNF bernilai nol. Administrator dapat menerbitkan aturan baru. Balapan yang sudah berjalan tetap memakai aturan yang dikunci saat pertandingan dibuat.

Empat pilihan roda: standar, Six-Spoke (Rp20.000), Multi-Spoke (Rp35.000), dan Mesh (Rp50.000). Paket yang dibeli dapat dipakai pada kendaraan yang dimiliki. Paket roda disesuaikan terhadap ukuran roda masing-masing mobil. **Warna pelek bawaan maupun pelek custom dapat diganti melalui bengkel berbayar.** Pelek bawaan pada akun lama tetap memakai material asli sampai pemain memilih dan membayar pengecatan. Warna pelek hanya diterapkan pada bagian logam pelek; ban dan rem tetap terpisah.

Modifikasi ini bersifat kosmetik. Setiap kendaraan yang dimiliki menyimpan satu konfigurasi tersendiri: warna bodi, lapisan, pelek, warna pelek, desain striping, dan warna striping. Berpindah mobil memulihkan tampilannya; tidak membayar ulang untuk memakai tampilan yang sudah terpasang. Belum tersedia beberapa preset untuk satu kendaraan, upgrade mesin, suspensi, atau body kit.

### Biaya bengkel awal

| Layanan | Biaya kredit game |
| --- | ---: |
| Perubahan warna bodi dan/atau lapisan dalam satu pemasangan | Rp10.000 |
| Pengecatan/perubahan warna pelek bawaan atau custom | Rp5.000 |
| Perubahan warna striping tanpa mengganti desain | Rp5.000 |
| Twin Racing | Rp15.000 |
| Offset Sport | Rp18.000 |
| Side Sweep | Rp12.000 |
| Circuit Lines | Rp20.000 |
| Heritage Bands | Rp22.000 |
| Melepas striping yang sedang terpasang | Rp5.000 |

Pemasangan striping baru atau penggantian desain memakai tarif desain yang dipilih dan sudah mencakup warna pilihan saat pemasangan. Jika desain tetap sama dan hanya warnanya diubah, biaya memakai layanan **warna striping** tersendiri. Keduanya tidak ditagihkan dua kali untuk satu pemasangan desain. Melepas striping hanya dikenakan biaya jika sebelumnya memang terpasang. Memilih kembali warna/desain yang sudah tersimpan tidak dikenakan biaya. Pengecatan pertama pelek bawaan tetap berbayar, termasuk ketika memilih warna perak yang sama dengan nilai contoh pada pemilih warna, karena material asli pabrik belum dicat.

**Semua tarif perubahan warna yang tersedia dapat dikelola admin:** cat bodi/lapisan, warna pelek, dan warna striping. Harga awal di tabel hanya nilai awal. Harga akhir berasal dari penawaran server, mengikuti katalog admin, dan ditampilkan sebelum pembayaran. Penawaran berlaku 10 menit; perubahan harga, ketersediaan layanan, atau tampilan oleh sesi lain memerlukan rincian baru sebelum membayar.

Pada **Admin → Harga & toko → Tarif perubahan warna**, pilih layanan, masukkan harga dalam angka rupiah tanpa pemisah ribuan, isi alasan, lalu tekan **Simpan penawaran**. Admin dapat menetapkan Rp0 jika sengaja ingin menggratiskan layanan, atau menonaktifkan **Layanan aktif** untuk menutup perubahan baru. Warna yang telah tersimpan tetap dapat dipakai. Mengembalikan pelek yang sudah dicat ke **finishing pabrik** juga memakai tarif cat pelek dan melalui tinjauan biaya terlebih dahulu.

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
- **Harga & toko:** pilih kendaraan untuk membuka/mengunci akses gratis, mengatur harga pembelian permanen, dan mengaktifkan/menonaktifkan penjualan. Tarif **cat bodi/lapisan**, **warna pelek**, dan **warna striping** dapat diatur terpisah, bersama biaya setiap desain striping dan pelepasannya. Admin juga dapat mengaktifkan/menonaktifkan layanan. Setiap perubahan memerlukan alasan dan tercatat di audit. Kunci admin tidak mencabut kepemilikan permanen.
- **Hadiah balapan:** atur hadiah finish, per lap, podium, durasi minimum, dan batas hadiah.
- **Musik & loading:** unggah MP3 untuk musik garasi atau JPEG untuk gambar loading balapan; pratinjau, pilih media aktif, atur volume, lalu simpan dengan alasan perubahan. Unggahan baru tidak otomatis mengganti media aktif.
- **Foto kendaraan:** pilih model, unggah foto JPEG/PNG/WebP, periksa pratinjau, isi alasan, lalu simpan. Foto kecil tampil pada kartu koleksi Garasi dan Showroom. Foto dapat diganti atau dihapus per kendaraan.
- **Riwayat admin:** lihat operator, waktu, alasan, serta nilai sebelum/sesudah perubahan.

Pembuatan admin adalah tindakan operator di terminal, bukan pilihan pada formulir pendaftaran umum. CLI hanya membuat akun baru dan tidak diam-diam mempromosikan akun pemain yang sudah ada. Untuk otomasi privat, CLI juga menerima `ADMIN_EMAIL`, `ADMIN_DISPLAY_NAME`, dan `ADMIN_PASSWORD` melalui lingkungan proses; jangan memasukkannya ke repository atau membagikannya dalam tangkapan layar.

### Musik garasi dan gambar loading

Gunakan menu media di panel admin untuk mengunggah berkas sendiri. Batas MP3 adalah **20 MiB** per berkas dan durasi maksimum 60 menit; batas JPEG adalah **10 MiB**, maksimum 8192 piksel per sisi dan 24 megapiksel. Koleksi menyimpan hingga 40 berkas dengan total 250 MiB. Format diperiksa dari isi, bukan hanya ekstensi. JPEG diproses ulang agar orientasinya benar dan metadata dibuang; audio MP3 dipertahankan tanpa tag nonaudio.

Pilih satu lagu dan satu gambar aktif, atau kosongkan pilihan untuk menonaktifkannya. Simpan perubahan secara eksplisit. Jika admin lain menyimpan pengaturan lebih dulu, muat ulang dan tinjau pilihan agar perubahan tidak tertimpa diam-diam. Media yang masih aktif harus dilepas dan pengaturannya disimpan sebelum berkas dapat dihapus. Unggahan, perubahan, dan penghapusan masuk ke riwayat admin.

Musik digunakan di garasi, showroom, bengkel, serta lobi; berhenti saat persiapan, countdown, balapan, hasil, atau jeda salat. Kontrol suara utama juga membisukannya. Browser dapat meminta klik tombol pemutaran sebelum audio pertama. Aplikasi tidak menyertakan lagu komersial atau gambar loading wajib; tanpa JPEG aktif, loading tetap berfungsi dengan latar bawaan.

**Contoh gambar siap unggah:** `examples/media/uvelocity_loading.jpg` (1672 × 941 piksel, sekitar 600 KiB). Ilustrasi sinematik ini menempatkan mobil di sisi kanan dan ruang teks di kiri. Di **Admin → Musik & loading**, pilih berkas pada **Tambahkan gambar JPEG**, klik **Unggah JPEG**, pilih hasilnya di **Gambar halaman loading**, isi alasan, lalu klik **Simpan pengaturan media**. Gambar contoh tidak diaktifkan otomatis dan dapat diganti dengan JPEG Anda sendiri. Logo serta progress/kesiapan pemain tetap ditampilkan oleh UI game di atas gambar.

Media disimpan di **PostgreSQL**, termasuk berkasnya, sehingga volume dan backup database yang sama menyimpan akun, saldo, MP3, serta gambar. Tidak perlu direktori upload atau volume container tambahan. Layar loading tidak mempercepat hitungan mundur dan tidak melewati pemeriksaan kesiapan arena. Batas persiapan 45 detik, pembatalan, putus sambungan, dan prioritas jeda salat tetap berlaku.

### Foto kecil pada koleksi kendaraan

Buka **Admin → Foto kendaraan**, pilih model, lalu pilih foto mobil asli yang ingin ditampilkan. Format masukan **JPEG, PNG, atau WebP**, maksimum **4 MiB** dan **16 megapiksel**, berupa satu gambar diam. Pratinjau memperlihatkan pilihan sebelum diunggah. Isi **Alasan perubahan foto**, lalu tekan **Simpan foto kendaraan** atau **Simpan foto pengganti**. Unggahan menampilkan kemajuan dan dapat dibatalkan; jika respons terputus, muat ulang untuk memeriksa hasil terakhir dari server sebelum mengulang.

Server mengorientasikan foto, mempertahankan proporsi, dan memperkecilnya agar muat dalam **512 × 288 piksel** tanpa memotong atau memperbesar gambar. Hasil disimpan sebagai WebP maksimal 512 KiB tanpa metadata EXIF/GPS. Kartu memakai bingkai 16:9, pemuatan gambar bertahap saat diperlukan, dan ikon cadangan jika foto belum tersedia atau gagal dimuat. Foto ini melengkapi kartu koleksi; model 3D pada bengkel dan arena tetap digunakan seperti sebelumnya.

Setiap kendaraan mempunyai satu foto aktif dengan versi tersendiri. Penggantian mengubah foto model tersebut bagi semua pemain setelah katalog dimuat ulang; tidak mengubah harga, status kunci, saldo, konfigurasi, atau kepemilikan. Perubahan admin bersamaan ditolak jika memakai versi foto lama, sehingga perlu diperiksa kembali. **Hapus foto** meminta konfirmasi dan alasan; kartu kembali menampilkan ikon. Foto lama dibuang dari penyimpanan saat berhasil diganti/dihapus, sedangkan riwayat perubahan tetap tercatat. Berkas foto tersimpan di PostgreSQL dan ikut backup database.

Paket tidak mengisi foto mobil asli secara otomatis. Admin mengunggah foto yang sesuai untuk masing-masing dari 16 model. Foto hanya muncul di Garasi jika kendaraan tersebut dimiliki pemain; Showroom tetap menampilkan semua kendaraan.

## Memperbarui pemasangan dari versi sebelumnya

Pertahankan `.env` dan volume/database yang sudah digunakan. Buat backup, ganti sumber aplikasi dengan paket ini, lalu jalankan `docker compose up --build -d` atau `npm ci`, `npm run db:migrate`, dan `npm run build` pada pemasangan native. Jangan membuat database baru atau menghapus volume.

Migrasi tambahan **006** menambahkan akses global, tampilan per kendaraan, serta penawaran/transaksi bengkel. Migrasi **007** menambahkan tujuh kendaraan dan versi aturan baru dengan mempertahankan tuning serta kebijakan hadiah admin sebelumnya. Migrasi **008** menambahkan lokasi dan window jeda salat pribadi yang persisten. Migrasi **009** menambahkan koleksi media serta pilihan musik/gambar aktif; pilihan awal kosong dan tidak mengubah data pemain. Migrasi **010** menambahkan foto kecil per kendaraan dengan versi terpisah dari katalog harga. Migrasi **011** menambahkan status pengecatan pelek bawaan dan tarif perubahan warna striping yang terpisah. Material pelek bawaan lama dipertahankan. Penawaran bengkel lama yang belum dibayar diminta diperbarui karena aturan biaya berubah; riwayat dan respons pembayaran yang sudah berhasil tetap disimpan. Akun, saldo, koleksi, ledger, serta konfigurasi dan versi aturan lama tetap dipertahankan. Migrasi **012** mengubah nama bawaan Koenigsegg tanpa mengganti identitas kendaraan; migrasi **013** menambahkan Panther dan aturan baru sambil mempertahankan tuning admin lama. Pengujian upgrade menggunakan database berisi akun dan konfigurasi lama, bukan hanya database kosong.

## Membuat ulang model tambahan

GLB siap pakai sudah tersedia di paket; server produksi tidak perlu Blender. Sumber pembuat geometri disertakan:

```bash
node scripts/build-racecar-expansion.cjs --publish
node scripts/build-hypercar-expansion.cjs --publish
node scripts/build-panther.cjs --publish
```

Skrip memakai Three.js yang dibundel dan menulis kembali delapan GLB rekonstruksi saja. `scripts/modeling-kit.cjs` memuat helper permukaan bodi, material, bukaan roda, hierarchy roda/kemudi, dan eksportir glTF. Catatan asal serta ukuran geometri permainan berada di metadata masing-masing model. Pratinjau render tiga kendaraan terbaru tersedia di `docs/previews/`. Gambar pemeriksaan model, bila disertakan, dibuat dengan Blender Cycles CPU dan bukan tangkapan layar gameplay browser.

## Komponen teknis

- **Node.js + TypeScript + Express:** HTTP, autentikasi, toko, admin, dan penyajian klien.
- **Colyseus + WebSocket:** ruang multiplayer dan simulasi kendaraan di server. Klien mengirim kontrol; server menentukan posisi resmi, checkpoint, finish, dan hasil.
- **React:** login, profil, garasi, toko, ruang, dan admin.
- **Three.js r128 + GLTFLoader:** model dan dunia 3D yang dipertahankan dari game sebelumnya. Aset dimuat dari server sendiri, bukan CDN.
- **PostgreSQL:** akun, sesi, tiket balap, kepemilikan, konfigurasi, ledger saldo, hasil, versi aturan, audit, lokasi/jeda salat pribadi, berkas MP3/JPEG dan pengaturan media, serta foto kecil WebP per kendaraan.
- **Adhan + geo-tz/all:** perhitungan jadwal dan penentuan zona waktu dari lokasi di server; tidak memerlukan panggilan API jadwal eksternal.

Autentikasi menggunakan cookie HttpOnly, hash scrypt, pemeriksaan Origin/CSRF, pembatasan permintaan, dan tiket balap sekali pakai yang terikat sesi. Saldo menggunakan integer besar dalam database. Pembelian, topup, dan hadiah memakai transaksi atomik serta pencegahan penggandaan. Data akun/saldo tidak bergantung pada `localStorage`; penyimpanan browser hanya dipakai untuk preferensi tampilan/suara dan token reconnect sementara.

Dokumentasi detail: [docs/API.md](docs/API.md), [docs/GRAPHICS.md](docs/GRAPHICS.md), [docs/BRANDING.md](docs/BRANDING.md), [docs/PRAYER.md](docs/PRAYER.md), dan [docs/VERIFICATION.md](docs/VERIFICATION.md).

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
npm run test:media-ui
npm run test:vehicle-images-ui
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
| Musik garasi belum terdengar | Pastikan admin sudah memilih dan menyimpan MP3 aktif, suara tidak dibisukan, lalu tekan tombol pemutaran. Musik memang berhenti selama balapan/jeda salat. |
| Gambar loading belum berubah | Unggah JPEG, pilih sebagai gambar aktif, dan simpan pengaturan; mengunggah saja belum mengaktifkannya. Coba pada persiapan balapan berikutnya. |
| Mobil pada pratinjau berbeda dari MOBIL AKTIF | Setelah memilih kartu di Garasi, tekan Pakai mobil ini di area judul Garasi Anda. Memilih kartu belum menyimpan kendaraan aktif. |
| Kredit tidak bertambah | Lihat hasil resmi, durasi minimum, status finish/DNF, serta riwayat transaksi. Topup ulang dengan referensi sama tidak menambah kredit lagi. |

## Kredit aset

[public/credits.html](public/credits.html) menyediakan kredit yang bisa dibuka dari bantuan dalam game. Atribusi model juga tersedia di [public/game/assets/CREDITS.txt](public/game/assets/CREDITS.txt); lisensi Three.js ada di [public/game/vendor/THREE-LICENSE.txt](public/game/vendor/THREE-LICENSE.txt). Metadata atribusi pada GLB dipertahankan. Suara mesin adalah sintesis khusus per kendaraan, bukan rekaman autentik kendaraan asli.

Referensi deployment: [image PostgreSQL resmi](https://hub.docker.com/_/postgres), [proxy Caddy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy), dan [transport WebSocket Colyseus](https://docs.colyseus.io/server/transport/ws).
