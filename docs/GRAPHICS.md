# Grafis, kendaraan, striping, dan bengkel 3D UVelocity

## Yang dipertahankan

UVelocity mempertahankan delapan model kendaraan dan tiga lingkungan dari versi World Tour, lalu menambahkan tujuh rekonstruksi kendaraan serta striping yang mengikuti permukaan bodi. Berkas GLB dipindahkan dari data base64 di dalam HTML menjadi aset statis terpisah di `public/game/assets/cars/`. Geometri dan tekstur yang tersimpan dalam kedelapan GLB **tidak diubah**. Total delapan berkas tersebut sekitar 30,7 MB sebelum kompresi HTTP. Tujuh model tambahan berukuran sekitar 22,1 MB; seluruh lima belas GLB berjumlah sekitar 52,8 MB.

Delapan model sumber yang dipertahankan adalah Veloce R, Apex GT, Cinder V8, Kaze Rally, Lamborghini Aventador, Nissan Skyline R34, Subaru BRZ, dan Bugatti Veyron Polisi 77. Modul arsitektur kota, bioma pantai dan gunung es, aksesori Polisi 77, serta model cadangan juga dipertahankan byte demi byte. Acuan SHA-256 untuk aset tersebut tersedia di `tests/renderer/asset-hashes.json`.

Three.js r128 dan GLTFLoader disajikan dari `public/game/vendor/`. Tidak ada CDN yang diperlukan saat menjalankan renderer. Aset model dimuat melalui `NV_MODEL_URLS`, sehingga browser dapat menyimpan GLB dalam cache tanpa mem-parsing ulang puluhan megabita base64 dari halaman HTML. Sintesis mesin dan delapan profil suara lama tetap menggunakan kode sebelumnya. Tujuh profil tambahan memakai parameter sintesis sendiri; Batmobile memakai karakter turbin fiksi. Suara tambahan bukan rekaman mesin asli, dan parameter RPM, perpindahan gigi, serta resonansinya merupakan penyetelan permainan.

Kredit pencipta model dan lisensinya tetap tersedia dalam halaman kredit aplikasi serta `public/game/assets/CREDITS.txt`. Lisensi Three.js tersedia di direktori vendor.

## Tujuh rekonstruksi kendaraan tambahan

Tujuh model berikut dibuat dari geometri asli untuk UVelocity dengan mengacu pada gambar pengguna. Model ini **bukan mesh resmi pabrikan, hasil pemindaian, atau aset yang diambil dari permainan lain**. Katalog menandainya sebagai `reference-recreation`; GLB dan metadata pembuatannya juga menyimpan asal-usul tersebut.

| ID | Kendaraan referensi | Pembeda bentuk yang dituju |
| --- | --- | --- |
| `bmw-hybrid-v8` | BMW M Hybrid V8 | Hidung twin-kidney prototype, kokpit rendah, sirip tengah, sayap balap |
| `bmw-m4-gt4` | BMW M4 GT4 F82 | Grille kompak F82, garis coupe lebih tinggi, ventilasi dan sayap sirkuit |
| `amg-gt4` | Mercedes-AMG GT4 | Kap panjang, grille vertikal, atap fastback rendah |
| `sls-amg-gt3` | Mercedes-Benz SLS AMG GT3 | Kap panjang, lampu tegak, grille horizontal, garis atap gullwing |
| `batmobile-1989` | Batmobile 1989 | Intake turbin bundar, bodi memanjang, kanopi dan sirip belakang |
| `jesko-absolut` | Koenigsegg Jesko Absolut | Kanopi rendah, ekor panjang, dua sirip penstabil tanpa sayap besar |
| `venom-f5` | Hennessey Venom F5 | Fender tinggi, lampu tipis, intake samping, sayap sesuai referensi pengguna |

