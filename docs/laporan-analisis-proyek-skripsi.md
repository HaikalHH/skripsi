# Laporan Analisis Proyek untuk Penulisan Skripsi

## 1. Identitas Proyek

**Nama proyek:** WhatsApp Finance Assistant / AI Finance Assistant  
**Jenis aplikasi:** Sistem asisten keuangan pribadi berbasis WhatsApp dengan dukungan AI, dashboard admin berbasis web, layanan reporting, onboarding finansial, tracking goal, aset, dan subscription.  
**Bentuk repositori:** Monorepo `pnpm`

## 2. Ringkasan Umum Sistem

Project ini adalah sistem pencatatan dan analisis keuangan pribadi yang memanfaatkan WhatsApp sebagai antarmuka utama pengguna. Pengguna dapat mencatat transaksi dengan bahasa alami seperti "beli kopi 25 ribu", mengirim gambar struk untuk dibaca OCR, meminta laporan keuangan, mengatur budget, membuat target keuangan, memantau aset, melihat harga market, menerima berita finance, dan memperoleh reminder otomatis.

Secara arsitektur, sistem ini tidak hanya terdiri dari satu aplikasi, tetapi dibagi menjadi beberapa komponen terpisah: backend API utama, panel admin web, worker bot WhatsApp, service reporting berbasis Python, dan package shared untuk schema/prompt/utilitas bersama. Penyimpanan data menggunakan MySQL yang diakses melalui Prisma ORM.

## 3. Narasi Singkat Siap Pakai untuk Skripsi

Proyek ini merupakan aplikasi asisten keuangan pribadi berbasis WhatsApp yang dirancang untuk membantu pengguna mencatat transaksi pemasukan, pengeluaran, dan tabungan secara lebih mudah melalui bahasa alami. Sistem juga menyediakan fitur analisis keuangan, budgeting, perencanaan target keuangan, pengelolaan aset, laporan berkala, serta notifikasi pengingat otomatis. Untuk meningkatkan akurasi input, aplikasi mendukung OCR pada gambar struk dan memanfaatkan model AI untuk klasifikasi intent, ekstraksi data transaksi, dan penyusunan insight finansial.

Secara implementasi, sistem dibangun dengan pendekatan monorepo menggunakan `pnpm`. Backend utama menggunakan Next.js App Router pada sisi server dengan bahasa TypeScript, sedangkan panel admin juga dibangun menggunakan Next.js dan React. Untuk reporting visual dan PDF, sistem menggunakan service terpisah berbasis FastAPI dan Matplotlib dalam bahasa Python. Basis data yang digunakan adalah MySQL dengan Prisma sebagai ORM. Struktur ini membuat sistem lebih modular, mudah dikembangkan, dan memisahkan tanggung jawab antara pemrosesan chat, visualisasi laporan, administrasi, dan integrasi pihak ketiga.

## 4. Fitur Utama yang Terdapat di Project

### 4.1 Pencatatan transaksi via chat

- Mencatat pemasukan, pengeluaran, dan tabungan dari pesan teks natural.
- Contoh input: `gaji masuk 5 juta`, `beli kopi 25 ribu`, `nabung 500 ribu`.
- Sistem melakukan parsing intent dan ekstraksi nominal, kategori, merchant, dan waktu transaksi.

### 4.2 Pencatatan transaksi dari gambar struk

- Pengguna dapat mengirim gambar receipt/struk.
- Gambar diproses dengan OCR.
- Hasil OCR kemudian dianalisis AI untuk mengekstrak data transaksi.
- Jika data belum lengkap, bot meminta klarifikasi.

### 4.3 Onboarding pengguna

- User baru dibuat otomatis berdasarkan nomor WhatsApp.
- Onboarding dilakukan bertahap melalui pertanyaan interaktif.
- Data yang dikumpulkan meliputi:
  - tujuan finansial utama
  - status pekerjaan
  - sumber pemasukan aktif/pasif
  - tanggal gajian
  - estimasi pengeluaran
  - pilihan budgeting
  - goal keuangan
  - data aset
  - preferensi personalisasi

### 4.4 Budgeting

- Pengguna dapat menetapkan limit bulanan per kategori.
- Budget bisa diinput manual atau dibentuk dari onboarding.
- Sistem memantau kategori yang mendekati atau melewati limit.

### 4.5 Goal keuangan

