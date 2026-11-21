# Grafis, kendaraan, striping, dan bengkel 3D UVelocity

## Yang dipertahankan

UVelocity mempertahankan delapan model kendaraan dan tiga lingkungan dari versi World Tour. Versi 1.1 menambahkan tujuh rekonstruksi kendaraan; versi **1.3.0** memperbarui dua di antaranya sesuai foto terbaru (Koenigsegg Regera dan Hennessey Venom F5) serta menambahkan **Isuzu Panther Grand Touring**. Versi **1.3.1** membangun ulang geometri Panther berdasarkan empat foto pengguna. Versi **1.4.0** mempertahankan seluruh 16 GLB dari 1.3.1 dan memperbarui lingkungan bengkel menjadi futuristis. Total katalog tetap **16 model 3D**, dengan jumlah berkas GLB **63.484.360 byte** (sekitar **63,5 MB**) sebelum kompresi transfer. Semua GLB disajikan sebagai aset statis terpisah di `public/game/assets/cars/`.

**Lima belas GLB dari paket 1.3.0 dipertahankan byte demi byte.** Revisi 1.3.1 mengganti hanya model Panther. Modul arsitektur kota, bioma pantai dan gunung es, aksesori Polisi 77, serta model cadangan juga tetap identik. Sebagai riwayat, revisi 1.3.0 mempertahankan 13 GLB dari 1.2.0: delapan model World Tour (Veloce R, Apex GT, Cinder V8, Kaze Rally, Aventador, Skyline R34, BRZ, Veyron Polisi 77), empat model BMW/Mercedes, dan Batmobile; dua hypercar direvisi dan Panther ditambahkan pada versi tersebut. `tests/renderer/asset-hashes.json` mencatat identitas seluruh aset.

Three.js r128 dan GLTFLoader disajikan dari `public/game/vendor/`. Tidak ada CDN yang diperlukan saat menjalankan renderer. Aset model dimuat melalui `NV_MODEL_URLS`, sehingga browser dapat menyimpan GLB dalam cache tanpa mem-parsing ulang puluhan megabita base64 dari halaman HTML. Sintesis mesin dan delapan profil suara lama tetap menggunakan kode sebelumnya. Delapan profil tambahan memakai parameter sintesis sendiri; Batmobile memakai karakter turbin fiksi, dan Panther memakai karakter diesel empat silinder dengan rentang RPM lebih rendah serta turbo lembut. Suara tambahan bukan rekaman mesin asli, dan parameter RPM, perpindahan gigi, serta resonansinya merupakan penyetelan permainan.

Kredit pencipta model dan lisensinya tetap tersedia dalam halaman kredit aplikasi serta `public/game/assets/CREDITS.txt`. Lisensi Three.js tersedia di direktori vendor.

## Delapan rekonstruksi kendaraan tambahan

Delapan model berikut dibuat dari geometri asli untuk UVelocity dengan mengacu pada gambar pengguna. Model ini **bukan mesh resmi pabrikan, hasil pemindaian, atau aset yang diambil dari permainan lain**. Katalog menandainya sebagai `reference-recreation`; GLB dan metadata pembuatannya juga menyimpan asal-usul tersebut.

| ID | Kendaraan referensi | Pembeda bentuk yang dituju |
| --- | --- | --- |
| `bmw-hybrid-v8` | BMW M Hybrid V8 | Hidung twin-kidney prototype, kokpit rendah, sirip tengah, sayap balap |
| `bmw-m4-gt4` | BMW M4 GT4 F82 | Grille kompak F82, garis coupe lebih tinggi, ventilasi dan sayap sirkuit |
| `amg-gt4` | Mercedes-AMG GT4 | Kap panjang, grille vertikal, atap fastback rendah |
| `sls-amg-gt3` | Mercedes-Benz SLS AMG GT3 | Kap panjang, lampu tegak, grille horizontal, garis atap gullwing |
| `batmobile-1989` | Batmobile 1989 | Intake turbin bundar, bodi memanjang, kanopi dan sirip belakang |
| `jesko-absolut` | Koenigsegg Regera | Kanopi tertutup melengkung, lampu tetesan, intake samping panjang, sayap belakang melintang |
| `venom-f5` | Hennessey Venom F5 | Fender depan tinggi, lampu memanjang, bukaan depan besar, kokpit terbuka, scoop dan sayap sesuai foto ungu |
| `panther-grand-touring` | Isuzu Panther Grand Touring | Kap dan sudut bodi melengkung, lampu reflektor besar, gril trapezoid krom, tiga kaca samping bersudut bulat, pintu bagasi berlekuk, lampu belakang melingkupi sudut, roof rail dan pijakan samping |