Geometri dibangun menggunakan helper pada `scripts/modeling-kit.cjs` dan script pembentuk kendaraan. Permukaan bodi, kaca, karbon, lampu, roda, dan kaliper menggunakan material terpisah. Bukaan roda dibentuk pada panel bodi; ban bukan sekadar ditempel pada sisi kotak tertutup. Semua model memakai satuan meter, sumbu +Y ke atas, dan +Z ke depan.

Empat roda dan dua pivot kemudi diekspor sebagai node terpisah. Roda kustom tetap diukur dari ban model masing-masing; kaliper belakang pada model tambahan disimpan pada axle yang tidak ikut body roll. Titik lampu dan exhaust berasal dari metadata model, termasuk exhaust tengah tunggal untuk model yang memerlukannya. Jarak kamera bengkel dan thumbnail bertambah untuk model panjang; framing delapan model lama tetap sama.

Ukuran, top speed, akselerasi, dan handling dalam aplikasi merupakan data visual atau keseimbangan permainan. Angka performa tersebut tidak disajikan sebagai pengukuran kendaraan produksi atau homologasi balap.

## Striping yang mengikuti panel bodi

`public/game/stripe-customization.js` menyediakan enam pilihan melalui `NVStripes`:

| ID | Nama | Pola |
| --- | --- | --- |
| `none` | Tanpa striping | Menghapus vinyl tambahan dan mempertahankan cat/livery bawaan |
| `twin-racing` | Twin Racing | Dua pita sejajar di kap, atap, dan belakang |
| `offset` | Offset | Pita asimetris dan satu garis tipis |
| `side-sweep` | Side Sweep | Sapuan diagonal pada kedua sisi bodi |
| `circuit` | Circuit | Pita diagonal atas, garis rocker, dan aksen kuarter |
| `heritage` | Heritage | Pita tengah, pinstripe, serta dua garis samping |

Striping dibentuk dengan memotong segitiga permukaan yang benar-benar memakai material `paint` atau `paint_*`. Modul memeriksa kelompok material pada mesh yang memiliki lebih dari satu material, sehingga kaca dalam mesh yang sama tetap dikecualikan. Atribut posisi yang dikuantisasi dan dinormalisasi, termasuk pada BRZ, dikonversi sebelum pemotongan.

Hasil pemotongan mempertahankan bentuk dan normal permukaan asal. Geometri hanya dinaikkan **1,5 mm** sepanjang normal untuk menghindari perebutan kedalaman dengan bodi. Ini bukan bidang datar yang mengambang di atas mobil. Kaca, roda, lampu, material karbon, interior, dan stiker sumber dengan material tersendiri tidak dilapisi. Permukaan vinyl menggunakan material PBR tersendiri dan mengikuti kemiringan serta body roll. Livery Polisi 77 tetap memiliki lapisan aksesori sendiri.

Warna berasal dari `stripeColor`; nilai bawaan `#ffffff`. `stripeId` bawaan adalah `none`. Mengganti warna vinyl memakai ulang geometri yang sama. Memilih `none` membuang lapisan tambahan tanpa mengubah geometry atau material model sumber. Seluruh patch sebuah pola digabung menjadi **satu mesh/material**, sehingga menambah satu draw geometri per kendaraan ketika terlihat. LOD menyembunyikan detail vinyl pada jarak 58 m untuk kualitas rendah, 110 m untuk sedang, dan 160 m untuk tinggi. Penghitungan referensi membagi geometri pola yang sama antar kendaraan dan membuangnya ketika tidak dipakai.

Renderer menerima `stripeId`, `stripeColor`, dan `appearanceVersion` pada loadout; appearance key memasukkan ID serta warna striping. Preview bebas dapat menggunakan semua opsi. Harga, pemeriksaan saldo, kepemilikan permanen, persetujuan pemasangan, serta penetapan tampilan resmi ditangani aplikasi/server. Renderer tidak memotong saldo. Snapshot race membawa tampilan resmi yang dibekukan server, sehingga pola pemain lain ikut terlihat.

## Bengkel sebagai lingkungan 3D

`public/game/workshop.js` membangun ruang bengkel dari geometri yang benar-benar dapat dilihat dari berbagai sudut. Lingkungan ini bukan foto atau gambar latar.