- Membuat target tabungan/keuangan.
- Mendukung beberapa jenis goal:
  - dana darurat
  - rumah
  - kendaraan
  - liburan
  - custom goal
  - financial freedom
- Mendukung setoran progres goal dan pengecekan status goal.
- Sistem menghitung progress, sisa target, estimasi waktu tercapai, dan rekomendasi alokasi.

### 4.6 Financial profile dan financial health

- Sistem membentuk profil finansial awal pengguna dari data onboarding dan transaksi.
- Menghitung total income, expense, saving rate, target dana darurat, target financial freedom, dan health score.
- Tersedia mode evaluasi skor kesehatan finansial dan closing bulanan.

### 4.7 Reporting

- Mendukung laporan:
  - harian
  - mingguan
  - bulanan
- Output laporan berupa:
  - ringkasan teks
  - grafik PNG
  - PDF bulanan
- Laporan menghitung income, expense, saving, balance, top category, trend, dan rincian transaksi.

### 4.8 Analitik kategori dan cashflow

- Detail pengeluaran per kategori.
- Perbandingan periode.
- Analisis recurring expense.
- Prediksi cashflow sampai gajian atau akhir periode tertentu.

### 4.9 Pengelolaan aset dan portfolio

- Pencatatan aset seperti:
  - tabungan
  - emas
  - saham
  - crypto
  - reksa dana
  - properti
  - aset lain
- Mendukung portfolio valuation.
- Mendukung penambahan trade/holding.
- Menyediakan ringkasan komposisi aset dan evaluasi risiko diversifikasi.

### 4.10 Informasi market dan berita finance

- Cek harga market untuk saham, crypto, emas, dan instrumen lain yang didukung.
- Mendukung berita finance umum dan berita terkait aset portfolio pengguna.
- Terdapat fallback provider dan caching data market.

### 4.11 Reminder otomatis

- Reminder budget hampir habis atau terlewati.
- Weekly spending spike reminder.
- Goal reached reminder.
- Reminder recurring expense jatuh tempo.
- Cashflow buffer reminder.
- Weekly review.
- Monthly closing.
- Daily digest.

### 4.12 Subscription dan pembayaran

- Ada sistem subscription untuk mengaktifkan akses penuh user.
- Mendukung provider:
  - `DUMMY` untuk simulasi/dev
  - `AIRWALLEX` untuk pembayaran nyata
- Tersedia payment session, payment confirmation, dan webhook pembayaran.

### 4.13 Admin dashboard

Panel admin menyediakan fitur:

- monitoring user
- monitoring transaksi
- monitoring subscription
- monitoring health system
- observability routing/intents
- delete user
- update status subscription

### 4.14 Observability dan quality monitoring

- Sistem mencatat intent observation.
- Menyimpan informasi ambiguity, semantic rewrite, handler yang dipakai, dan fallback stage.
- Tersedia halaman observability untuk audit kualitas routing chat.

### 4.15 Edit dan hapus transaksi

- User dapat mengubah nominal transaksi yang sudah tersimpan.
- User dapat menghapus transaksi terakhir atau transaksi tertentu berdasarkan hint teks.

### 4.16 Privacy dan export summary

- Ada command terkait privasi data.
- Ada ringkasan data export untuk kebutuhan admin/export lanjutan.

## 5. Bahasa Pemrograman yang Dipakai

- **TypeScript**: bahasa utama untuk backend API, bot, shared package, dan web admin.
- **TSX/React JSX**: untuk komponen dan halaman antarmuka web.
- **Python**: untuk service reporting/generator chart dan PDF.
- **SQL**: dipakai melalui migration Prisma ke MySQL.
- **CSS**: untuk styling antarmuka admin web.
- **YAML/JSON**: untuk konfigurasi workspace, tooling, dan payload data.

## 6. Framework, Library, dan Tools yang Digunakan

### 6.1 Runtime dan package manager

- Node.js
- pnpm
- Python 3

### 6.2 Backend

- Next.js 14
- React 18
- Prisma ORM
- Zod
- Pino

### 6.3 Bot dan messaging

- `@whiskeysockets/baileys`
- Meta WhatsApp Graph API / Cloud API integration

### 6.4 AI dan OCR

- Google Gemini API
- Google Cloud Vision API

### 6.5 Reporting

- FastAPI
- Uvicorn
- Matplotlib
- Pydantic

### 6.6 Payment

- Airwallex

### 6.7 Market data dan news provider