**Kompatibilitas Koenigsegg:** foto terbaru mengarah ke Regera. Nama tampilannya diselaraskan, tetapi ID historis `jesko-absolut` tetap digunakan supaya inventory, foto admin, tampilan berbayar, dan riwayat balapan lama tetap terhubung. Nama operator yang sudah dikustomisasi tidak ditimpa. Parameter performa lama juga tidak direset hanya karena bentuk dan label diperbarui.

Geometri dibangun menggunakan helper pada `scripts/modeling-kit.cjs` dan script pembentuk kendaraan. Permukaan bodi, kaca, karbon, lampu, roda, dan kaliper menggunakan material terpisah. Bukaan roda dibentuk pada panel bodi; ban bukan sekadar ditempel pada sisi kotak tertutup. Semua model memakai satuan meter, sumbu +Y ke atas, dan +Z ke depan.

Empat roda dan dua pivot kemudi diekspor sebagai node terpisah. Roda kustom tetap diukur dari ban model masing-masing; kaliper belakang pada model tambahan disimpan pada axle yang tidak ikut body roll. Titik lampu dan exhaust berasal dari metadata model, termasuk exhaust tengah tunggal untuk model yang memerlukannya. Jarak kamera bengkel dan thumbnail bertambah untuk model panjang; framing delapan model lama tetap sama.

Ukuran, top speed, akselerasi, dan handling dalam aplikasi merupakan data visual atau keseimbangan permainan. Angka performa tersebut tidak disajikan sebagai pengukuran kendaraan produksi atau homologasi balap.

## Rebuild Panther 1.3.1

Rujukan terdiri dari foto kendaraan gelap dari depan-samping, serta kendaraan putih dari depan, belakang, dan belakang-samping. Perbedaan warna dipakai untuk membaca bentuk dan sambungan panel. Cat bawaan tetap `#19252e`; material cat dan pelek tetap mengikuti konfigurasi tersimpan pemain.

| Bagian | Perubahan geometri |
| --- | --- |
| Bodi dan kabin | Kap cembung halus yang mengalir ke fender, hidung melengkung, atap dan kemiringan kaca ditinjau kembali, bukaan roda tetap nyata |
| Lampu depan dan gril | Housing trapezoid mengikuti sudut bodi, beberapa mangkuk reflektor, lensa terpisah, bingkai gril krom miring dan palang tengah |
| Bumper depan | Permukaan cetakan melengkung, rumah fog lamp diagonal, lampu bundar dalam lekukan |
| Kaca dan sisi bodi | Tiga bukaan kaca dengan sudut membulat, kaca kuarter inset, panel pilar, moulding dan fender lebih berisi, gagang krom kecil |
| Pelek dan aksesori | Bukaan alloy membulat, hub dan baut, spion persegi membulat, roof rail rendah, running board bertapak |
| Bagasi dan lampu belakang | Dudukan pelat hitam yang masuk ke panel bagasi, garnish krom, lampu vertikal bening/merah melingkupi sudut bodi |
| Bagian belakang lainnya | Kaca trapezoid membulat, wiper, spoiler atap, bumper dua warna dengan pijakan dan reflektor bawah |

Builder berada di `scripts/build-panther.cjs`. Titik roda, lampu, exhaust, serta batas model disimpan bersama GLB dalam metadata. Identitas `panther-grand-touring` dan slot cat/pelek dipertahankan; tidak ada kendaraan baru, migrasi tambahan, atau perubahan tuning dalam revisi ini.

