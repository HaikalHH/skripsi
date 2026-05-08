# Test Cases Finance Bot

Dokumen ini berisi daftar test case rinci untuk WhatsApp Finance Assistant MVP berdasarkan struktur project saat ini: Next.js API, WhatsApp bot worker berbasis Baileys, admin web, Prisma/MySQL, AI/OCR, portfolio, reporting, reminders, dan service chart Python.

Format kolom:

- **ID**: nomor test case.
- **Area**: modul atau flow yang diuji.
- **Scenario**: kondisi atau perilaku yang ingin divalidasi.
- **Steps / Data**: langkah uji atau input utama.
- **Expected Result**: hasil yang wajib terjadi.

## Preconditions Umum

- Database MySQL sudah dimigrasi dan seed minimal tersedia.
- API berjalan pada base URL sesuai `.env`.
- Admin web berjalan dan terhubung ke API.
- Reporting service FastAPI berjalan untuk test chart/report image.
- Untuk test AI/OCR real, `GEMINI_API_KEY` dan Vision credential valid.
- Untuk test WhatsApp real, Baileys session sudah login lewat QR Linked Devices.
- Untuk test deterministic, mock provider AI, OCR, dan market price boleh digunakan.

## Functional Test Cases

| ID | Area | Scenario | Steps / Data | Expected Result |
|---|---|---|---|---|
| TC-001 | Inbound payload | Payload kosong ditolak | POST `/api/bot/inbound` dengan `{}` | HTTP 400, reply `Payload tidak valid.`, tidak membuat user/message log |
| TC-002 | Inbound payload | Message type tidak dikenal ditolak | Kirim `messageType: "AUDIO"` | HTTP 400, schema issue muncul |
| TC-003 | Inbound payload | Text message valid diterima | Kirim WA number valid, `messageType: TEXT`, `text: "register"` | User dicari/dibuat, message log dibuat, response 200 |
| TC-004 | Inbound payload | Image message valid diterima | Kirim `messageType: IMAGE`, `imageBase64`, caption optional | Message log type IMAGE dibuat, handler image dipanggil |
| TC-005 | Inbound payload | `sentAt` valid dipakai sebagai waktu pesan | Kirim `sentAt` ISO timestamp | `MessageLog.sentAt` sesuai input |
| TC-006 | Inbound payload | `sentAt` invalid fallback aman | Kirim `sentAt: "abc"` | Tidak crash, waktu log fallback ke now/default |
| TC-007 | User service | Nomor WA baru membuat user PENDING | Kirim pesan dari nomor baru | User dibuat dengan `registrationStatus=PENDING`, `onboardingStatus=NOT_STARTED` |
| TC-008 | User service | Nomor WA lama tidak membuat duplikat | Kirim dua pesan dari nomor sama | Hanya satu user dengan `waNumber` unik |
| TC-009 | User service | Normalisasi nomor dengan `+` | Input `+6281234567890` | Disimpan/dicari dalam format normal konsisten |
| TC-010 | User service | Normalisasi nomor dengan spasi | Input `62 812 3456 7890` | Spasi diabaikan, lookup tetap user sama |
| TC-011 | User service | Nomor dengan `waLid` tetap tersimpan | Kirim payload berisi `waLid` | User dibuat/diupdate tanpa merusak `waNumber` |
| TC-012 | Rate limit | Request melebihi limit ditolak | Kirim lebih dari `RATE_LIMIT_MAX` dalam window sama | HTTP 429, reply berisi retry seconds |
| TC-013 | Rate limit | Bucket rate limit per nomor | Nomor A overload, nomor B kirim pesan normal | Nomor A 429, nomor B tetap 200 |
| TC-014 | Rate limit | Window reset | Tunggu melewati `RATE_LIMIT_WINDOW_MS` setelah overload | Request berikutnya kembali diterima |
| TC-015 | Message logging | Text inbound dicatat lengkap | Kirim text dengan isi `makan 50000` | `MessageLog.contentOrCaption` sama dengan text |
| TC-016 | Message logging | Image inbound tanpa caption dicatat | Kirim image tanpa caption | `contentOrCaption` menjadi `(image message)` |
| TC-017 | Outbound logging | Reply tunggal dicatat | Handler menghasilkan `replyText` | `OutboundMessage` dibuat dengan text reply |
| TC-018 | Outbound logging | Multiple reply bubbles dicatat | Handler menghasilkan `replyTexts` lebih dari satu | Semua bubble tersimpan sebagai outbound log |
| TC-019 | Outbound logging | Reply kosong tidak dicatat | Handler return reply kosong/whitespace | Tidak ada outbound log kosong |
| TC-020 | Baileys bot | QR login pertama | Jalankan `pnpm dev:bot`, scan QR dari WhatsApp Linked Devices | Session tersimpan di `BAILEYS_AUTH_DIR`, koneksi open |
| TC-021 | Baileys bot | Session lama dipakai ulang | Restart bot setelah login | Bot reconnect tanpa scan QR ulang |
| TC-022 | Baileys inbound | Text private chat diteruskan ke API | Kirim pesan WhatsApp personal ke nomor bot | Bot POST ke `/api/bot/inbound` dan mengirim reply |
| TC-023 | Baileys inbound | Group chat diabaikan | Kirim pesan di grup yang ada bot | Tidak ada inbound API call dan tidak ada reply |
| TC-024 | Baileys inbound | Pesan dari bot sendiri diabaikan | Bot menerima echo/fromMe | Tidak diproses ulang |
| TC-025 | Baileys inbound | Image message diproses | Kirim gambar struk via WhatsApp | Bot download media, kirim base64 ke `/api/bot/inbound` |
| TC-026 | Registration gate | User baru kirim selain register | Text `makan 20000` dari user baru | Bot meminta user mengetik `register`, tidak insert transaksi |
| TC-027 | Registration gate | User baru kirim `register` | Text `register` | Onboarding dimulai, pertanyaan awal dikirim |
| TC-028 | Registration gate | Register case-insensitive | Text `REGISTER` atau `Register` | Tetap memulai onboarding |
| TC-029 | Registration gate | Register dengan spasi | Text ` register ` | Tetap dikenali |
| TC-030 | Onboarding | Flow awal WAIT_REGISTER | User PENDING pada step WAIT_REGISTER kirim `register` | `onboardingStatus=IN_PROGRESS`, step berikutnya aktif |
| TC-031 | Onboarding phone | Phone verification valid | Isi nomor HP sesuai format Indonesia | Jawaban tersimpan, lanjut step berikut |
| TC-032 | Onboarding phone | Phone verification invalid | Isi `abcd` | Bot meminta input nomor yang valid, step tidak maju |
| TC-033 | Onboarding goal | Pilih primary goal manage expenses | Jawab opsi manage expenses | `primaryGoal=MANAGE_EXPENSES` |
| TC-034 | Onboarding goal | Pilih primary goal save disciplined | Jawab opsi save disciplined | `primaryGoal=SAVE_DISCIPLINED` |
| TC-035 | Onboarding goal | Pilih track investments | Jawab opsi investasi | `primaryGoal=TRACK_INVESTMENTS` |
| TC-036 | Onboarding goal | Pilih financial freedom | Jawab opsi financial freedom | `primaryGoal=FINANCIAL_FREEDOM` |
| TC-037 | Onboarding goal | Pilih all of the above | Jawab opsi semua | `primaryGoal=ALL_OF_THE_ABOVE` |
| TC-038 | Onboarding goal | Input goal ambigu | Jawab `mau lebih baik` | Bot klarifikasi/menolak dan step tetap |
| TC-039 | Employment | Pilih student | Jawab mahasiswa/pelajar | `employmentType=STUDENT` |
| TC-040 | Employment | Pilih employee | Jawab karyawan | `employmentType=EMPLOYEE` |
| TC-041 | Employment | Pilih freelancer | Jawab freelancer | `employmentType=FREELANCER` |
| TC-042 | Employment | Pilih entrepreneur | Jawab bisnis/usaha | `employmentType=ENTREPRENEUR` |
| TC-043 | Employment | Pilih mixed | Jawab karyawan dan freelancer | `employmentType=MIXED` |
| TC-044 | Income active | User punya active income | Jawab ya pada `HAS_ACTIVE_INCOME` | Bot lanjut ke jumlah active income |
| TC-045 | Income active | User tidak punya active income | Jawab tidak | Active income tidak diwajibkan, lanjut passive/estimate |
| TC-046 | Income active count | Count valid 1 | Jawab `1` | Step lanjut input active income |
| TC-047 | Income active count | Count valid lebih dari 1 | Jawab `3` | Sistem siap menerima 3 income atau aggregate sesuai flow |
| TC-048 | Income active count | Count invalid nol | Jawab `0` | Bot meminta angka valid |
| TC-049 | Income active amount | Nominal rupiah normal | Jawab `5000000` | `activeIncomeMonthly=5000000` |
| TC-050 | Income active amount | Nominal singkatan juta | Jawab `5 juta` | Tersimpan 5000000 |
| TC-051 | Income active amount | Nominal format Rp | Jawab `Rp5.000.000` | Tersimpan 5000000 |
| TC-052 | Income active amount | Nominal negatif ditolak | Jawab `-5000000` | Bot meminta nominal valid |
| TC-053 | Salary date | Tanggal gajian valid awal bulan | Jawab `1` | `salaryDate=1` |
| TC-054 | Salary date | Tanggal gajian valid akhir bulan | Jawab `31` | `salaryDate=31` |
| TC-055 | Salary date | Tanggal gajian invalid | Jawab `32` | Bot meminta 1-31 |
| TC-056 | Salary cycle | Konfirmasi siklus active income | Jawab setuju | Step lanjut, data income cycle dipakai |
| TC-057 | Passive income | User punya passive income | Jawab ya | Step passive income amount aktif |
| TC-058 | Passive income | User tidak punya passive income | Jawab tidak | `hasPassiveIncome=false`, lanjut |
| TC-059 | Passive income amount | Passive income valid | Jawab `750 ribu` | `passiveIncomeMonthly=750000` |
| TC-060 | Income estimate | Estimated monthly income valid | Jawab `6 juta per bulan` | `estimatedMonthlyIncome=6000000` |
| TC-061 | Budget mode | Pilih manual plan | Jawab manual | `budgetMode=MANUAL_PLAN` |
| TC-062 | Budget mode | Pilih guided plan | Jawab guided/dipandu | `budgetMode=GUIDED_PLAN` |
| TC-063 | Budget mode | Pilih auto from transactions | Jawab otomatis | `budgetMode=AUTO_FROM_TRANSACTIONS` |
| TC-064 | Manual expense | Breakdown total valid | Input `makan 2jt, transport 500rb, bills 1jt` | Expense plan dan item dibuat |
| TC-065 | Manual expense | Breakdown kategori tidak dikenal | Input `random 500rb` | Tetap disimpan sebagai kategori lain atau diklarifikasi sesuai parser |
| TC-066 | Manual expense | Breakdown tanpa nominal | Input `makan banyak` | Ditolak/klarifikasi |
| TC-067 | Guided expense | Food expense valid | Jawab `1.5 juta` | Item food tersimpan |
| TC-068 | Guided expense | Transport expense valid | Jawab `400000` | Item transport tersimpan |
| TC-069 | Guided expense | Bills expense valid | Jawab `800rb` | Item bills tersimpan |
| TC-070 | Guided expense | Entertainment expense valid | Jawab `300 ribu` | Item entertainment tersimpan |
| TC-071 | Guided expense | Others expense valid | Jawab `200 ribu` | Item others tersimpan dan total expense dihitung |
| TC-072 | Goal onboarding | Pilih emergency fund | Jawab dana darurat | Financial goal emergency fund dibuat/step lanjut amount |
| TC-073 | Goal onboarding | Pilih rumah | Jawab rumah | Goal type HOUSE |
| TC-074 | Goal onboarding | Pilih kendaraan | Jawab mobil/motor | Goal type VEHICLE |
| TC-075 | Goal onboarding | Pilih vacation | Jawab liburan | Goal type VACATION |
| TC-076 | Goal onboarding | Pilih custom | Jawab custom/lainnya | Bot meminta goal custom name |
| TC-077 | Goal custom | Nama goal custom valid | Jawab `Nikah` | Goal name disimpan |
| TC-078 | Goal amount | Target amount valid | Jawab `50 juta` | `targetAmount=50000000` |
| TC-079 | Goal amount | Target amount nol ditolak | Jawab `0` | Bot meminta nominal target valid |
| TC-080 | Goal date | Target month/year valid | Jawab `Desember 2027` | `targetMonth=12`, `targetYear=2027` |
| TC-081 | Goal date | Target date lampau | Jawab tahun sebelum current year | Bot meminta tanggal masa depan |
| TC-082 | Goal allocation | Sequential allocation | Pilih fokus satu per satu | `goalExecutionMode=SEQUENTIAL` |
| TC-083 | Goal allocation | Parallel allocation | Pilih paralel | `goalExecutionMode=PARALLEL` |
| TC-084 | Goal priority | Pilih priority focus | Pilih goal tertentu sebagai prioritas | `priorityGoalType` dan priority order tersimpan |
| TC-085 | Goal expense strategy | Strategy auto from expense | Pilih pakai expense | Calculation type sesuai formula/auto |
| TC-086 | Goal financial freedom age | Umur valid | Jawab `45` | `targetFinancialFreedomAge=45` |
| TC-087 | Goal financial freedom age | Umur terlalu rendah | Jawab `10` | Ditolak/klarifikasi |
| TC-088 | Goal add more | User tambah goal lagi | Jawab ya pada add more | Bot kembali ke selection goal |
| TC-089 | Goal add more | User selesai tambah goal | Jawab tidak | Flow lanjut aset/personalisasi |
| TC-090 | Asset onboarding | Pilih tabungan | Jawab savings/tabungan | Step nama/balance tabungan aktif |
| TC-091 | Asset onboarding | Pilih emas | Jawab emas | Step detail emas aktif |
| TC-092 | Asset onboarding | Pilih saham | Jawab saham | Step symbol/lot aktif |
| TC-093 | Asset onboarding | Pilih crypto | Jawab crypto | Step symbol/quantity aktif |
| TC-094 | Asset onboarding | Pilih reksadana | Jawab mutual fund/reksadana | Step symbol/units aktif |
| TC-095 | Asset onboarding | Pilih properti | Jawab properti | Step property detail aktif |
| TC-096 | Asset savings | Nama tabungan valid | Jawab `BCA utama` | AssetName tersimpan |
| TC-097 | Asset savings | Balance valid | Jawab `12 juta` | Asset savings value tersimpan |
| TC-098 | Asset gold | Tipe emas valid | Jawab `batangan` | Notes/type emas tersimpan |
| TC-099 | Asset gold | Brand emas valid | Jawab `Antam` | Brand tersimpan |
| TC-100 | Asset gold | Nama aset emas valid | Jawab `Emas Antam 10gr` | AssetName tersimpan |
| TC-101 | Asset gold | Gram valid decimal | Jawab `10.5 gram` | Quantity 10.5 unit gram |
| TC-102 | Asset gold | Karat valid | Jawab `24` | Karat tersimpan di notes atau unit detail |
| TC-103 | Asset gold | Platform valid | Jawab `Pegadaian` | Platform tersimpan |
| TC-104 | Asset stock | Symbol saham valid | Jawab `BBCA` | Symbol dinormalisasi uppercase |
| TC-105 | Asset stock | Lots valid | Jawab `10 lot` | Quantity disimpan sesuai lot/share rule |
| TC-106 | Asset stock | Lots invalid decimal negatif | Jawab `-2 lot` | Ditolak |
| TC-107 | Asset crypto | Symbol crypto valid | Jawab `BTC` | Symbol uppercase |
| TC-108 | Asset crypto | Quantity crypto decimal | Jawab `0.025` | Quantity decimal tersimpan |
| TC-109 | Asset mutual fund | Symbol/name reksadana valid | Jawab nama produk | Asset mutual fund tersimpan |
| TC-110 | Asset mutual fund | Units valid decimal | Jawab `123.45 unit` | Quantity tersimpan |
| TC-111 | Asset property | Property name valid | Jawab `Rumah Bandung` | AssetName tersimpan |
| TC-112 | Asset property | Estimated value valid | Jawab `850 juta` | Estimated value tersimpan |
| TC-113 | Asset other | Asset name generic valid | Jawab `Laptop kerja` | Asset OTHER tersimpan |
| TC-114 | Asset other | Estimated value generic valid | Jawab `15 juta` | Estimated value tersimpan |
| TC-115 | Asset add more | User tambah asset lagi | Jawab ya | Flow kembali ke asset selection |
| TC-116 | Asset add more | User selesai asset | Jawab tidak | Flow lanjut personalization/analysis |
| TC-117 | Personalization | Pilihan reminder aktif | Pilih reminder/insight aktif | Preference dibuat sesuai pilihan |
| TC-118 | Personalization | Pilihan minimal | Pilih mode minimal | Preference mengurangi notifikasi sesuai mapping |
| TC-119 | Onboarding complete | Semua step selesai | Selesaikan flow valid | `registrationStatus=COMPLETED`, `onboardingStatus=COMPLETED`, `analysisReady=true` |
| TC-120 | Onboarding complete | Fitur aktif setelah complete | Selesaikan onboarding user baru | User `COMPLETED`, `analysisReady=true`, bot mengirim ringkasan dan fitur aktif langsung |
| TC-121 | Onboarding session | Jawaban tiap step tersimpan | Selesaikan beberapa step | `OnboardingSession` berisi raw/normalized answer per step |
| TC-122 | Onboarding resume | User berhenti di tengah lalu lanjut | Stop setelah budget, kirim jawaban berikutnya | Flow lanjut dari step terakhir |
| TC-123 | Onboarding duplicate | User kirim jawaban sama dua kali cepat | Kirim dua request identik | Tidak membuat state inkonsisten atau duplikasi fatal |
| TC-124 | Onboarding image | User kirim gambar saat onboarding text step | Kirim image pada step nominal | Bot meminta jawaban text yang sesuai |
| TC-125 | Command parser | `/help` dikenali | Text `/help` dari user completed | Reply command list |
| TC-126 | Command parser | `/report` tanpa period | Text `/report` | Reply menu/pilihan report |
| TC-127 | Command parser | `/report daily` | Text `/report daily` | Generate daily report |
| TC-128 | Command parser | `/report weekly` | Text `/report weekly` | Generate weekly report |
| TC-129 | Command parser | `/report monthly` | Text `/report monthly` | Generate monthly report default |
| TC-130 | Command parser | `/monthly report` alias | Text `/monthly report` | Monthly report default |
| TC-131 | Command parser | `/calendar report` alias | Text `/calendar report` | Monthly report calendar mode |
| TC-132 | Command parser | `/report kalender` alias | Text `/report kalender` | Monthly report calendar mode |
| TC-133 | Command parser | `/cashflow report` alias | Text `/cashflow report` | Monthly report financial cycle mode |
| TC-134 | Command parser | `/gajian report` alias | Text `/gajian report` | Monthly report financial cycle mode |
| TC-135 | Command parser | Unknown slash command | Text `/unknown` | Bot fallback, tidak insert transaksi |
| TC-136 | Text transaction | Expense sederhana | `makan siang 45000` | Transaction EXPENSE amount 45000 category food/makan |
| TC-137 | Text transaction | Income sederhana | `gaji 5000000` | Transaction INCOME amount 5000000 category salary/gaji |
| TC-138 | Text transaction | Saving transaction | `nabung 500000 untuk dana darurat` | Transaction SAVING dan goal contribution jika relevan |
| TC-139 | Text transaction | Amount dengan Rp dan titik | `beli kopi Rp25.000` | Amount 25000 |
| TC-140 | Text transaction | Amount dengan koma decimal | `bunga bank 12,500` | Parser tidak salah menjadi 12.5 jika konteks IDR |
| TC-141 | Text transaction | Amount singkatan ribu | `parkir 5rb` | Amount 5000 |
| TC-142 | Text transaction | Amount singkatan juta | `bonus 2jt` | Amount 2000000 |
| TC-143 | Text transaction | Amount kata Indonesia | `makan dua puluh ribu` | Jika parser mendukung, amount 20000; jika tidak, klarifikasi |
| TC-144 | Text transaction | Tanpa amount | `makan nasi padang` | Bot meminta nominal, tidak insert transaksi |
| TC-145 | Text transaction | Amount nol | `makan 0` | Ditolak, tidak insert |
| TC-146 | Text transaction | Amount negatif | `refund -50000` | Tidak membuat expense negatif; diarahkan sebagai income/refund atau ditolak |
| TC-147 | Text transaction | Multi transaksi dalam satu pesan | `kopi 20rb, bensin 50rb` | Sistem insert multi atau meminta klarifikasi sesuai requirement |
| TC-148 | Text transaction | Tanggal eksplisit hari ini | `hari ini makan 30000` | `occurredAt` tanggal hari ini |
| TC-149 | Text transaction | Tanggal eksplisit kemarin | `kemarin belanja 120000` | `occurredAt` tanggal kemarin |
| TC-150 | Text transaction | Tanggal spesifik | `1 Mei 2026 bayar kos 1500000` | `occurredAt` sesuai tanggal |
| TC-151 | Text transaction | Future date tidak wajar | `besok makan 50000` | Tidak mencatat masa depan atau meminta konfirmasi |
| TC-152 | Text transaction | Merchant terdeteksi | `beli kopi di Starbucks 55000` | Merchant `Starbucks`, category sesuai |
| TC-153 | Text transaction | Detail tag terdeteksi | `gofood ayam geprek 35000` | Detail tag/merchant/category tersimpan |
| TC-154 | Text transaction | Category override user | User pernah override `kopi` ke `Cafe` lalu kirim `kopi 20000` | Category mengikuti override |
| TC-155 | Text transaction | Fallback parser ketika AI gagal | Mock Gemini error, input `makan 45000` | Fallback parser insert transaksi jika confidence cukup |
| TC-156 | Text transaction | AI output JSON invalid | Mock AI balas non JSON | Tidak crash, fallback/klarifikasi |
| TC-157 | Text transaction | AI output schema invalid amount string kosong | Mock extraction invalid | Tidak insert partial transaction |
| TC-158 | Text transaction | Long note aman | Kirim note panjang 1000 karakter dengan amount | Tidak crash, note dipotong/disimpan aman |
| TC-159 | Text transaction | Emoji di text | `🍜 ramen 65000` | Parser tetap mengenali transaksi atau klarifikasi aman |
| TC-160 | OCR transaction | Struk jelas | Kirim image struk restoran | OCR text dinormalisasi, transaksi EXPENSE dibuat |
| TC-161 | OCR transaction | Struk tanpa total jelas | Image OCR tidak menemukan total | Bot meminta klarifikasi, tidak insert partial |
| TC-162 | OCR transaction | OCR gagal provider | Mock Vision error | Reply fallback OCR gagal, tidak insert transaksi |
| TC-163 | OCR transaction | Gemini normalization gagal | OCR sukses, Gemini error | Tidak insert partial, user diberi fallback |
| TC-164 | OCR transaction | Caption menambah konteks | Image struk + caption `ini makan malam` | Category/note memakai caption |
| TC-165 | OCR transaction | Image base64 invalid | `imageBase64` rusak | Error ditangani, tidak crash |
| TC-166 | OCR transaction | Struk dengan pajak/service | OCR total termasuk pajak | Amount memakai total akhir, bukan subtotal |
| TC-167 | OCR transaction | Struk e-wallet topup | Image topup saldo | Category income/transfer atau expense sesuai rule, tidak salah dobel |
| TC-168 | Budget command | `/budget set` mulai flow | Text `/budget set` | Bot meminta kategori/nominal |
| TC-169 | Budget command | Natural budget valid | `budget makan 2 juta/bulan` | Budget category makan limit 2000000 tersimpan |
| TC-170 | Budget command | Slash budget direct valid | `/budget set makan 1500000` | Budget makan tersimpan/update |
| TC-171 | Budget command | Budget category case-insensitive | `/budget set Makan 1500000` | Category normal konsisten |
| TC-172 | Budget command | Budget amount invalid | `/budget set makan abc` | Bot meminta nominal valid |
| TC-173 | Budget command | Budget amount nol | `/budget set makan 0` | Ditolak |
| TC-174 | Budget alert | Near limit alert | Budget makan 1jt, spending bulan ini 850rb, tambah 100rb | Bot mengirim near-limit alert |
| TC-175 | Budget alert | Exceeded alert | Budget 1jt, spending 950rb, tambah 100rb | Bot mengirim exceeded alert |
| TC-176 | Budget alert | Alert tidak muncul untuk income | Budget makan ada, input gaji | Tidak ada budget spending alert |
| TC-177 | Budget alert | Alert per kategori | Budget makan hampir habis, transaksi transport | Alert makan tidak muncul |
| TC-178 | Goal command | `/set goal` mulai flow | Text `/set goal` | Bot mulai goal set flow |
| TC-179 | Goal command | `/goal add` mulai flow tambah goal | Text `/goal add` | Bot mulai flow tambah goal |
| TC-180 | Goal command | Natural goal valid | `mau nabung 50 juta` | SavingsGoal/FinancialGoal target 50000000 dibuat |
| TC-181 | Goal command | Goal status simple | `/goal status` | Reply progress semua goal aktif |
| TC-182 | Goal command | Goal status query spesifik | `/goal status rumah` | Reply goal rumah jika ada |
| TC-183 | Goal command | Goal contribution valid | `nabung 500rb ke rumah` | GoalContribution dibuat dan progress bertambah |
| TC-184 | Goal command | Contribution goal tidak ditemukan | `nabung 500rb ke yacht` | Bot meminta pilih goal yang ada |
| TC-185 | Goal command | Goal reached | Progress melewati target | Status completed atau message goal reached sesuai rule |
| TC-186 | Goal planning | Estimasi bulan goal | Target 12jt, saving potential 1jt/bulan | `estimatedMonthsToGoal=12` |
| TC-187 | Goal planning | Saving potential nol | Expense >= income | Estimasi tidak negatif, bot memberi saran realistis |
| TC-188 | Financial profile | Recalculate profile | POST `/api/financial-profile/recalculate` user valid | Income, expense, saving rate, emergency target dihitung |
| TC-189 | Financial profile | Profile user belum lengkap | Recalculate user tanpa onboarding lengkap | Response graceful, field kosong tidak crash |
| TC-190 | Financial health | Health score income positif expense rendah | Input profile sehat | Score tinggi dan alasan sesuai |
| TC-191 | Financial health | Health score expense lebih besar income | Input overspending | Score rendah dan warning |
| TC-192 | Cashflow forecast | Forecast siklus gajian | Salary date 25, transaksi berjalan | Forecast memakai range gajian |
| TC-193 | Cashflow forecast | Forecast tanpa salary date | User tanpa salaryDate | Fallback calendar month |
| TC-194 | Report aggregation | Daily aggregation expense/income | Seed transaksi hari ini | Total daily benar |
| TC-195 | Report aggregation | Weekly aggregation | Seed transaksi dalam minggu sama | Total weekly benar |
| TC-196 | Report aggregation | Monthly calendar aggregation | Seed transaksi bulan berjalan | Total monthly calendar benar |
| TC-197 | Report aggregation | Monthly financial cycle | Salary date 25, tanggal sekarang 8 Mei 2026 | Range 25 Apr 2026 sampai 24 Mei 2026 |
| TC-198 | Report aggregation | Boundary start included | Transaksi tepat awal range | Masuk report |
| TC-199 | Report aggregation | Boundary end excluded/included sesuai rule | Transaksi tepat setelah akhir range | Tidak masuk jika end exclusive |
| TC-200 | Report response | Report tanpa transaksi | `/report daily` user tanpa transaksi | Reply menyebut belum ada data, tidak error |
| TC-201 | Report response | Report dengan chart service aktif | Reporting service hidup | Reply text dan image/chart URL/base64 dikirim |
| TC-202 | Report response | Chart service mati | Matikan reporting service | Reply text tetap dikirim, image fallback graceful |
| TC-203 | Report response | Insight AI gagal | Mock AI insight error | Report tetap berisi rule-based summary |
| TC-204 | Report formatting | Rupiah formatting | Amount 1500000 | Tampil `Rp1.500.000` atau format IDR konsisten |
| TC-205 | Report formatting | Persentase saving rate | Income 10jt, expense 7jt | Saving rate 30% |
| TC-206 | Reporting service | `/chart` valid data | POST FastAPI dengan series valid | Response PNG `image/png` |
| TC-207 | Reporting service | Empty chart data | POST series kosong | Response fallback PNG atau valid error 4xx terkontrol |
| TC-208 | Reporting service | Large chart data | POST 365 point | Response masih valid dan tidak timeout wajar |
| TC-209 | Insight command | `/insight` jika didukung | Kirim `/insight` | Bot membalas insight pengeluaran/user context |
| TC-210 | General chat | Pertanyaan finance umum | `gimana cara hemat makan?` | Bot memberi advice, tidak insert transaksi |
| TC-211 | General chat | Pertanyaan non-finance | `ceritain film` | Bot membatasi atau menjawab sesuai policy app |
| TC-212 | Global router | Ambiguitas command vs transaksi | `report makan 50000` | Router memilih handler yang benar atau klarifikasi |
| TC-213 | Global router | Memory percakapan dipakai | User sebelumnya bahas budget, lalu `iya 2 juta` | Pending action diselesaikan sebagai budget |
| TC-214 | Pending action | Pending action expired | Buat pending action lama lalu user balas | Tidak memakai konteks kedaluwarsa |
| TC-215 | Privacy command | Hapus data jika command ada | Kirim command privacy delete sesuai implementasi | Data user dihapus/anonim sesuai rule |
| TC-216 | Plain command | Command tanpa slash yang dikenali | `summary minggu ini` | Weekly report dikirim |
| TC-217 | Plain command | `help` tanpa slash | Kirim `help` | Bot memberi bantuan atau fallback sesuai plain command |
| TC-218 | Transaction mutation | Edit transaksi terakhir amount | Setelah transaksi, kirim `ubah jadi 60000` | Transaksi terakhir terupdate amount |
| TC-219 | Transaction mutation | Edit kategori terakhir | Kirim `itu kategori transport` | Category transaksi terakhir berubah |
| TC-220 | Transaction mutation | Hapus transaksi terakhir | Kirim `hapus transaksi terakhir` | Transaksi terakhir dihapus/soft delete sesuai implementasi |
| TC-221 | Transaction mutation | Undo tanpa transaksi | User baru kirim hapus terakhir | Bot bilang tidak ada transaksi |
| TC-222 | Recurring expense | Deteksi langganan bulanan | Input Netflix 65000 dua bulan berturut | Recurring expense detected |
| TC-223 | Recurring expense | Tidak false positive transaksi sekali | Input Netflix sekali | Tidak langsung dianggap recurring |
| TC-224 | Spending anomaly | Spike pengeluaran | Spending kategori naik jauh dari baseline | Anomaly detected/reminder eligible |
| TC-225 | Spending anomaly | Normal spending | Spending sesuai baseline | Tidak ada anomaly |
| TC-226 | Category override | Override manual tersimpan | User koreksi kategori transaksi | Override rule dibuat |
| TC-227 | Category override | Override dipakai di masa depan | Kirim merchant sama setelah override | Category mengikuti override |
| TC-228 | Merchant normalization | Merchant beda casing | `starbucks`, `StarBucks` | Normalisasi merchant sama |
| TC-229 | Detail tag | Tag makanan | `ayam geprek 25000` | Detail tag `ayam geprek` atau food detail sesuai rule |
| TC-230 | Detail tag | Tag transport | `grab 45000` | Detail tag ride-hailing/transport |
| TC-231 | Market price | Quote saham valid | Query price `BBCA` | Mengembalikan harga dan currency benar |
| TC-232 | Market price | Quote crypto valid | Query `BTC` | Mengembalikan harga crypto |
| TC-233 | Market price | Provider primary gagal | Mock primary market provider error | Fallback provider/cache dipakai |
| TC-234 | Market price | Symbol tidak dikenal | Query `ZZZZ_UNKNOWN` | Error graceful, tidak crash |
| TC-235 | Market cache | Cache hit | Query symbol sama dua kali dalam TTL | Call provider hanya sekali |
| TC-236 | Finance news | News valid | Request market news | List news ringkas dikembalikan |
| TC-237 | Finance news | News provider gagal | Mock provider error | Fallback kosong/error graceful |
| TC-238 | Portfolio command | Tambah saham via command | `beli 10 lot BBCA di 9000` | PortfolioAsset dan PortfolioTrade BUY dibuat |
| TC-239 | Portfolio command | Jual saham sebagian | Existing BBCA 10 lot, `jual 2 lot BBCA di 9500` | Quantity turun, trade SELL dan PnL dihitung |
| TC-240 | Portfolio command | Jual lebih dari holdings | Existing 1 lot, jual 2 lot | Ditolak, quantity tidak negatif |
| TC-241 | Portfolio command | Tambah crypto | `beli 0.01 BTC di 900 juta` | Asset crypto dibuat |
| TC-242 | Portfolio command | Tambah emas | `beli emas 5 gram 1 juta per gram` | Asset GOLD/trade dibuat sesuai service |
| TC-243 | Portfolio valuation | Valuasi portfolio | Asset dengan current price tersedia | Total value dan gain/loss benar |
| TC-244 | Portfolio valuation | Price unavailable | Asset tanpa current price | Valuation tetap partial dan memberi warning |
| TC-245 | Asset API | GET assets user valid | Request `/api/assets` user valid | Mengembalikan list assets user saja |
| TC-246 | Asset API | POST asset valid | Buat asset CASH/SAVINGS | Asset tersimpan |
| TC-247 | Asset API | POST asset invalid type | Kirim type tidak ada | 400 validation error |
| TC-248 | Access after onboarding | Completed user boleh akses | User `registrationStatus=COMPLETED`, kirim command finance | Command diproses tanpa akses berbayar |
| TC-249 | Access before onboarding | Pending user belum boleh catat transaksi | User PENDING kirim transaksi | Bot meminta `register`, tidak insert transaksi |
| TC-250 | Access after onboarding | Completed user dari data lama tetap boleh akses | User completed dari seed lama | Command finance diproses normal |
| TC-251 | Access state | User `onboardingStatus=COMPLETED` tetapi registration belum completed | Kirim command finance | Sistem mengikuti rule completed yang disepakati atau menyelaraskan status |
| TC-252 | Access state | User registration completed tetapi onboarding belum completed | Kirim command finance | Sistem tidak melewati onboarding yang belum selesai |
| TC-253 | Access migration | User lama dengan completed status diproses | Seed user lama | Tidak error dan fitur tetap aktif |
| TC-254 | Legacy cleanup | Endpoint billing lama sudah tidak ada | Akses endpoint billing lama | 404 route not found |
| TC-255 | Legacy cleanup | Endpoint konfirmasi billing lama sudah tidak ada | Akses endpoint konfirmasi billing lama | 404 route not found |
| TC-256 | Legacy cleanup | Webhook billing lama sudah tidak ada | Akses webhook billing lama | 404 route not found |
| TC-257 | Removed schema | Prisma schema tidak memiliki model billing session lama | Inspect Prisma schema/generated client | Model billing lama tidak ada |
| TC-258 | Removed schema | Prisma schema tidak memiliki model akses berbayar lama | Inspect Prisma schema/generated client | Model akses berbayar lama tidak ada |
| TC-259 | Removed schema | Prisma schema tidak memiliki model event provider billing lama | Inspect Prisma schema/generated client | Model event provider lama tidak ada |
| TC-260 | Removed env | API tidak membutuhkan env billing provider | Jalankan typecheck/start tanpa env billing provider | Tidak ada validation error billing |
| TC-261 | Removed UI | Admin billing page tidak tersedia | Buka route admin billing lama | 404 atau tidak ada entry navigasi |
| TC-262 | Admin auth | Login password benar | Submit `/login` password env | Cookie session dibuat, redirect admin |
| TC-263 | Admin auth | Login password salah | Submit password salah | Error login, cookie tidak dibuat |
| TC-264 | Admin auth | Protected route tanpa cookie | Buka `/users` tanpa login | Redirect ke login |
| TC-265 | Admin auth | Logout | Buka `/logout` | Cookie clear, redirect login |
| TC-266 | Admin API auth | Admin endpoint tanpa token | GET `/api/admin/users` tanpa `x-admin-token` | 401/403 |
| TC-267 | Admin API auth | Admin endpoint token salah | Header salah | 401/403 |
| TC-268 | Admin API auth | Admin endpoint token benar | Header benar | Response data |
| TC-269 | Admin users | List users | Seed beberapa user | Tabel/list user tampil semua sesuai pagination/default |
| TC-270 | Admin users | Delete user | Submit delete user valid | User dan relasi cascade terhapus |
| TC-271 | Admin users | Delete user invalid | Delete id tidak ada | Error graceful |
| TC-272 | Admin transactions | List transactions | Seed transaksi beberapa user | Tabel tampil dengan amount/category/date |
| TC-273 | Admin transactions | Filter by user | Pilih user tertentu | Hanya transaksi user tersebut |
| TC-274 | Admin transactions | Filter by type | Filter EXPENSE | Hanya expense |
| TC-275 | Admin transactions | Filter date range | Range 1-30 Apr | Hanya transaksi dalam range |
| TC-276 | Admin transactions | Empty filter result | Filter tidak match | Empty state tampil, bukan error |
| TC-277 | Admin users | Users page tanpa billing column | Buka `/users` | Tidak ada kolom/status billing |
| TC-278 | Admin users | User completed terlihat aktif dari onboarding | Seed user completed | Badge journey success |
| TC-279 | Admin removed route | Admin billing endpoint sudah tidak ada | Akses endpoint admin billing lama | 404 route not found |
| TC-280 | Admin health | Health endpoint | GET `/api/admin/health` token valid | DB/system status dikembalikan |
| TC-281 | Admin observability | Observability list | Seed intent observations | Page menampilkan handledBy, commandKind, ambiguity |
| TC-282 | Admin observability | Filter ambiguity | Filter ambiguity true jika tersedia | Hanya ambiguous observations |
| TC-283 | Admin removed page | Billing page lama sudah tidak ada | Buka route billing lama | 404 route not found |
| TC-284 | Admin removed page | Tidak ada link billing di UI | Cek navigasi/admin pages | Tidak ada tombol/link billing |
| TC-285 | Admin removed action | Tidak ada action konfirmasi billing | Cari action billing | File/action tidak tersedia |
| TC-286 | Admin removed dependency | Admin web tidak memakai billing API | Build admin web | Tidak ada import billing API |
| TC-287 | Web UI layout | Login responsive mobile | Buka login 375px | Form tidak overflow |
| TC-288 | Web UI layout | Users table responsive | Buka users mobile | Data tetap bisa discan/scroll wajar |
| TC-289 | Web UI layout | Transactions table responsive | Buka transactions mobile | Filter dan table tidak overlap |
| TC-290 | Bot worker | Poll outbound pending | Buat OutboundMessage PENDING | Bot worker mengambil pesan |
| TC-291 | Bot worker | Send WA success | Mock Baileys `sock.sendMessage` success | Pesan status SENT, `sentAt` terisi |
| TC-292 | Bot worker | Send WA gagal | Mock Baileys `sock.sendMessage` error | Pesan status FAILED, `errorMessage` terisi |
| TC-293 | Bot worker | Ack outbound valid | POST ack id processing | Status berubah sesuai request |
| TC-294 | Bot worker | Ack invalid id | POST ack id tidak ada | Error graceful |
| TC-295 | Baileys outbound | Send text payload | Kirim outbound text | `sock.sendMessage(jid, { text })` terpanggil |
| TC-296 | Baileys outbound | Send image payload | Kirim report chart | `sock.sendMessage(jid, { image, mimetype, caption })` terpanggil |
| TC-297 | Reminder preference | Default preference user baru | User completed tanpa custom pref | Preference default enabled true sesuai schema |
| TC-298 | Reminder preference | Update quiet hours valid | Set quiet 22-7 | Preference tersimpan |
| TC-299 | Reminder preference | Quiet hours invalid | Set 25-30 | Ditolak |
| TC-300 | Reminder preference | Snooze reminder | Set snoozedUntil future | Reminder runner tidak mengirim selama snooze |
| TC-301 | Reminder budget | Budget near limit sweep | User spending mendekati limit | Reminder event dan outbound dibuat |
| TC-302 | Reminder budget | Budget exceeded sweep | Spending melewati limit | Reminder exceeded dibuat |
| TC-303 | Reminder budget | Budget reminder disabled | `budgetEnabled=false` | Tidak mengirim budget reminder |
| TC-304 | Reminder weekly | Weekly spending spike | Spending minggu ini jauh lebih tinggi | Weekly spike reminder dibuat |
| TC-305 | Reminder weekly | Weekly disabled | `weeklyEnabled=false` | Tidak mengirim weekly reminder |
| TC-306 | Reminder goal | Goal reached reminder | Contribution mencapai target | Goal reminder dibuat satu kali |
| TC-307 | Reminder goal | Goal disabled | `goalEnabled=false` | Tidak mengirim goal reminder |
| TC-308 | Reminder recurring | Recurring bill due | Ada recurring expense due | Reminder recurring dibuat |
| TC-309 | Reminder cashflow | Cashflow low balance warning | Forecast negatif | Reminder cashflow dibuat |
| TC-310 | Reminder monthly closing | Akhir bulan | Tanggal akhir bulan/siklus | Monthly closing reminder dibuat |
| TC-311 | Reminder cap | Max per day | User sudah menerima `maxPerDay` reminder hari itu | Reminder berikutnya tidak dikirim |
| TC-312 | Reminder min interval | Min interval belum lewat | Reminder type sama baru terkirim | Tidak kirim ulang |
| TC-313 | Reminder event idempotency | Marker sama | Jalankan sweep dua kali | Reminder event tidak duplikat |
| TC-314 | Reminder route auth | Run reminders tanpa token | POST `/api/bot/reminders/run` tanpa token | 401/403 |
| TC-315 | Reminder route auth | Run reminders token valid | POST dengan internal token | Sweep berjalan |
| TC-316 | Heartbeat | Bot heartbeat valid | POST `/api/bot/heartbeat` token valid | `SystemHeartbeat` bot updated |
| TC-317 | Heartbeat | Heartbeat tanpa token | POST tanpa token | 401/403 |
| TC-318 | Health | Public health | GET `/api/health` | Status ok tanpa data sensitif |
| TC-319 | Observability | Intent observation dicatat | Kirim text yang diproses router | `IntentObservation` dibuat |
| TC-320 | Observability | Ambiguous flag | Kirim pesan ambigu | `ambiguityFlag=true` jika router menganggap ambigu |
| TC-321 | AI log | Intent analysis log | AI intent dipanggil | `AIAnalysisLog` type INTENT tersimpan |
| TC-322 | AI log | Extraction log | AI extraction sukses/gagal | Payload JSON log tersimpan tanpa secret |
| TC-323 | AI log | Insight log | AI insight report dipanggil | Log type INSIGHT tersimpan |
| TC-324 | Security | Env validation missing secret | Jalankan API tanpa required env | Startup gagal jelas atau endpoint error terkontrol |
| TC-325 | Security | Admin token tidak bocor | Error admin endpoint | Response tidak memuat token/env |
| TC-326 | Security | Bot internal token tidak bocor | Internal bot endpoint error | Response/log tidak memuat token |
| TC-327 | Security | SQL injection text | Input `makan 1; DROP TABLE User;` | Disimpan sebagai text/note aman, DB tidak rusak |
| TC-328 | Security | XSS di admin table | Note transaksi `<script>alert(1)</script>` | UI menampilkan escaped text, script tidak jalan |
| TC-329 | Security | Oversized text payload | Text sangat panjang | Request ditolak atau diproses tanpa crash |
| TC-330 | Security | Oversized image payload | Base64 sangat besar | Ditolak sesuai limit atau error graceful |
| TC-331 | Data integrity | Delete user cascade | Hapus user dengan transaksi, budget, goals | Relasi ikut terhapus sesuai schema |
| TC-332 | Data integrity | Unique budget per category | Buat budget category sama dua kali | Row update/upsert, bukan duplikat |
| TC-333 | Data integrity | Billing tables removed | Jalankan migration cleanup legacy billing | Tabel billing lama terhapus atau tidak dibuat ulang |
| TC-334 | Data integrity | Unique portfolio asset | Beli asset symbol sama dua kali | Quantity/avg price update, bukan row duplicate |
| TC-335 | Data integrity | Decimal precision transaction | Amount 999999999999.99 | Tersimpan sesuai Decimal(12,2) atau ditolak jika overflow |
| TC-336 | Data integrity | Decimal precision crypto | Quantity 0.00000001 BTC | Tersimpan sesuai Decimal(24,8) |
| TC-337 | Data integrity | BigInt income besar | Income 100 miliar | BigInt field aman |
| TC-338 | Date/time | Timezone Asia/Jakarta transaction | Input hari ini jam lokal | Date range report sesuai Asia/Jakarta expectation |
| TC-339 | Date/time | Month boundary | Transaksi 30 Apr dan 1 Mei | Monthly report Mei hanya ambil 1 Mei ke atas |
| TC-340 | Date/time | Leap year date | Input 29 Feb 2024 | Parser menerima tanggal valid leap year |
| TC-341 | Date/time | Invalid date | Input 31 Feb | Ditolak/klarifikasi |
| TC-342 | Performance | Inbound latency text simple | Kirim 100 text dengan mock AI cepat | P95 latency dalam batas target |
| TC-343 | Performance | Report aggregation banyak transaksi | User 10.000 transaksi | Report selesai dalam batas target dan tidak memory error |
| TC-344 | Performance | Admin transactions banyak data | 50.000 transaksi seed | Page/API memakai pagination/filter, tidak timeout |
| TC-345 | Performance | Reminder sweep banyak user | 10.000 user mock | Sweep selesai batch wajar atau tidak lock DB lama |
| TC-346 | Reliability | DB disconnect | Matikan DB lalu call inbound | Error graceful, tidak unhandled crash |
| TC-347 | Reliability | AI timeout | Mock Gemini timeout | Fallback reply muncul |
| TC-348 | Reliability | OCR timeout | Mock Vision timeout | Image flow fallback |
| TC-349 | Reliability | Market provider timeout | Mock price timeout | Cache/fallback atau error user-friendly |
| TC-350 | Reliability | Baileys reconnect | Putus koneksi socket sementara | Bot reconnect jika belum logged out |
| TC-351 | E2E WhatsApp | New user selesai onboarding | register, isi onboarding valid | User COMPLETED, fitur aktif langsung |
| TC-352 | E2E WhatsApp | User active catat expense lalu report | Active user kirim expense, `/report daily` | Expense tersimpan, report total sesuai |
| TC-353 | E2E WhatsApp | User active set budget lalu exceed | Set budget makan, catat expense lebih limit | Budget alert terkirim |
| TC-354 | E2E WhatsApp | User active goal contribution | Set goal, nabung, cek status | Progress bertambah dan status tampil |
| TC-355 | E2E WhatsApp | Image receipt to report | Kirim struk OCR, lalu report daily | Transaksi OCR masuk total report |
| TC-356 | E2E Admin | Admin monitor user baru | User register dari WA | Admin users menampilkan user dan status onboarding |
| TC-357 | E2E Admin | Admin monitor completed user | Admin buka user completed | Journey completed tampil tanpa status billing |
| TC-358 | E2E Baileys | Baileys inbound sampai reply | Kirim WhatsApp real ke bot | API memproses dan Baileys mengirim reply |
| TC-359 | E2E Reminder | Reminder sweep ke outbound worker | Trigger reminder, worker kirim via Baileys | ReminderEvent dibuat, outbound SENT |
| TC-360 | Regression | Existing Vitest suite | Jalankan `pnpm --filter @finance/api test` | Semua unit/integration test existing pass |

## Suggested Automation Priority

1. **High priority automated tests**: inbound schema, registration gate, onboarding state machine, transaction parser/fallback, report aggregation, admin auth, reminder idempotency, removed billing routes.
2. **Medium priority automated tests**: portfolio valuation, market fallback/cache, financial profile calculation, mutation commands, OCR failure handling.
3. **Manual or semi-automated tests**: real Baileys WhatsApp QR/session, OCR with many real receipt images, responsive visual QA.
4. **Load/security tests**: rate limit, oversized payload, admin table XSS, report aggregation with large dataset, reminder sweep batch.