- Finnhub
- GoldAPI
- Marketaux
- exchangerate.host
- fallback market/news provider di level kode

### 6.8 Testing dan quality

- Vitest
- TypeScript strict mode

## 7. Database yang Digunakan

Database utama yang digunakan adalah **MySQL**, dengan akses data melalui **Prisma ORM**.

Konfigurasi datasource pada Prisma:

- provider: `mysql`
- koneksi: `DATABASE_URL`

## 8. Desain Database Secara Umum

Schema database pada project ini cukup besar dan sudah mencerminkan aplikasi yang bukan hanya chatbot sederhana. Saat ini terdapat:

- **24 enum Prisma**
- **24 model Prisma**

### 8.1 Tabel/model inti

- `User`
  - menyimpan identitas user WhatsApp, status registrasi, status onboarding, dan profil dasar
- `Transaction`
  - menyimpan pemasukan, pengeluaran, dan tabungan
- `MessageLog`
  - log semua pesan masuk
- `AIAnalysisLog`
  - log hasil analisis AI

### 8.2 Tabel untuk budgeting dan goal

- `Budget`
- `SavingsGoal`
- `FinancialGoal`
- `GoalContribution`
- `ExpensePlan`
- `ExpensePlanItem`

### 8.3 Tabel untuk aset dan investasi

- `Asset`
- `PortfolioAsset`
- `PortfolioTrade`
- `FinancialFreedomProfile`
- `FinancialProfile`

### 8.4 Tabel untuk pembayaran dan akses

- `Subscription`
- `PaymentSession`
- `PaymentProviderEvent`

### 8.5 Tabel untuk operasional sistem

- `OutboundMessage`
- `ReminderPreference`
- `ReminderEvent`
- `OnboardingSession`
- `IntentObservation`
- `SystemHeartbeat`

### 8.6 Relasi data utama

- Satu `User` memiliki banyak `Transaction`, `MessageLog`, `Budget`, `Subscription`, `Asset`, `FinancialGoal`, dan `ReminderEvent`.
- `Transaction` terhubung ke `User`.
- `MessageLog` dan `AIAnalysisLog` dipakai untuk jejak analisis percakapan.
- `FinancialGoal` terhubung dengan `GoalContribution`.
- `PaymentSession` dan `Subscription` terhubung ke `User`.

## 9. Arsitektur Sistem

Secara implementasi, project ini memakai arsitektur modular berbasis monorepo. Komponen utamanya adalah sebagai berikut.

### 9.1 Struktur komponen

```text
.
├── apps
│   ├── api
│   ├── admin-web
│   └── bot
├── packages
│   └── shared
├── services
│   └── reporting
├── scripts
└── artifacts
```

### 9.2 Penjelasan tiap komponen

#### `apps/api`

Backend utama sistem. Berisi:

- route handler API
- proses inbound message
- integrasi AI
- onboarding
- reporting
- reminder
- payment
- observability
- service domain lain

#### `apps/admin-web`

Panel admin berbasis Next.js untuk:

- login admin
- daftar user
- audit transaksi
- health monitoring
- observability
- subscription management
- halaman payment dummy

Catatan penting: di kode aktif saat ini, aplikasi web yang benar-benar ada adalah `apps/admin-web`. README lama masih menyebut `apps/web`, jadi dokumentasi internal belum sepenuhnya sinkron dengan struktur terbaru.

#### `apps/bot`

Worker bot WhatsApp yang:

- menghubungkan sesi WhatsApp
- mengirim heartbeat
- polling outbound queue
- meneruskan inbound message ke API internal
- menjalankan sweep reminder terjadwal

#### `packages/shared`

Berisi komponen bersama lintas aplikasi:

- type
- schema validasi
- prompt AI
- utilitas JSON/date

#### `services/reporting`

Service Python terpisah untuk:

- generate chart PNG
- generate PDF laporan bulanan

## 10. Struktur Service di Backend

Folder `apps/api/lib/services` dibagi per domain fitur. Ini merupakan struktur yang baik untuk dijelaskan di skripsi karena menunjukkan pemisahan tanggung jawab.