Ekspor Panther akhir berukuran **7.949.596 byte / 7,58 MiB**, dengan **236.843 segitiga, 35 mesh, dan 44 node**. Empat roda dan dua pivot kemudi tetap terpisah. Ukuran tersebut mencatat aset yang diekspor dan bukan benchmark FPS. Detail tambahan menaikkan ukuran Panther dibanding aset 1.3.0; hasil pada perangkat sasaran perlu diperiksa dengan pilihan kualitas game yang sesuai.

Render inspeksi menggunakan GLB hasil ekspor, termasuk tampilan samping untuk memeriksa siluet. Pencahayaan studio dan posisi kamera tidak sama dengan garasi Three.js. Bentuk ini merupakan rekonstruksi dari foto, bukan pengukuran CAD atau jaminan kesamaan seluruh detail yang tidak tampak pada rujukan.

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

Geometri perlengkapan digabung per material. Bengkel versi **1.4.0** berisi **98 kelompok mesh/material dan 28.820 segitiga**, sebelum menghitung mobil, lintasan, bayangan, maupun proses pembuatan peta lingkungan. Angka tersebut adalah hitungan geometri; jumlah panggilan GPU pada suatu frame dapat berbeda karena bayangan, pemotongan objek di luar kamera, dan peta lingkungan.

Bengkel futuristis 1.4.0 menggunakan palet blue-gray, garis lampu cyan di dinding/lantai, tiga cincin elips bercahaya di bawah kendaraan, serta dua lengan robot bersegmen pada kedua sisi. Semua elemen merupakan geometri Three.js, bukan gambar overlay. Kabinet, rak ban, lift, kompresor, dan perlengkapan lama tetap dipertahankan. Robot setinggi 2,10 m berada di luar bay: bagian terdekat pada x = ±3,235 m. Geometri cahaya lantai paling tinggi Y = 0,009 m; bay tengah 6,2 × 8,2 m tetap bebas. Key light 2,05 dan ambient 0,68 mempertahankan penerangan kendaraan. Penghitungan geometri tetap memenuhi guard lama: kurang dari 100 kelompok dan 70.000 segitiga, tanpa klaim FPS perangkat.

Pada UI ponsel ≤760 px, nama mobil dan pemilih kamera berada **di bawah viewport 3D** melalui alur dokumen normal. Nama berukuran 16 px, menjadi 14 px pada ≤420 px. Caption tidak menutup gambar mobil; penempatan desktop tetap sebagai caption bawah pratinjau. Pilihan kamera aktif diberi keadaan `aria-pressed` dan aksen emas. Lebar panel konfigurasi desktop menyesuaikan 316–480 px, dengan navigasi dan pengaturan tetap sejajar.

Refleksi cat dan krom berasal dari peta lingkungan PMREM yang dibuat menggunakan ruang bengkel sebenarnya sebelum mobil ditambahkan. Lantai, jendela, dan lampu kerja ikut membentuk refleksi. Kualitas grafis rendah mengurangi perlengkapan tambahan; pengaturan bayangan dan resolusi tetap mengikuti pilihan kualitas aplikasi.

Mode iframe memakai posisi vertikal kamera yang disesuaikan dengan keterangan kendaraan di aplikasi. Ukuran model, FOV dasar, rotasi kamera, dan kemampuan zoom tetap tersedia. Kontrol garasi lama disembunyikan agar tidak bertumpuk dengan kontrol aplikasi.

## Paket roda dan penyimpanan roda asli

`public/game/wheel-customization.js` menyediakan empat pilihan untuk keenam belas kendaraan:

| ID | Pilihan | Geometri |
| --- | --- | --- |
| `stock` | Original | Roda bawaan model, termasuk material aslinya |
| `six-spoke` | Forge Six | Enam palang dengan profil cekung |
| `multi-spoke` | Touring Twelve | Dua belas palang tipis |
| `mesh` | Cross Mesh | Palang silang dengan bibir poles dan detail baut |

Tiga paket baru menggunakan geometri ban, palang, bibir velg, bagian dalam velg, katup, dan detail logam. Ban memakai material karet dengan pola alur dan kekasaran. Warna palang dapat diubah melalui `rimColor`; bagian logam yang dipoles tetap mempertahankan materialnya.

