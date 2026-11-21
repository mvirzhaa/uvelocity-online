# Identitas dan splash screen UVelocity

Splash pertama menampilkan dua identitas kampus dengan latar transparan:

- `public/branding/uika-logo-transparent.png`: lambang Universitas Ibn Khaldun Bogor, hasil penghapusan latar kotak-kotak dari gambar UIKA yang sebelumnya diberikan pengguna.
- `public/branding/informatika-uika-logo.png`: logo Teknik Informatika UIKA yang diunggah pengguna sebagai `logo TI besar.png`. Berkas disalin tanpa perubahan piksel; alpha transparan sudah tersedia pada sumber.

Tulisan di bawah kedua logo adalah **`create by civitas UIKA`**, sesuai permintaan. Nama institusi tersedia sebagai teks terpisah agar tetap terbaca pada layar kecil. Tidak ada pelat putih, latar kotak-kotak, atau sudut kotak pada elemen logo. Warna hijau berasal dari latar halaman splash, bukan bagian tambahan pada berkas logo.

Tahap kampus tampil selama 2,8 detik, kemudian logo game tersendiri `public/branding/uvelocity-logo.png` tampil selama 1,8 detik. Tombol **Lewati intro** tersedia di kedua tahap. Preferensi gerakan minimal meniadakan animasi; intro tetap bisa dilewati. Logo UVelocity dari paket sebelumnya tidak diubah.

Komponen: `client/src/Auth.tsx`. Tata letak tambahan: `client/src/branding.css`. Gambar memakai `object-fit: contain` dan susunan responsif agar lambang tidak terpotong.

## Sumber dan proses logo UIKA

Gambar terbaru `image(9).png` adalah tangkapan layar splash yang menunjukkan masalah checkerboard. Sumber beresolusi lebih besar yang telah tersedia dalam proyek, `public/branding/uika-logo-original.jpg`, digunakan untuk pembersihan latar. Berkas sumber tersebut tetap disertakan untuk penelusuran asal, tetapi tidak lagi dirujuk oleh splash.

Pembersihan dilakukan dengan alat image generation/edit bawaan pada mode edit, `transparent_background: true`, menggunakan sumber lokal sebagai referensi. Output RGBA telah diperiksa memiliki area alpha transparan dan tidak mengandung latar kotak-kotak. Penyuntingan berbasis gambar dapat menghasilkan perbedaan tepi halus dibanding sumber; ini bukan berkas vektor resmi baru dari universitas.

Prompt penyuntingan lengkap:

> Edit the supplied UIKA university crest by removing ONLY the entire baked-in grey-and-white checkerboard background outside the pentagonal crest. Produce one clean high-resolution RGBA PNG cutout on a truly transparent alpha background, with just a little clear padding around the complete crest. Preserve the original crest exactly: its tall pentagonal silhouette, gold bevel outer border, teal and green inner shading, gold and white rice ornaments, torch and flame, star, and lettering. The top lettering must remain exactly 'UNIVERSITAS IBN KHALDUN' following the original arc; the bottom banner must remain exactly 'BOGOR'. Do not redesign, restyle, recolor, simplify, rotate, crop, replace text, or add anything. Keep all portions INSIDE the crest opaque, including all white/gold shapes. Remove the checkerboard and the exterior drop shadow cleanly right up to the outer edge. There must be NO painted checkerboard, NO square plate, NO solid background, and NO added label. This is a precise background-removal edit for use as the original university logo on a dark green splash screen.

Identitas kampus dan nama game tetap terpisah. Media yang diunggah admin untuk halaman loading balapan tidak mengganti splash identitas ini.

## Ilustrasi halaman loading siap unggah

Berkas `examples/media/uvelocity_loading.jpg` dibuat khusus untuk permintaan pengguna, berukuran **1672 × 941 piksel**, JPEG, dengan rasio mendekati 16:9. Berkas ini merupakan ilustrasi sinematik, bukan tangkapan layar gameplay. Mobil dan area terang berada di sisi kanan; sisi kiri menyisakan ruang untuk logo dan informasi kesiapan dari UI.

Gambar dibuat dengan alat image generation bawaan menggunakan logo UVelocity yang sudah ada hanya sebagai referensi palet/identitas, bukan sebagai pengganti logo game. Keluaran gambar diekspor ke JPEG quality 94, chroma 4:4:4, tanpa perubahan komposisi, ukuran, atau penambahan teks. Format dan dimensinya telah diperiksa melalui validator JPEG server yang sama dengan upload admin. Gambar tidak dimasukkan ke database otomatis; admin tetap memilih dan menyimpannya secara eksplisit.

Prompt generasi lengkap:

> Create a polished cinematic loading-screen BACKGROUND for the realistic multiplayer racing game UVelocity. Landscape 16:9, high resolution. Use the supplied existing UVelocity logo ONLY as brand/palette reference (deep forest green, champagne gold, brushed metal); DO NOT paste its white/transparent plate, and DO NOT add any text or logo lettering to this background because the actual game UI will place its own original logo and live loading text on top. Composition is essential: leave the entire LEFT 42 percent and upper-left quiet, low-contrast, dark forest-green charcoal with only subtle atmospheric architecture/track texture; all hero subjects and bright detail must be in the RIGHT 58 percent. Scene: three exceptionally realistic, detailed performance cars on a premium coastal race circuit at blue-hour just after rain. Dominant hero in the lower-right is a metallic sapphire-blue Subaru BRZ sports coupe, in a powerful low front three-quarter view facing slightly towards the left, realistic headlights, carbon splitter, intricate dark multi-spoke wheels, visible brake calipers, lifelike paint reflections, correct proportions and clean undistorted geometry. Behind and slightly higher on the right: a low champagne-gold Lamborghini Aventador; a more distant white BMW-style endurance prototype with restrained blue and red livery. Keep the hero fully within the canvas with a clear margin, tires on the asphalt. Background on far right shows modern illuminated pit buildings, a coastal guardrail, faint ocean horizon and distant misty mountains, warm restrained golden floodlights, believable PBR materials, realistic wet asphalt with subtle reflections and road markings. Photographic automotive advertising quality mixed with an AAA racing game cinematic, dramatic but tasteful, crisp recognizable cars, natural depth of field, restrained green/gold lighting accents, no excessive neon, no speed-motion blur on the hero car. A unified continuous scene, not a collage and not a split-screen. No people, no watermarks, no captions, no interface, no progress bar, no static percentages, no fake extra text. Make a beautiful image that remains readable under a live dark gradient and player-readiness overlay on the left.
