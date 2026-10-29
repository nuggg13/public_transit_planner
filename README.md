# The 15 Halte Show

The 15 Halte Show adalah game strategi transit berbasis web. Pemain mengelola jaringan bus dengan menyusun rute di antara halte yang muncul bertahap, lalu mengamati dampaknya terhadap layanan penumpang.

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