Ruang bengkel mencakup:

- Lantai beton dengan variasi warna, peta normal, peta kekasaran, sambungan pelat, garis area servis, dan saluran lantai.
- Dinding industri, pintu servis bergulir, kolom baja, rangka atap, serta jendela dengan rangka logam dan kaca buram.
- Meja kerja, papan perkakas, laci dan pegangan, lemari alat, rak ban, troli perkakas, lift servis, dongkrak, kompresor, dan perlengkapan keselamatan.
- Lampu kerja berwarna hangat, cahaya jendela yang lebih sejuk, dan papan nama UVelocity berwarna hijau, arang, serta emas.

Area tengah berukuran **6,2 × 8,2 meter** dijaga bebas dari perlengkapan yang dapat menghalangi mobil. Saat kamera diputar atau dijauhkan, perlengkapan yang tepat berada di antara kamera dan mobil disembunyikan sementara. Dinding di sisi luar kamera serta atap yang terlalu dekat dengan kamera juga ditangani agar pandangan mobil tetap terbuka.

Geometri perlengkapan digabung per material. Seluruh bengkel berisi **81 kelompok mesh/material dan 22.076 segitiga**, sebelum menghitung mobil, lintasan, bayangan, maupun proses pembuatan peta lingkungan. Angka tersebut adalah hitungan geometri; jumlah panggilan GPU pada suatu frame dapat berbeda karena bayangan, pemotongan objek di luar kamera, dan peta lingkungan.

Refleksi cat dan krom berasal dari peta lingkungan PMREM yang dibuat menggunakan ruang bengkel sebenarnya sebelum mobil ditambahkan. Lantai, jendela, dan lampu kerja ikut membentuk refleksi. Kualitas grafis rendah mengurangi perlengkapan tambahan; pengaturan bayangan dan resolusi tetap mengikuti pilihan kualitas aplikasi.

Mode iframe memakai posisi vertikal kamera yang disesuaikan dengan keterangan kendaraan di aplikasi. Ukuran model, FOV dasar, rotasi kamera, dan kemampuan zoom tetap tersedia. Kontrol garasi lama disembunyikan agar tidak bertumpuk dengan kontrol aplikasi.

## Paket roda dan penyimpanan roda asli

`public/game/wheel-customization.js` menyediakan empat pilihan untuk kelima belas kendaraan:

| ID | Pilihan | Geometri |
| --- | --- | --- |
| `stock` | Original | Roda bawaan model, termasuk material aslinya |
| `six-spoke` | Forge Six | Enam palang dengan profil cekung |
| `multi-spoke` | Touring Twelve | Dua belas palang tipis |
| `mesh` | Cross Mesh | Palang silang dengan bibir poles dan detail baut |

Tiga paket baru menggunakan geometri ban, palang, bibir velg, bagian dalam velg, katup, dan detail logam. Ban memakai material karet dengan pola alur dan kekasaran. Warna palang dapat diubah melalui `rimColor`; bagian logam yang dipoles tetap mempertahankan materialnya.

Ukuran paket diukur dari ban setiap roda kendaraan, termasuk perbedaan roda depan dan belakang. Ini juga memperhitungkan transformasi GLB dan posisi Int16 yang dinormalisasi pada BRZ. Komponen tambahan dalam sebuah subtree roda tidak otomatis dianggap sebagai ukuran ban. Paket baru dibuat sedikit lebih kecil daripada batas ban sumber untuk menjaga kompatibilitas dengan ruang roda.

Roda asli tidak dihapus atau ditulis ulang. Mesh roda yang diganti disembunyikan, sementara pivot kemudi dan putaran tetap digunakan. Cakram dan kaliper asli yang terpisah dipertahankan. Memilih `stock` memulihkan visibilitas semula. Veyron memiliki ban dan velg bawaan dalam satu primitive; model ini menerima penggantian satu set roda utuh, tanpa memotong ulang bodi atau tekstur aslinya.

