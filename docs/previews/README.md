# Pratinjau aset kendaraan

Gambar ini adalah render inspeksi GLB yang disertakan dalam paket, menggunakan Blender 4.3.2 / Cycles CPU. Ini bukan tangkapan layar gameplay Three.js. Pencahayaan studio dipakai untuk memeriksa bentuk dan sambungan panel; suasana bengkel/game mengikuti renderer aplikasi.

Regera dan Venom dirender dengan cat silver serta posisi kamera yang sama supaya bentuk kabin, lampu, intake, sayap dan pelek dapat dibandingkan. Kedua model dan gambarnya dipertahankan dari versi **1.3.0**. Nama berkas Regera tetap memakai `jesko-absolut` agar sama dengan identitas kendaraan yang dipertahankan pada database.

Panther memakai rebuild **1.3.1**, ditinjau terhadap foto depan-samping kendaraan gelap serta tiga foto tambahan kendaraan putih dari depan, belakang dan belakang-samping. Render memakai cat gelap bawaan. Tampilan depan/belakang dari sudut tiga perempat memperlihatkan sambungan panel, sedangkan tampilan samping membantu menilai proporsi kabin, kap, roda dan pintu.

- `jesko-absolut-front.png` dan `jesko-absolut-rear.png`: Koenigsegg Regera.
- `venom-f5-front.png` dan `venom-f5-rear.png`: Hennessey Venom F5 mengikuti referensi kokpit terbuka.
- `panther-grand-touring-front.png`, `panther-grand-touring-side.png`, dan `panther-grand-touring-rear.png`: Isuzu Panther Grand Touring, rebuild 1.3.1 berdasarkan rujukan 21 November 2026.

Semua model tambahan adalah rekonstruksi geometri buatan UVelocity berdasarkan gambar pengguna, bukan hasil scan atau CAD pabrikan.


## Tambahan 1.5.0 — 23 November 2026

CR-V, Pajero Sport, Fortuner dan Innova Zenix mempunyai tiga render inspeksi
per model: `*-front.png`, `*-rear.png`, dan `*-side.png`. Semua dibuat dari GLB
final pada `public/game/assets/cars/`, memakai warna/material aset, studio
netral, kamera ortografis, dan Blender Cycles CPU. Berkas ini merupakan
pratinjau aset, bukan screenshot garasi atau bukti rendering WebGL browser.

Untuk mengulangi render (Blender hanya diperlukan pada workstation desain):

```bash
blender -b -t 4 --python scripts/render-vehicle-previews.py -- \
  --models honda-crv-rs,mitsubishi-pajero-sport,toyota-fortuner,toyota-innova-zenix \
  --output docs/previews --views front,rear,side --samples 96 --width 1100 --height 700
```

Model CR-V mengikuti foto biru yang saling konsisten; foto putih model lama
bukan dasar pencampuran generasi. Fortuner mengikuti foto GR Sport hitam,
sedangkan foto putih membantu membaca proporsi. Pajero mempertahankan
aksesori bumper dan ban yang tampak pada rujukan. Zenix mengikuti dua foto
putih/perak depan dan belakang. Ukuran dan detail merupakan rekonstruksi
untuk permainan, bukan data pabrikan.

## Tambahan 1.6.0 — 24 November 2026

Batmobile Tumbler versi The Dark Knight dan Pontiac Knight Rider 1983 (KITT)
ditambahkan sebagai dua model tersendiri. Enam PNG berikut dirender langsung
dari GLB yang disertakan pada `public/game/assets/cars/` dengan Blender Cycles
CPU, material aset, pencahayaan studio, dan kamera ortografis:

| Kendaraan | Depan | Belakang | Samping |
| --- | --- | --- | --- |
| Batmobile Tumbler | `batmobile-tumbler-front.png` | `batmobile-tumbler-rear.png` | `batmobile-tumbler-side.png` |
| Knight Rider KITT | `knight-rider-kitt-front.png` | `knight-rider-kitt-rear.png` | `knight-rider-kitt-side.png` |

Ini adalah **render inspeksi aset GLB**, bukan screenshot garasi, balapan,
atau pengujian gambar WebGL. Pencahayaan, refleksi, dan hasil akhir cat di
garasi mengikuti renderer permainan. PNG KITT menampilkan scanner pada satu
keadaan material; gerakan scanner di dalam game dijalankan oleh adapter
runtime dan tidak dapat ditunjukkan oleh gambar diam ini.

Tumbler dibangun mengikuti dua foto depan-samping dan belakang yang diberikan
pengguna: armor bersudut, kaca depan terbelah, roda depan terbuka, empat ban
belakang dalam pasangan, suspensi terlihat, dan turbin belakang. KITT mengikuti
empat foto pengguna: hidung rendah dengan scanner merah, tutup lampu pop-up,
velg turbocast gelap, atap T-top, kaca hatch melengkung, spoiler belakang,
serta interior cokelat muda. Keduanya merupakan geometri orisinal buatan
UVelocity dengan penyederhanaan untuk permainan; proporsi dan detail adalah
rekonstruksi bergaya berdasarkan referensi, bukan scan, CAD pabrikan, atau
mesh resmi studio film. Model Batmobile 1989 yang sudah ada tetap tersendiri.

Untuk mengulangi keenam render:

```bash
blender -b -t 4 --python scripts/render-vehicle-previews.py -- \
  --models batmobile-tumbler,knight-rider-kitt \
  --output docs/previews --views front,rear,side --samples 96 --width 1100 --height 700
```

Di katalog 1.6.0 keduanya masuk **Koleksi Ikonik**, dengan harga awal
Tumbler **Rp1.500.000** dan KITT **Rp850.000** dalam kredit game. Finish bawaan
adalah matte untuk Tumbler dan gloss untuk KITT; pengaturan cat tersimpan
pemain tetap berlaku setelah kendaraan dikustomisasi. Nilai harga dan performa
merupakan pengaturan permainan dan dapat disesuaikan administrator.
