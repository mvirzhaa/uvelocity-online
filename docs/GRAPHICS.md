# Grafis, bengkel 3D, dan verifikasi UVelocity

## Yang dipertahankan

UVelocity menggunakan delapan model kendaraan dan tiga lingkungan dari versi World Tour yang sudah ada. Berkas GLB dipindahkan dari data base64 di dalam HTML menjadi aset statis terpisah di `public/game/assets/cars/`. Geometri dan tekstur yang tersimpan dalam kedelapan GLB **tidak diubah**. Total berkas model sekitar 30,7 MB sebelum kompresi HTTP.

Model yang tersedia adalah Veloce R, Apex GT, Cinder V8, Kaze Rally, Lamborghini Aventador, Nissan Skyline R34, Subaru BRZ, dan Bugatti Veyron Polisi 77. Modul arsitektur kota, bioma pantai dan gunung es, aksesori Polisi 77, serta model cadangan juga dipertahankan byte demi byte. Acuan SHA-256 untuk aset tersebut tersedia di `tests/renderer/asset-hashes.json`.

Three.js r128 dan GLTFLoader disajikan dari `public/game/vendor/`. Tidak ada CDN yang diperlukan saat menjalankan renderer. Aset model dimuat melalui `NV_MODEL_URLS`, sehingga browser dapat menyimpan GLB dalam cache tanpa mem-parsing ulang puluhan megabita base64 dari halaman HTML. Sintesis mesin dan profil suara tiap kendaraan tetap menggunakan kode audio sebelumnya.

Kredit pencipta model dan lisensinya tetap tersedia dalam halaman kredit aplikasi serta `public/game/assets/CREDITS.txt`. Lisensi Three.js tersedia di direktori vendor.

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

`public/game/wheel-customization.js` menyediakan empat pilihan:

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
| `getCatalog()` | Memberikan status `loaded` tiap mobil |
| `preview(loadout)` / `setLoadout(loadout)` | Menampilkan mobil, cat, finishing, dan paket roda di bengkel |
| `configure({quality,timeOfDay,...})` | Mengubah pengaturan yang secara eksplisit diberikan |
| `setCamera('front'|'side'|'rear')` | Mengatur sudut showroom |
| `setCamera()` | Mengganti sudut showroom atau kamera balapan, mengikuti mode aktif |
| `startRace(...)` / `applySnapshot(...)` | Menyiapkan roster dan menampilkan keadaan balapan dari aplikasi induk |
| `stopRace()` | Melepaskan model balapan dan kembali ke bengkel |
| `setVisible(false)` | Menghentikan render dan audio sementara tanpa membuang cache aset |
| `setMuted(...)`, `previewEngine()`, `unlockAudio()` | Mengatur audio dan aktivasi melalui interaksi pengguna |
| `showCredits()` | Membuka kredit dalam iframe; aplikasi juga menyediakan halaman kredit terpisah |
| `on('input', callback)` | Mengirim gas, rem, kemudi, nitro, dan permintaan reset yang dinormalisasi |
| `pause`, `resume`, `exit`, `mute` | Event untuk menyelaraskan kontrol iframe dengan antarmuka aplikasi |

`ready` berbeda dengan jaminan setiap model berhasil dimuat: proses awal memakai `Promise.allSettled` agar kegagalan satu aset dapat ditampilkan dengan jelas. Barrier ruang balapan sebaiknya memanggil `ensureModels()` untuk seluruh roster. Pemuatan yang gagal dihapus dari cache promise agar percobaan berikutnya tidak langsung mengulang hasil gagal yang lama.

Kualitas lama yang valid tetap dibaca dari preferensi browser; nilai bawaan tetap `medium`. Renderer tidak menurunkan kualitas ketika hanya warna, model, atau sudut kamera yang diubah. Aplikasi induk dapat mengatur kualitas secara eksplisit. Suasana `dusk` dan `night` tetap berlaku pada tiga sirkuit.

## Menjalankan verifikasi

Dari direktori proyek, setelah dependensi pengembangan terpasang:

```bash
npm ci
node tests/renderer/verify.cjs
```

Pengujian hanya membaca aset yang disertakan dalam proyek. Tidak memerlukan berkas di direktori scratch, layanan akun, PostgreSQL, atau browser. `linkedom` menyediakan DOM dan `@napi-rs/canvas` menjalankan pembuatan tekstur Canvas 2D sebenarnya.

Kasus yang diperiksa meliputi:

1. Identitas SHA-256 delapan GLB dan modul lingkungan yang dipertahankan.
2. Geometri serta parameter material bengkel yang finite, jumlah kelompok/segitiga, area tengah yang bebas, dan kontrak visibilitas kamera.
3. Delapan kendaraan dengan tiga paket roda, seluruh tingkat detail, batas ban sumber, serta pemulihan geometri dan visibilitas roda asli.
4. Pratinjau, sudut kamera, kualitas yang tidak berubah tanpa permintaan, suasana, kredit, dan barrier pemuatan model.
5. Start, snapshot, input, kamera dan efek kendaraan, penghentian render saat tersembunyi, penolakan snapshot lama, serta stop/return ke bengkel.
6. Tidak ada integrasi posisi, penghitungan lap, atau pencatatan hasil balapan oleh renderer online.
7. Pergantian tiga sirkuit melalui antarmuka publik.

### Batas verifikasi

Harness mengganti `WebGLRenderer` dan `PMREMGenerator` dengan pencatat keadaan. Pengujian ini **bukan pengujian GPU**, bukan tangkapan layar permainan, dan bukan bukti frame rate pada perangkat tertentu. Kompilasi shader oleh driver, hasil akhir pencahayaan/refleksi, antialiasing, kualitas bayangan, audio yang benar-benar terdengar, dan kelancaran 15 kendaraan perlu diperiksa pada browser/perangkat sasaran.

Pengujian batas roda menggunakan geometri dan envelope sumber; ini bukan simulasi suspensi atau pemeriksaan kontak ban yang baru. Mobil serta lingkungan tetap memiliki detail asli, sehingga pilihan kualitas masih penting pada perangkat dengan GPU terbatas. Paket roda tidak mengubah statistik performa; perubahan performa mengikuti konfigurasi permainan yang disahkan server.
