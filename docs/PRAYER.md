# Jeda salat bersama

UVelocity menghentikan **satu ruang permainan** ketika jadwal Subuh, Zuhur, Asar, Magrib, atau Isya salah satu anggotanya masuk. Jeda diputuskan server. Semua pemain di ruang tersebut mengikuti jeda yang sama, termasuk pemain dengan jadwal lokal berbeda. Ruang lain tetap mengikuti jadwal anggotanya sendiri.

## Pengalaman pemain

1. Buka **Profil → Lokasi waktu salat**. Gunakan lokasi perangkat melalui tombol GPS atau pilih salah satu dari 44 kota secara manual. Jakarta digunakan sebagai lokasi awal dan cadangan ketika lokasi perangkat tidak diperoleh.
2. Saat jadwal salah satu anggota masuk, ruang menampilkan **Jeda salat bersama**. Mobil manusia, bot, lap, nitro, dan waktu balapan berhenti pada keadaan server terakhir. Kontrol balap, menu, dan navigasi aplikasi terkunci di balik layar jeda; adegan 3D tetap dimuat.
3. Jeda ruang berlangsung **sekurang-kurangnya 15 menit sejak server membekukan permainan**. Batasnya tidak lebih awal dari waktu salat pemicu ditambah 15 menit. Jika jadwal anggota lain masuk, ruang kembali memberi minimum 15 menit untuk pemicu baru.
4. Sesudah batas tersebut, setiap peserta manusia yang masih berada di ruang menekan **Siap melanjutkan**. Tidak ada persetujuan otomatis dari host, habisnya timer, refresh halaman, atau timer di browser.
5. Setelah seluruh peserta yang diwajibkan sudah siap, server menetapkan hitungan mundur bersama selama **3 detik**. Mobil tetap beku sampai server mengembalikan fase balapan berjalan.

Pemain dapat memilih keluar dari ruang. Keluar sebelum finish mengikuti aturan DNF dan tidak mendapat hadiah. Sambungan yang terputus sementara mendapat kesempatan reconnect; pemain tersebut harus menyatakan siap lagi. Peserta yang benar-benar keluar atau habis kesempatan reconnect tidak lagi menahan kesiapan peserta yang masih berada di ruang. Pemain yang masih terhubung tetapi belum menekan Siap tetap menahan balapan; host tidak memiliki tombol untuk mengabaikannya.

## Hubungan dengan persiapan arena

| Keadaan ketika waktu salat masuk | Selama jeda | Setelah semua siap |
| --- | --- | --- |
| Lobi | Lobi ditahan; pemain baru tidak masuk ke ruang yang dijeda | Kembali ke lobi dan pilih Siap untuk start normal |
| Memuat arena | Upaya pemuatan/start dibatalkan secara aman; token lama tidak berlaku | Kembali ke lobi lalu ulangi barrier pemuatan semua perangkat |
| Hitungan start sebelum lampu hijau | Grid dan hitungan start ditahan | Hitungan 3 detik bersama sebelum mulai |
| Balapan berjalan | Posisi, fisika, lap, serta waktu simulasi seluruh peserta dibekukan | Hitungan 3 detik bersama lalu melanjutkan posisi terakhir |

Jeda tidak menghapus cookie, memaksa logout, atau mengeluarkan pemain dari pertandingan. Refresh halaman tetap memakai mekanisme reconnect biasa dan tunduk pada jangka waktu reconnect server. Memulai ulang proses server tetap mengakhiri pertandingan yang berada dalam memori, sesuai batas operasional versi ini; **lokasi akun dan batas jeda pribadi yang sedang aktif tetap tersimpan di PostgreSQL**.

## Lokasi dan perhitungan