Ukuran paket diukur dari ban setiap roda kendaraan, termasuk perbedaan roda depan dan belakang. Ini juga memperhitungkan transformasi GLB dan posisi Int16 yang dinormalisasi pada BRZ. Komponen tambahan dalam sebuah subtree roda tidak otomatis dianggap sebagai ukuran ban. Paket baru dibuat sedikit lebih kecil daripada batas ban sumber untuk menjaga kompatibilitas dengan ruang roda.

Roda asli tidak dihapus atau ditulis ulang. Mesh roda yang diganti disembunyikan, sementara pivot kemudi dan putaran tetap digunakan. Cakram dan kaliper asli yang terpisah dipertahankan. Memilih `stock` memulihkan visibilitas semula. Veyron memiliki ban dan velg bawaan dalam satu primitive; model ini menerima penggantian satu set roda utuh, tanpa memotong ulang bodi atau tekstur aslinya.

### Cat pelek bawaan dan pilihan RGB

`rimColor` menyimpan warna RGB pelek pada setiap kendaraan. Pada tiga paket kustom, warna tetap diterapkan ke material palang paket. Pada pelek bawaan, penerapannya ditentukan oleh `stockRimPainted`: nilai yang hilang atau `false` mempertahankan material pabrik, sedangkan `true` menerapkan warna yang dipilih. Dengan demikian, nilai `rimColor` bawaan pada akun lama tidak langsung mengecat pelek aslinya. Memilih warna yang sama persis dengan RGB bawaan tetap dapat menjadi pilihan cat eksplisit. Aplikasi/server menentukan penawaran, biaya, saldo, serta penerapan; renderer hanya menampilkan preview atau tampilan resmi yang diterima.

Empat belas model memiliki slot material sumber `rim_paint*`. Hanya slot tersebut yang memperoleh salinan material milik kendaraan itu sendiri. Ban, sidewall, cakram, kaliper, baut, dan bagian bibir pelek yang memakai material tersendiri tetap memakai material semula. Warna RGB dikonversi sekali dari sRGB ke ruang linear renderer; tekstur detail dan normal yang sudah ada tetap dipakai tanpa diubah. Warna piksel akhir mengikuti pencahayaan, refleksi, dan tone mapping, sehingga bukan warna datar tanpa bayangan.

Veyron memakai satu primitive bertekstur yang menggabungkan pelek, ban, dan beberapa detail rem. Modul memeriksa atlas sumber dan memisahkan **segitiga yang seluruh koordinat UV-nya berada pada pulau cat pelek**. Pemisahan ini memakai salinan geometri/index pada runtime: vertex, normal, UV, posisi ban, dan mesh GLB sumber tetap utuh. Kelompok pertama mempertahankan material/tekstur asli untuk ban, rem, logo, dan baut; kelompok kedua memakai salinan material cat. Pada kelompok cat saja, albedo oranye yang tertanam di atlas dilepas supaya pilihan RGB baru tidak dikalikan dengan warna lama; peta normal tetap dipakai. Segitiga yang melintasi batas mask secara konservatif tetap memakai material asli; pada keempat roda sumber saat ini tidak ada segitiga yang melintasi batas tersebut.

| Roda Veyron | Segitiga pelek yang dicat | Segitiga yang mempertahankan material sumber |
| --- | ---: | ---: |
| Depan kiri | 4.336 | 2.550 |
| Depan kanan | 4.409 | 2.578 |
| Belakang kiri | 4.743 | 2.573 |
| Belakang kanan | 4.805 | 2.539 |

Uji menyimpan rentang segitiga sumber yang telah diperiksa secara terpisah dari fungsi pemilahan runtime, lalu membandingkan setiap index hasil pemisahan. Dua mobil dengan model sama memperoleh material cat tersendiri; mengecat atau menghapus satu tidak mengubah warna, tekstur, atau geometri mobil lainnya. Memilih paket kustom memulihkan material pelek sumber yang sedang disembunyikan, kembali ke pelek bawaan menerapkan flag resmi, dan pemulihan pabrik (`false`) mengembalikan objek material/geometri semula. Salinan material dan pemisahan geometri dibuang ketika kendaraan dilepas. Berkas GLB maupun tekstur sumber tidak ditulis ulang.

