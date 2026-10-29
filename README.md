# The 15 Halte Show

The 15 Halte Show adalah game strategi transit berbasis web. Pemain mengelola jaringan bus dengan menyusun rute di antara halte yang muncul bertahap, lalu mengamati dampaknya terhadap layanan penumpang.

![Tampilan The 15 Halte Show](docs/gameplay-overview.png)

## Tujuan game

Bangun jaringan bus yang mampu melayani permintaan penumpang sebaik mungkin. Halte muncul bertahap sampai batas jaringan tercapai, sehingga pemain perlu memilih halte yang akan dihubungkan dan menyeimbangkan jumlah bus dengan kebutuhan layanan.

## Cara bermain

1. Tekan **Jalankan** untuk memulai simulasi.
2. Tunggu halte muncul di peta kota.
3. Pilih alat **Rute**.
4. Klik minimal dua halte secara berurutan.
5. Tekan **Buat rute** untuk menambahkan layanan bus.
6. Gunakan kontrol jumlah bus pada panel rute jika diperlukan.
7. Pantau penumpang terlayani, penumpang menunggu, waktu tunggu, tingkat layanan, dan utilisasi bus.
8. Gunakan **Jeda** untuk menghentikan simulasi sementara dan pilihan **1x**, **2x**, atau **4x** untuk mengatur kecepatannya.

Halte atau garis rute yang dipilih dapat diklik dalam mode **Pilih** untuk melihat detailnya. Rute yang sudah dibuat dapat diganti nama, diubah warnanya, disesuaikan urutan haltenya, ditambah halte, atau dihapus.

### Menambah halte

Halte dibuat otomatis oleh simulasi. Tekan **Jalankan** dan tunggu sampai halte baru muncul di peta. Setiap halte memiliki zona dan bentuk yang membantu membedakan lokasinya. Tidak ada alat untuk menempatkan halte secara manual.

### Membuat dan mengelola rute

1. Tekan **Rute**.
2. Klik minimal dua halte yang sudah muncul di peta.
3. Periksa urutan halte pada panel **Rute baru**.
4. Tekan **Buat rute**.
5. Pilih rute untuk mengubah nama, warna, urutan halte, atau jumlah bus.

Satu rute membutuhkan minimal dua halte yang berbeda. Bus akan mulai melayani setelah rute dibuat.

### Menjalankan simulasi

Tekan **Jalankan** untuk memulai waktu simulasi. Tekan **Jeda** untuk menghentikannya sementara. Saat simulasi berjalan, permintaan penumpang, pergerakan bus, dan statistik layanan akan diperbarui secara berkala.

### Arti statistik

| Statistik | Arti |
| --- | --- |
| Terlayani | Jumlah penumpang yang sudah menyelesaikan perjalanan |
| Permintaan | Total permintaan perjalanan yang muncul |
| Menunggu | Penumpang yang masih menunggu bus |
| Di bus | Penumpang yang sedang berada di dalam bus |
| Rata-rata tunggu | Rata-rata waktu tunggu penumpang yang sudah terlayani |
| Tunggu terlama | Waktu tunggu terlama penumpang yang masih menunggu |
| Tingkat layanan | Persentase permintaan yang sudah terlayani |
| Utilisasi bus | Rata-rata tingkat keterisian bus yang sedang aktif |
| Tertunda | Permintaan yang ditunda karena kapasitas aktif penuh |
| Waktu | Waktu simulasi yang sudah berlalu |

### Kontrol kecepatan

Gunakan tombol **1x**, **2x**, dan **4x** di bagian atas layar. Kecepatan hanya mengubah laju berjalannya simulasi, bukan jumlah waktu layanan yang tersedia atau kapasitas bus.

### Target dan kondisi permainan

Game ini adalah sandbox strategi tanpa layar kemenangan atau kekalahan paksa. Target pemain adalah membangun jaringan yang efektif: layani sebanyak mungkin penumpang, kurangi antrean dan waktu tunggu, serta gunakan bus secara efisien. Tantangan utama berlangsung sampai jaringan mencapai batas maksimal halte dan pemain mengevaluasi kualitas layanan yang dibangun.

## Browser yang didukung

Game ditujukan untuk browser modern yang mendukung JavaScript ES modules, HTML Canvas, dan CSS Grid:

- Google Chrome atau Chromium versi terbaru
- Microsoft Edge versi terbaru
- Mozilla Firefox versi terbaru
- Safari versi terbaru pada macOS dan iOS

Untuk pengalaman terbaik, gunakan layar minimal 320px dan browser yang diperbarui. Pengujian release candidate telah dilakukan pada browser Chromium di desktop, tablet, dan ukuran mobile.

## Menjalankan secara lokal

Persyaratan:

- Node.js versi 20 atau lebih baru
- npm

Install dependency:

```powershell
npm ci
```

Jalankan development server:

```powershell
npm run dev
```

Buka URL yang ditampilkan Vite di browser.

## Validasi dan production build

Jalankan lint dan test:

```powershell
npm run lint
npm test -- --run
```

Buat build production:

```powershell
npm run build
```

Hasil build berada di folder `dist`. Untuk menguji hasil build secara lokal:

```powershell
npm run preview -- --host 127.0.0.1
```

## Deployment

Deploy isi folder `dist` ke hosting static seperti GitHub Pages, Netlify, Vercel, atau server web statis lainnya. File entry point-nya adalah `dist/index.html`.

Setelah deployment, lakukan smoke test berikut:

- Halaman dapat dibuka melalui URL production.
- Judul halaman menampilkan **The 15 Halte Show**.
- Asset JavaScript dan SVG tidak menghasilkan 404.
- Simulasi dapat dijalankan dan dijeda.
- Halte muncul otomatis.
- Rute dengan minimal dua halte dapat dibuat.
- Statistik layanan berubah setelah simulasi berjalan.
- Halaman dapat di-reload tanpa error.

## Teknologi

- TypeScript
- Vite
- HTML Canvas
- Vitest
- ESLint

## Status rilis

Fitur utama telah dibekukan untuk persiapan rilis. Perubahan setelah feature freeze dibatasi pada bug fix, perbaikan deployment, dokumentasi, dan perubahan metadata rilis.