- Lokasi perangkat diminta satu kali ketika pemain menekan tombol. Tidak ada pelacakan perjalanan secara terus-menerus. Koordinat GPS dan koordinat yang diketik dibulatkan ke dua angka desimal sebelum disimpan.
- Browser memerlukan izin pengguna dan konteks aman untuk Geolocation. Gunakan HTTPS pada pemasangan internet; pada HTTP LAN, pilihan kota manual tetap dapat digunakan. API browser tidak menjamin bahwa lokasi berasal dari sensor GPS fisik. Lihat [spesifikasi Geolocation W3C](https://www.w3.org/TR/geolocation/).
- Zona waktu dihitung di server menggunakan `geo-tz/all` **8.1.11**, termasuk zona Jakarta, Makassar, dan Jayapura. Browser tidak dapat mengirim zona waktu, waktu sekarang, atau batas jeda yang dipercaya server. Pilihan dataset lengkap mempertahankan nama zona wilayah; lihat [dokumentasi geo-tz](https://github.com/evansiroky/node-geo-tz).
- Jadwal dihitung lokal menggunakan **Adhan 4.4.6**: sudut Subuh 20°, Isya 18°, Asar Shafi, pembulatan ke atas, dan tambahan ihtiyat 2 menit pada masing-masing dari lima waktu. Penyesuaian bawaan metode diset nol agar koreksi Zuhur tidak ditambahkan dua kali. Lihat [proyek Adhan](https://github.com/batoulapps/adhan-js).
- Hasil ini berlabel **perhitungan lokasi**, bukan salinan jadwal resmi Kementerian Agama atau umpan jadwal masjid. Perbedaan koordinat, ketinggian horizon, dan aturan jadwal setempat dapat menghasilkan selisih. Tidak ada akses API jadwal eksternal atau API key yang diperlukan saat permainan berjalan.
- Koordinat tidak valid ditolak. Untuk lokasi sah yang tidak menghasilkan lima waktu terhitung pada tanggal tersebut, misalnya kondisi kutub, server memberi alasan cadangan dan memakai Jakarta sementara.
- Perhitungan menggunakan tanggal kalender setempat, termasuk ketika server dan pemain berada pada tanggal berbeda. Kalender hari sebelumnya dan berikutnya ikut diperiksa untuk window yang melintasi tengah malam.

Nama salat, nama pemain pemicu, waktu mulai/akhir, dan status siap dapat dibaca anggota ruang. **Koordinat, label lokasi pribadi, serta riwayat lokasi tidak dikirim dalam snapshot multiplayer.** Basis data menyimpan pilihan lokasi terakhir, bukan jejak perjalanan.

## Keputusan server dan persistensi

`user_prayer_state`, ditambahkan oleh migrasi **008**, memuat lokasi akun dan satu window jeda pribadi aktif. Pembacaan/perubahan memakai transaksi dan penguncian baris. Sebelum lokasi diubah, server memeriksa jadwal lokasi lama; perubahan yang tiba tepat setelah waktu salat tidak dapat melewati window yang belum sempat dipoll. Batas yang sedang aktif hanya dapat tetap atau diperpanjang, tidak dipersingkat oleh perubahan lokasi atau login ulang.

Di luar ruang, window pribadi menutup akses bermain selama 15 menit. Login, membaca profil/jadwal, dan mengoreksi lokasi tetap tersedia. Pembelian, pemasangan kosmetik, pemilihan loadout, tiket balap baru, serta perubahan admin ditolak dengan HTTP **423 `PRAYER_BREAK`** selama window pribadi berlangsung. Penguncian ruang aktif dilakukan melalui protokol realtime, bukan melalui penghapusan sesi.

Snapshot ruang menggunakan fase `prayer_pause` atau `resume_countdown` dan objek `prayerPause`. Objek ini memuat token jeda, waktu server, peserta yang harus siap, persetujuan yang sudah diterima, dan pemicu aman untuk dibagikan. Pesan `resume_ready` harus membawa token jeda terbaru. Persetujuan terlalu awal, token lama, atau pengiriman ulang tidak dapat memulai pertandingan. Pemicu baru memperbarui token, memperpanjang deadline hingga minimum 15 menit sejak pemicu baru terdeteksi, dan mengosongkan persetujuan sebelumnya.

Gerakan menggunakan waktu simulasi, sehingga 15 menit jeda maupun hitungan untuk melanjutkan tidak ditambahkan ke waktu lap atau batas durasi balapan. Input yang ditahan sebelum jeda dibuang; kendaraan tidak mendapat rentetan gas atau nitro tertunda saat permainan kembali berjalan.

## Operasional

Jam server harus akurat dan disinkronkan oleh sistem operasi. Perubahan jam browser tidak menentukan status ruang. `prayerNow` pada factory aplikasi hanya merupakan dependency injection untuk tes, tidak tersedia melalui HTTP, WebSocket, atau formulir pemain.

Sumber utama: `server/services/prayer.ts`, `shared/prayer.ts`, `server/realtime/RaceRoom.ts`, `client/src/Prayer.tsx`, dan `database/migrations/008_personal_prayer_breaks.sql`. Hasil pemeriksaan aktual dan batas lingkungan pengujian tercatat pada [VERIFICATION.md](VERIFICATION.md).