Flag ini termasuk dalam identitas tampilan renderer dan loadout balapan. Perubahan flag saja—meskipun RGB tetap sama—memperbarui mobil lokal atau lawan. Snapshot identik memakai ulang model, sementara pemulihan tampilan tetap kompatibel dengan kamera dashboard dan pergantian kendaraan. Biaya mengecat, mengganti warna striping, atau memulihkan cat pabrik berasal dari katalog/penawaran server; renderer tidak mengurangi saldo dan tidak menyimpan hak pembelian.

Geometri paket dibagi melalui cache dengan penghitungan referensi. Material warna dimiliki tiap kendaraan. Paket memiliki tiga tingkat detail dengan perpindahan sekitar 32 dan 86 meter. Cache model sumber tetap terpisah dari kepemilikan geometri baru, sehingga mengganti atau menghapus satu kendaraan tidak merusak kendaraan lain.

## Kamera dashboard / interior

Balapan menyediakan empat sudut: **Chase, Hood, Close, dan Dashboard**. Tombol **C** atau tombol kamera pada layar mengurutkan keempatnya. Aplikasi dapat langsung memilih dashboard melalui `setCamera('interior')`; `setCamera('dashboard')` diterima sebagai alias. Kamera bengkel depan/samping/belakang tetap menggunakan API sebelumnya.

`public/game/cockpit.js` membuat kokpit 3D milik UVelocity untuk semua enam belas kendaraan. Ukuran dashboard, posisi kursi, dan tinggi mata pengemudi mengikuti dimensi model. Panther memiliki posisi pengemudi di kanan dan titik pandang lebih tinggi, dengan dashboard yang disesuaikan dengan lebar kabin MPV. Kendaraan GT/prototype mendapat detail rangka pengaman dan prototype memakai setir yang lebih pipih. Kokpit berisi fascia melengkung, trim, bukaan kaca depan dengan pilar, ventilasi, konsol, setir dengan palang dan paddle, serta layar kecepatan, gigi, dan lap. **Interior ini merupakan geometri prosedural buatan permainan, bukan hasil pemindaian atau replika interior resmi pabrikan.**

Kamera ditempatkan pada mata pengemudi di dalam kokpit yang sama, mengikuti posisi dan arah kendaraan. Menggeser mouse memutar pandangan dari kursi tersebut. Rentang FOV dashboard lebih terbatas daripada kamera luar agar dashboard tidak menjauh berlebihan ketika nitro aktif. Near clipping turun menjadi 2,5 cm selama tampilan interior dan kembali menjadi 7 cm pada kamera balapan lainnya. Dashboard memakai material fisik, detail normal pada trim, cahaya kabin lembut tanpa peta bayangan tambahan, serta instrumen emisif yang tetap terbaca pada suasana malam.

Setir memakai `steerAngle` dari keadaan kendaraan yang diterapkan renderer—termasuk hasil prediksi/rekonsiliasi aplikasi—sehingga input keyboard saja tidak memutar setir sebelum keadaan kemudi berubah. Sudut jalan dibatasi ±0,62 radian, lalu dikalikan 6,3 untuk sudut visual setir. Tanda di tengah setir bergerak ke kiri layar ketika mobil membelok kiri dan sebaliknya. Batas ini merupakan penyetelan visual permainan, bukan rasio kemudi pabrikan. Speedometer mengikuti kecepatan snapshot; tampilan gigi memakai transmisi visual renderer yang sudah ada.

Ketika memakai Hood atau Dashboard, visibilitas assembly eksterior pemain disimpan lalu disembunyikan sementara supaya atap, kaca gelap, atau roda sumber tidak menutup pandangan. Mesh, material, cat, pelek, dan vinyl sumber tidak diubah. Lampu depan tetap aktif, kendaraan pemain lain tetap tampil, dan nilai visibilitas sebelumnya dipulihkan saat beralih ke kamera luar. Kokpit hanya dibuat saat diperlukan untuk mobil yang menjadi sudut pandang pemain; geometri dan teksturnya dibuang saat mobil diganti atau balapan ditutup. Kokpit biasa memiliki 42 mesh dan 5.716 segitiga; versi dengan rangka balap memiliki 44 mesh dan 5.812 segitiga. Ini merupakan hitungan geometri, bukan pengukuran performa GPU.