Warna roda bawaan sengaja tidak diubah oleh pilihan warna paket. Hal ini juga mencegah warna ban Veyron berubah ketika pengguna menginginkan warna velg saja. Pilih salah satu dari tiga paket kustom untuk menggunakan `rimColor`.

Geometri paket dibagi melalui cache dengan penghitungan referensi. Material warna dimiliki tiap kendaraan. Paket memiliki tiga tingkat detail dengan perpindahan sekitar 32 dan 86 meter. Cache model sumber tetap terpisah dari kepemilikan geometri baru, sehingga mengganti atau menghapus satu kendaraan tidak merusak kendaraan lain.

## Batas antara renderer dan permainan online

Renderer menerima keadaan kendaraan melalui `NVGame.applySnapshot()`. Dalam mode online, loop fisika lokal, AI lama, penghitungan lap lama, fungsi finish lama, dan penyimpanan rekor lokal tidak menentukan hasil balapan.

Browser tetap mengerjakan tugas visual: posisi model yang diterima, kemudi, putaran roda, body roll dan pitch, lampu rem, api nitro, kamera, minimap, HUD, lingkungan, serta suara mesin. Prediksi kendaraan dan jaringan berada pada aplikasi induk; server menentukan hasil dan ekonomi.

Antarmuka yang digunakan aplikasi:

| Metode/event | Fungsi |
| --- | --- |
| `ready` | Menunggu inisialisasi renderer dan percobaan pemuatan seluruh model |
| `ensureModels(ids)` | Memastikan model roster benar-benar berhasil dimuat; menolak bila aset gagal dan dapat dicoba kembali |
| `getCatalog()` | Memberikan status `loaded`, jenis representasi model, katalog roda, dan katalog striping |
| `preview(loadout)` / `setLoadout(loadout)` | Menampilkan mobil, cat, finishing, paket roda, serta striping di bengkel |
| `configure({quality,timeOfDay,...})` | Mengubah pengaturan yang secara eksplisit diberikan |
| `setCamera('front'|'side'|'rear')` | Mengatur sudut showroom |
| `setCamera()` | Mengganti sudut showroom atau kamera balapan, mengikuti mode aktif |
| `startRace(...)` | Menunggu model roster, kemudian menyiapkan scene dan visual kendaraan; belum mengakui frame telah tampil |
| `applySnapshot(...)` | Menerapkan posisi grid atau keadaan balapan dari aplikasi induk |
| `waitForRaceFrame({raceId,startToken,minimumTick,timeoutMs})` | Menunggu main scene dengan snapshot terkait benar-benar dirender dan mendapat kesempatan presentasi frame |
| `stopRace()` | Melepaskan model balapan dan kembali ke bengkel |
| `setVisible(false)` | Menghentikan render dan audio sementara tanpa membuang cache aset |
| `setMuted(...)`, `previewEngine()`, `unlockAudio()` | Mengatur audio dan aktivasi melalui interaksi pengguna |
| `showCredits()` | Membuka kredit dalam iframe; aplikasi juga menyediakan halaman kredit terpisah |
| `on('input', callback)` | Mengirim gas, rem, kemudi, nitro, dan permintaan reset yang dinormalisasi |
| `pause`, `resume`, `exit`, `mute` | Event untuk menyelaraskan kontrol iframe dengan antarmuka aplikasi |

`ready` berbeda dengan jaminan setiap model berhasil dimuat: proses awal memakai `Promise.allSettled` agar kegagalan satu aset dapat ditampilkan dengan jelas. Barrier ruang balapan sebaiknya memanggil `ensureModels()` untuk seluruh roster. Pemuatan yang gagal dihapus dari cache promise agar percobaan berikutnya tidak langsung mengulang hasil gagal yang lama.

### Barrier pemuatan arena