- `ai`: integrasi Gemini, OCR, dan logging analisis
- `assistant`: command parsing, routing, conversation memory, chat umum
- `market`: harga market, valuasi portfolio, news
- `messaging`: outbound message dan formatting bot
- `observability`: analytics intent/routing
- `onboarding`: flow onboarding, parser, helper route, kalkulasi
- `payments`: payment session, subscription, Airwallex
- `planning`: cashflow, goal, financial health, projection
- `reminders`: aturan reminder dan preferensi
- `reporting`: agregasi, report builder, monthly PDF
- `shared`: helper lintas service
- `system`: heartbeat/status internal
- `transactions`: parser transaksi, normalisasi kategori, anomaly, recurring, mutation
- `user`: user dan financial context

## 11. Alur Kerja Sistem

### 11.1 Alur pesan teks

1. User mengirim pesan WhatsApp.
2. Pesan diterima lewat webhook Meta atau worker bot.
3. Payload divalidasi dengan Zod.
4. Sistem membuat atau mencari user berdasarkan nomor WhatsApp.
5. Sistem menyimpan `MessageLog`.
6. Sistem mengecek onboarding dan subscription.
7. Jika pesan adalah transaksi/command, pesan diarahkan ke router domain.
8. Jika perlu AI, Gemini dipakai untuk intent extraction atau advice.
9. Hasil diproses, disimpan ke database, lalu dibalas ke user.

### 11.2 Alur gambar struk

1. User mengirim gambar.
2. Gambar diambil sebagai base64.
3. OCR membaca teks dari gambar.
4. Gemini mengekstrak transaksi dari teks OCR.
5. Jika valid, transaksi disimpan.
6. Bot membalas hasil pencatatan.

### 11.3 Alur laporan

1. User meminta laporan.
2. API mengambil transaksi sesuai periode.
3. Sistem menghitung agregasi income/expense/category/trend.
4. Jika ada data, API memanggil service Python untuk membuat chart.
5. Ringkasan teks dan grafik dikirim kembali ke user.

### 11.4 Alur reminder

1. Worker bot menjadwalkan reminder sweep.
2. API memeriksa kondisi budget, recurring expense, cashflow, goal, dan review periodik.
3. Reminder yang lolos filter cooldown/preference dimasukkan ke outbound queue.
4. Worker bot mengirim pesan ke WhatsApp.

## 12. API dan Endpoint

Pada sisi backend terdapat **28 route handler**.

### 12.1 Kelompok endpoint utama

- endpoint onboarding
- endpoint report
- endpoint goals
- endpoint financial profile
- endpoint assets
- endpoint public payment
- endpoint public WhatsApp webhook
- endpoint admin users/transactions/subscriptions/health/observability
- endpoint internal bot outbound/ack/heartbeat/reminders

### 12.2 Endpoint penting

- `/api/public/whatsapp/webhook`
- `/api/report`
- `/api/onboarding/current`
- `/api/onboarding/answer`
- `/api/onboarding/analysis`
- `/api/onboarding/complete`
- `/api/goals`
- `/api/goals/priorities`
- `/api/financial-profile`
- `/api/assets`
- `/api/public/payment/session`
- `/api/public/payment/confirm`
- `/api/public/user/profile`
- `/api/public/user/dashboard`
- `/api/admin/users`
- `/api/admin/transactions`
- `/api/admin/subscriptions`
- `/api/admin/health`
- `/api/admin/observability`
- `/api/bot/inbound`
- `/api/bot/outbound`
- `/api/bot/outbound/ack`
- `/api/bot/heartbeat`

## 13. Komponen Frontend

Frontend yang aktif di repository ini berfokus pada **panel admin** dan **halaman payment**.

### 13.1 Halaman admin yang ada

- login
- users
- transactions
- subscriptions
- observability
- health

### 13.2 Fitur frontend admin

- autentikasi dengan password admin
- proteksi route dengan cookie session
- fetch data ke API admin memakai `x-admin-token`
- tampilan statistik ringkas dan tabel audit

### 13.3 Catatan penting

API publik untuk dashboard user dan profile user sudah tersedia di backend, tetapi pada repository saat ini belum terlihat front-end customer dashboard yang lengkap seperti panel admin. Artinya, sisi data untuk dashboard user sudah disiapkan, namun UI user-facing di repo ini belum sekomplet fitur admin.

## 14. Integrasi AI dalam Sistem

AI dipakai di beberapa titik penting:

- klasifikasi intent pesan
- ekstraksi detail transaksi
- semantic command normalization
- general finance chat yang dibatasi konteks sistem
- insight laporan
- advice finansial
- normalisasi jawaban onboarding