Selama `prayer_pause` dan `resume_countdown`, tombol C, tombol kamera, API pemilihan kamera, dan geser pandangan dikunci. Kokpit, sudut setir, serta posisi kamera yang tersimpan tetap digambar; tidak ada pembangunan ulang scene. Pemain yang menyambung kembali tetap dapat menampilkan snapshot jeda dan memenuhi barrier frame. Setelah fase `racing` diterima, pilihan kamera kembali dapat digunakan. Keluar balapan mengembalikan keadaan kamera ke Chase.

Uji portabel memeriksa geometri kokpit keenam belas model, posisi mata, setir di dalam frustum, arah putaran, batas sudut, koridor kaca depan melalui ray casting pada rasio 16:9, 4:3, dan 9:16, serta pelepasan sumber daya. Uji integrasi renderer memeriksa snapshot kemudi, keyboard/tombol/API kamera, pemulihan eksterior, near clip, loading barrier pada interior, dan pembekuan dashboard ketika jeda salat. Pemeriksaan tersebut memvalidasi struktur dan perilaku renderer; hasil kualitas pencahayaan/piksel memerlukan penilaian WebGL di browser nyata.

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
| `setCamera('chase'|'hood'|'close'|'interior')` | Memilih kamera balapan; `dashboard` merupakan alias `interior` |
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

### Finish dan perlambatan di belakang hasil

Begitu pemain dinyatakan `finished` atau `dnf` oleh server, renderer membersihkan tombol yang sedang ditahan dan menolak gas, rem, kemudi, nitro, serta reset. Kamera tetap tersedia. Efek api nitro, getaran nitro, dan efek tabrakan bagi pembalap yang telah selesai dihentikan. Selama manusia lain masih berlomba, posisi, arah, dan kecepatan mobil yang sudah finish tetap diambil langsung dari snapshot perlambatan server. Renderer tidak menghitung ulang posisi, lap, atau hasilnya.

Fase server `settling` atau `finished` langsung diteruskan ke aplikasi. Panel hasil tidak menunggu animasi mobil atau bot selesai. Setelah snapshot akhir, renderer membuat pose visual tersendiri selama **3 detik**: mobil mengikuti bentuk lintasan dari `trackT` terakhir, mempertahankan offset awal dari pusat jalan, dan kecepatannya turun monoton hingga nol. Putaran roda, kamera, HUD, instrumen dashboard, dan suara mesin mengikuti pose visual itu. Gas dan nitro tetap nol; suara putaran turun lalu berhenti ketika mobil diam. Pose ini tidak memiliki badan tabrakan dan tidak mengubah posisi/speed resmi, lap, waktu, peringkat, uang, maupun isi hasil server.

Peralihan `settling` ke `finished` atau pengiriman ulang snapshot hasil tidak mengulang animasi. Tab tersembunyi, penghentian renderer, menu jeda, atau jeda salat tidak membuat waktu animasi berjalan diam-diam. Jika fase salat diterima ketika animasi penutup masih berjalan, posisi, putaran roda, dan durasinya dibekukan hingga fase hasil kembali diterima. Keluar balapan membuang seluruh objek balapan dan pose visualnya. Aplikasi mempertahankan iframe renderer di belakang panel hasil sehingga perlambatan masih terlihat.

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