Model selesai diunduh tidak otomatis berarti arena sudah siap ditampilkan. Setelah menerima fase `loading`, aplikasi menunggu `startRace()`, menerapkan snapshot grid dari server, lalu memanggil `waitForRaceFrame()`. Metode terakhir memeriksa race ID, token, generasi persiapan, dan tick minimum. Promise baru selesai sesudah renderer menggambar **scene balapan**, kemudian melewati kesempatan animation frame berikutnya; render bengkel dan sekadar decode GLB tidak memenuhi syarat tersebut.

Renderer yang disembunyikan atau tab yang tidak terlihat tidak memberikan acknowledgement frame. Aplikasi induk juga harus memastikan dokumen terlihat sebelum mengirim `arena_ready` ke server. Server memulai fase `countdown` hanya setelah barrier seluruh peserta terpenuhi. Pada fase `loading`, HUD menampilkan “MENUNGGU PEMAIN”, input mengemudi tetap nol, putaran roda berhenti, dan api nitro mati. Angka countdown berasal dari `startAt` dan waktu server pada snapshot; renderer tidak menjalankan hitung mundur mandiri.

`stopRace()`, persiapan race pengganti, dan `dispose()` membatalkan penantian frame dengan `AbortError`. Batas waktu menghasilkan `RendererFrameTimeoutError`. Persiapan model yang lambat juga memeriksa generasi sesudah `await`, sehingga unduhan lama yang baru selesai setelah pengguna keluar tidak dapat membuka kembali arena atau mengganti sirkuit yang baru. `configure()` bekerja sinkron setelah renderer siap; jaringan menangani pembatalan queue, deadline bersama, dan pesan kegagalan.

### Jeda salat bersama

Fase server `prayer_pause` dan `resume_countdown` mempertahankan scene, kamera, roster mobil, material, dan cache aset. Renderer membersihkan tombol yang sedang ditahan saat masuk fase jeda, mengabaikan input gas/rem/kemudi/nitro/reset selama jeda, mematikan suara mengemudi dan api nitro, serta membekukan putaran roda, partikel, dan waktu animasi lingkungan. Kamera tetap dapat menggambar keadaan arena yang tersimpan. Posisi, lap, dan waktu balapan tetap berasal dari snapshot server.

`waitForRaceFrame()` berlaku juga untuk kedua fase tersebut. Pemain yang baru menyambung kembali harus menampilkan snapshot arena yang relevan sebelum aplikasi mengirim persetujuan melanjutkan. Angka hitung mundur lanjutan mengikuti `prayerPause.resumeAt`; angka mencapai nol pada antarmuka tidak mengizinkan renderer menjalankan balapan. Input baru diterima setelah snapshot kembali ke fase `racing`, dan tombol yang tertahan sebelum jeda tidak otomatis aktif kembali.

Antarmuka `Prayer.tsx` menampilkan waktu lokal dari zona waktu server, menyimpan GPS hanya setelah tombol pengguna ditekan, membulatkan koordinat ke dua desimal, dan menampilkan alasan penggunaan lokasi cadangan. Timer pribadi dan timer room menggunakan jangkar waktu server. Tombol “Siap melanjutkan” baru aktif ketika snapshot server melewati batas minimum; hasil pengiriman pesan tidak dianggap sebagai persetujuan yang telah diterima. Daftar `readyIds` dan perubahan fase server tetap menentukan tampilan selanjutnya. Lokasi pribadi tidak ditampilkan pada overlay room.

Kualitas lama yang valid tetap dibaca dari preferensi browser; nilai bawaan tetap `medium`. Renderer tidak menurunkan kualitas ketika hanya warna, model, atau sudut kamera yang diubah. Aplikasi induk dapat mengatur kualitas secara eksplisit. Suasana `dusk` dan `night` tetap berlaku pada tiga sirkuit.

## Menjalankan verifikasi

Dari direktori proyek, setelah dependensi pengembangan terpasang:

```bash
npm ci
npm run test:renderer
npm run test:prayer-ui
```