Prompt AI disimpan terpusat di `packages/shared/src/prompts.ts`, sehingga logika prompt dapat digunakan ulang oleh beberapa aplikasi.

## 15. Mekanisme Keamanan dan Validasi

### 15.1 Validasi input

- Hampir semua payload masuk divalidasi dengan **Zod**.
- Output AI juga divalidasi agar format JSON tidak liar.

### 15.2 Proteksi admin

- API admin memakai header `x-admin-token`.
- Web admin memakai password dan cookie session.

### 15.3 Proteksi bot internal

- Endpoint bot internal memakai `x-bot-token`.

### 15.4 Proteksi WhatsApp webhook

- Terdapat verifikasi signature webhook WhatsApp jika app secret diaktifkan.

### 15.5 Rate limiting

- Ada rate limit in-memory per nomor WhatsApp.

### 15.6 Graceful fallback

- Jika AI/OCR gagal, sistem mencoba fallback atau mengirim balasan aman tanpa menyimpan data parsial yang salah.

## 16. Logging, Monitoring, dan Observability

Project ini cukup kuat dari sisi observability untuk ukuran skripsi/prototipe.

- logging menggunakan Pino
- ada `SystemHeartbeat` untuk bot health
- ada `IntentObservation` untuk kualitas routing
- ada `AIAnalysisLog` untuk analisis AI
- ada halaman `System Health`
- ada halaman `Observability`

## 17. Pengujian

Project ini sudah memiliki pengujian otomatis di backend API menggunakan **Vitest**.

### 17.1 Statistik test saat ini

- **44 file test**
- **287 test case** terdeteksi dari file test

### 17.2 Area yang diuji

- parsing nominal
- parsing transaksi
- fallback parser
- report formatting
- aggregation
- onboarding flow
- payment service
- reminder service
- market provider fallback
- financial health
- goal planner
- conversation memory
- WhatsApp webhook route

## 18. Kelebihan Arsitektur Project

- Struktur modular dan rapi per domain service.
- Monorepo memudahkan berbagi type/schema/prompt.
- Mendukung multi-channel WhatsApp dan layanan terpisah.
- Sudah ada observability, health check, dan test.
- Fitur bukan hanya pencatatan transaksi, tetapi sudah sampai financial planning dan portfolio.

## 19. Keterbatasan atau Catatan Teknis

Beberapa hal berikut dapat dicantumkan sebagai batasan penelitian atau ruang pengembangan:

- beberapa provider eksternal bergantung pada API key environment
- rate limit dan sebagian cache masih in-memory, sehingga belum ideal untuk skala horizontal besar
- dokumentasi README belum sepenuhnya sinkron dengan struktur folder terbaru
- front-end user dashboard belum sejelas panel admin pada repo ini
- akurasi AI dan OCR tetap dipengaruhi kualitas input pengguna

## 20. Kesimpulan Analisis

Berdasarkan struktur kode, dependency, schema database, route API, dan service domain, project ini dapat dikategorikan sebagai **sistem asisten keuangan pribadi berbasis AI yang cukup lengkap**. Sistem tidak hanya mencatat transaksi, tetapi juga memiliki onboarding finansial, budgeting, goal planning, asset tracking, market information, reporting visual, reminder otomatis, subscription, serta dashboard admin untuk operasional dan observability.

Dari sisi teknis, project ini dibangun dengan kombinasi **TypeScript + Next.js + Prisma + MySQL + Python FastAPI**, lalu diperkuat oleh integrasi **Gemini AI**, **Google Vision OCR**, **WhatsApp integration**, dan **payment gateway**. Struktur ini sangat layak dijadikan objek implementasi skripsi, terutama untuk topik sistem informasi, financial assistant, chatbot cerdas, atau aplikasi manajemen keuangan berbasis AI.

## 21. Ringkasan Singkat Poin-Poin Utama

- **Domain aplikasi:** asisten keuangan pribadi berbasis WhatsApp
- **Bahasa utama:** TypeScript dan Python
- **Framework utama:** Next.js, React, FastAPI
- **Database:** MySQL
- **ORM:** Prisma
- **AI:** Google Gemini
- **OCR:** Google Cloud Vision
- **Testing:** Vitest
- **Struktur:** monorepo `apps`, `packages`, `services`
- **Komponen utama:** API, admin web, bot worker, reporting service
- **Fitur utama:** transaksi, OCR struk, onboarding, budget, goal, aset, portfolio, market, news, report, reminder, subscription, admin monitoring