1. Identitas SHA-256 16 GLB: 15 aset dipertahankan dari versi 1.3.0, satu Panther dibangun ulang pada 1.3.1, serta modul lingkungan yang dipertahankan.
2. Geometri serta parameter material bengkel yang finite, jumlah kelompok/segitiga, area tengah yang bebas, dan kontrak visibilitas kamera.
3. Enam belas kendaraan dengan tiga paket roda, seluruh tingkat detail, batas ban sumber, serta pemulihan geometri dan visibilitas roda asli.
4. Pratinjau, sudut kamera, kualitas yang tidak berubah tanpa permintaan, suasana, kredit, dan barrier pemuatan model.
5. Start, snapshot, input, kamera dan efek kendaraan, penghentian render saat tersembunyi, penolakan snapshot lama, serta stop/return ke bengkel.
6. Tidak ada integrasi posisi, penghitungan lap, atau pencatatan hasil balapan oleh renderer online.
7. Pergantian tiga sirkuit melalui antarmuka publik.
8. Lima pola striping pada keenam belas model: setiap vertex paling jauh 1,52 mm dari segitiga sumber, normal unit, pemisahan kelompok material, pemakaian ulang saat ganti warna, dan pemulihan saat memilih `none`.
9. Perubahan striping saja pada snapshot lawan memperbarui model yang terlihat; delapan profil audio tambahan tersedia dan kamera showroom memuat model yang lebih panjang.
10. Barrier loading tidak selesai sebelum snapshot dan render arena yang terlihat, countdown hanya mengikuti server, penantian dibatalkan saat keluar, dan penyelesaian aset lama tidak membuka ulang race.
11. Jeda salat mempertahankan objek scene dan mobil, membekukan efek serta audio mengemudi, menolak input yang tertahan/eksternal/reset, tetap memenuhi barrier frame untuk pemain yang menyambung kembali, dan melanjutkan hanya setelah fase server berubah.
12. Cat pelek bawaan pada enam belas model: kondisi pabrik akun lama, pilihan RGB bawaan yang eksplisit, isolasi segitiga Veyron, material ban/rem yang utuh, dua kendaraan yang tidak saling memengaruhi, transisi paket/pabrik, pelepasan sumber daya, dan perubahan flag pada snapshot.

Untuk memeriksa perubahan cat pelek beserta kontrak renderer online tanpa mengulang pembuatan semua pola vinyl:

```bash
node tests/renderer/verify.cjs --stock-paint-only
```

Suite `test:prayer-ui` menggunakan React dan LinkeDOM dengan batas HTTP terprogram. Kasusnya memeriksa permintaan GPS eksplisit dan pembulatan koordinat; penyimpanan Jakarta ketika GPS gagal; kegagalan penyimpanan; pilihan kota dan koordinat manual pada hook; pembatalan GPS/fetch ketika komponen atau akun berubah; penanganan 401; tampilan zona waktu dan alasan cadangan; serta kesiapan room yang menunggu waktu dan konfirmasi server. Suite ini tidak meminta izin GPS sebenarnya, tidak memanggil layanan geolokasi eksternal, dan tidak menggantikan pengujian perhitungan jadwal/backend.

### Batas verifikasi

Model tambahan juga diperiksa melalui render Blender Cycles di CPU untuk melihat siluet, bukaan roda, penempatan lampu, dan bentuk panel. Gambar tersebut adalah render inspeksi aset, bukan tangkapan layar renderer Three.js atau bukti tampilan persis di browser. `docs/previews/` berisi render Panther 1.3.1 dari depan/samping/belakang, serta render Regera dan Venom yang dipertahankan dari 1.3.0.

Harness mengganti `WebGLRenderer` dan `PMREMGenerator` dengan pencatat keadaan. Pengujian ini **bukan pengujian GPU**, bukan tangkapan layar permainan, dan bukan bukti frame rate pada perangkat tertentu. Kompilasi shader oleh driver, hasil akhir pencahayaan/refleksi, antialiasing, kualitas bayangan, audio yang benar-benar terdengar, dan kelancaran 15 kendaraan perlu diperiksa pada browser/perangkat sasaran.

Khusus cat pelek Veyron, uji membuktikan pemisahan index, atribut geometri, dan material/tekstur yang dipertahankan. Uji tersebut tidak membuktikan penampilan cat yang fotorealistis atau kecocokan warna layar pada GPU tertentu; evaluasi visual akhir masih memerlukan WebGL pada browser sasaran.

Pengujian batas roda menggunakan geometri dan envelope sumber; ini bukan simulasi suspensi atau pemeriksaan kontak ban yang baru. Mobil serta lingkungan tetap memiliki detail asli, sehingga pilihan kualitas masih penting pada perangkat dengan GPU terbatas. Paket roda tidak mengubah statistik performa; perubahan performa mengikuti konfigurasi permainan yang disahkan server.