Pengujian hanya membaca aset yang disertakan dalam proyek. Tidak memerlukan berkas di direktori scratch, layanan akun, PostgreSQL, atau browser. `linkedom` menyediakan DOM dan `@napi-rs/canvas` menjalankan pembuatan tekstur Canvas 2D sebenarnya.

Kasus yang diperiksa meliputi:

1. Identitas SHA-256 delapan GLB dan modul lingkungan yang dipertahankan.
2. Geometri serta parameter material bengkel yang finite, jumlah kelompok/segitiga, area tengah yang bebas, dan kontrak visibilitas kamera.
3. Lima belas kendaraan dengan tiga paket roda, seluruh tingkat detail, batas ban sumber, serta pemulihan geometri dan visibilitas roda asli.
4. Pratinjau, sudut kamera, kualitas yang tidak berubah tanpa permintaan, suasana, kredit, dan barrier pemuatan model.
5. Start, snapshot, input, kamera dan efek kendaraan, penghentian render saat tersembunyi, penolakan snapshot lama, serta stop/return ke bengkel.
6. Tidak ada integrasi posisi, penghitungan lap, atau pencatatan hasil balapan oleh renderer online.
7. Pergantian tiga sirkuit melalui antarmuka publik.
8. Lima pola striping pada kelima belas model: setiap vertex paling jauh 1,52 mm dari segitiga sumber, normal unit, pemisahan kelompok material, pemakaian ulang saat ganti warna, dan pemulihan saat memilih `none`.
9. Perubahan striping saja pada snapshot lawan memperbarui model yang terlihat; tujuh profil audio tersedia dan kamera showroom memuat model yang lebih panjang.
10. Barrier loading tidak selesai sebelum snapshot dan render arena yang terlihat, countdown hanya mengikuti server, penantian dibatalkan saat keluar, dan penyelesaian aset lama tidak membuka ulang race.
11. Jeda salat mempertahankan objek scene dan mobil, membekukan efek serta audio mengemudi, menolak input yang tertahan/eksternal/reset, tetap memenuhi barrier frame untuk pemain yang menyambung kembali, dan melanjutkan hanya setelah fase server berubah.

Suite `test:prayer-ui` menggunakan React dan LinkeDOM dengan batas HTTP terprogram. Kasusnya memeriksa permintaan GPS eksplisit dan pembulatan koordinat; penyimpanan Jakarta ketika GPS gagal; kegagalan penyimpanan; pilihan kota dan koordinat manual pada hook; pembatalan GPS/fetch ketika komponen atau akun berubah; penanganan 401; tampilan zona waktu dan alasan cadangan; serta kesiapan room yang menunggu waktu dan konfirmasi server. Suite ini tidak meminta izin GPS sebenarnya, tidak memanggil layanan geolokasi eksternal, dan tidak menggantikan pengujian perhitungan jadwal/backend.

### Batas verifikasi

Sebagian model tambahan juga diperiksa melalui render Blender Cycles di CPU untuk melihat siluet, bukaan roda, penempatan lampu, dan bentuk panel. Gambar tersebut adalah render inspeksi aset, bukan tangkapan layar renderer Three.js atau bukti tampilan persis di browser.

Harness mengganti `WebGLRenderer` dan `PMREMGenerator` dengan pencatat keadaan. Pengujian ini **bukan pengujian GPU**, bukan tangkapan layar permainan, dan bukan bukti frame rate pada perangkat tertentu. Kompilasi shader oleh driver, hasil akhir pencahayaan/refleksi, antialiasing, kualitas bayangan, audio yang benar-benar terdengar, dan kelancaran 15 kendaraan perlu diperiksa pada browser/perangkat sasaran.

Pengujian batas roda menggunakan geometri dan envelope sumber; ini bukan simulasi suspensi atau pemeriksaan kontak ban yang baru. Mobil serta lingkungan tetap memiliki detail asli, sehingga pilihan kualitas masih penting pada perangkat dengan GPU terbatas. Paket roda tidak mengubah statistik performa; perubahan performa mengikuti konfigurasi permainan yang disahkan server.
