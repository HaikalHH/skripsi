# Test Cases Finance Bot

Tanggal pembaruan: 2026-05-24

Dokumen ini berisi daftar test case berdasarkan flow kode aktif pada project saat ini:

- WhatsApp bot worker berbasis Baileys di `apps/bot`.
- Next.js API route handlers di `apps/api/app/api` dan `apps/api/lib/http`.
- Flow inbound utama di `apps/api/lib/inbound`.
- Onboarding terstruktur di `apps/api/lib/services/onboarding/flow`.
- Services transaksi, laporan, goals, assets, portfolio, reminders, market, dan admin monitoring.
- Admin web di `apps/admin-web`.

## Preconditions Umum

- MySQL aktif, schema Prisma sudah dimigrasi, dan Prisma Client sudah di-generate.
- API berjalan di port sesuai `apps/api/.env`.
- Bot Baileys berjalan dengan `BAILEYS_AUTH_DIR` valid.
- `BOT_INTERNAL_TOKEN` sama antara `apps/api` dan `apps/bot`.
- Admin web berjalan dan `ADMIN_API_TOKEN` cocok dengan API.
- Untuk pengujian deterministic, AI, OCR, market provider, dan reporting service boleh dimock.
- Untuk pengujian end-to-end real, Gemini API key, Google Vision credential, dan reporting service FastAPI aktif.
- Nomor WhatsApp uji tidak boleh memakai data production.

## Traceability Flow Kode

| Flow | Entry Point | Modul Utama | Output Utama |
|---|---|---|---|
| Baileys login | `apps/bot/src/runtime/start-bot.ts` | Baileys auth state, QR, reconnect | Session WhatsApp aktif |
| WhatsApp inbound | `processIncomingMessage` | media download, LID mapping, POST inbound | Payload masuk API |
| API inbound | `/api/bot/inbound` | `processInboundBody` | reply payload + outbound log |
| Outbound polling | `/api/bot/outbound` | `claimPendingOutboundMessages` | pesan pending diklaim bot |
| Outbound ack | `/api/bot/outbound/ack` | `ackOutboundMessage` | status SENT/FAILED |
| Onboarding | `/api/onboarding/*` | onboarding orchestrator | profile, goals, assets, analysis |
| Transaction text | inbound structured text | command router, parser, transaction service | transaksi tersimpan |
| Image OCR | inbound image | Vision OCR, normalizer, extractor | transaksi dari struk |
| Report | `/api/report` dan chat command | report builder, chart service | summary + optional image |
| Reminder | `/api/bot/reminders/run` | reminder dispatch | outbound reminder queue |
| Admin | `/api/admin/*` | admin route handlers | monitoring dan data operasional |
| Public web data | `/api/public/*` | dashboard/profile lookup | data dashboard user |

## Functional Test Cases

| ID | Area | Scenario | Steps / Data | Expected Result |
|---|---|---|---|---|
| TC-001 | Bot startup | Bot start pertama kali tanpa session | Jalankan `pnpm dev:bot` dengan `BAILEYS_AUTH_DIR` kosong | QR tampil di terminal, tidak crash |
| TC-002 | Bot startup | Scan QR berhasil | Scan QR dari WhatsApp Linked Devices | Connection `open`, heartbeat/polling/reminder sweep mulai |
| TC-003 | Bot startup | Session lama dipakai ulang | Restart bot setelah login | Tidak perlu scan QR ulang |
| TC-004 | Bot startup | Connection close bukan logout | Simulasikan disconnect transient | Polling berhenti, bot reconnect setelah delay |
| TC-005 | Bot startup | Connection close karena logout | Simulasikan `DisconnectReason.loggedOut` | Bot tidak reconnect otomatis |
| TC-006 | Bot startup | `creds.update` tersimpan | Trigger update credential Baileys | File auth state di `BAILEYS_AUTH_DIR` berubah |
| TC-007 | Bot inbound | Pesan personal text diproses | Kirim chat pribadi `register` | Bot POST ke `/api/bot/inbound` |
| TC-008 | Bot inbound | Pesan grup diabaikan | Kirim pesan di grup yang berisi bot | Tidak ada POST inbound, tidak ada reply |
| TC-009 | Bot inbound | Pesan dari bot sendiri diabaikan | Terima message dengan `fromMe=true` | Tidak diproses ulang |
| TC-010 | Bot inbound | Message tanpa remote JID | Simulasikan msg tanpa `remoteJid` | Function return tanpa error |
| TC-011 | Bot inbound | Message tanpa text/image | Kirim sticker/audio/contact | Tidak diteruskan ke API |
| TC-012 | Bot inbound | Text plain conversation | Kirim `makan siang 45000` | Payload `messageType=TEXT`, `text` sesuai |
| TC-013 | Bot inbound | Extended text message | Kirim reply/quoted text | Text diambil dari `extendedTextMessage.text` |
| TC-014 | Bot inbound | Image dengan caption | Kirim foto struk caption `makan` | Payload `messageType=IMAGE`, `caption`, `mimeType`, `imageBase64` |
| TC-015 | Bot inbound | Image tanpa caption | Kirim foto struk tanpa caption | Caption kosong, media tetap dikirim |
| TC-016 | Bot inbound | Download image gagal | Mock `downloadMediaMessage` throw | Bot kirim fallback error ke user |
| TC-017 | Bot inbound | API inbound gagal HTTP 500 | Mock API response `ok=false` | Bot kirim pesan gangguan layanan |
| TC-018 | Bot inbound | API inbound return single reply | API return `replyText` | Bot mengirim satu pesan WhatsApp |
| TC-019 | Bot inbound | API inbound return multi reply | API return `replyTexts` | Bot mengirim semua bubble berurutan |
| TC-020 | Bot inbound | API inbound return image attachment | API return payload dengan image | Bot mengirim text dan media sesuai payload |
| TC-021 | LID mapping | Remote JID server `lid` dengan nomor di text | Kirim text berisi nomor `628...` | Mapping LID ke phone JID disimpan |
| TC-022 | LID mapping | Metadata participant berisi nomor | Simulasikan participant `628...@s.whatsapp.net` | Fallback phone tersimpan |
| TC-023 | LID mapping | Nomor user tidak bisa diresolve | Mock resolver return empty `waNumber` | Pesan tidak diteruskan ke API |
| TC-024 | LID mapping | WhatsApp registration checked | Kirim nomor HP dalam text | Payload berisi `phoneInputRegistered` bila bisa dicek |
| TC-025 | API inbound auth | Bot inbound tidak butuh token eksternal | POST `/api/bot/inbound` body valid | Request diproses sesuai schema |
| TC-026 | API inbound schema | Body kosong | POST `{}` | HTTP 400, reply payload valid |
| TC-027 | API inbound schema | `waNumber` terlalu pendek | POST `waNumber="1"` | HTTP 400 |
| TC-028 | API inbound schema | `messageType` invalid | POST `messageType="AUDIO"` | HTTP 400 |
| TC-029 | API inbound schema | TEXT tanpa text | POST `messageType=TEXT` tanpa `text` | HTTP 400 |
| TC-030 | API inbound schema | IMAGE tanpa base64 | POST `messageType=IMAGE` tanpa `imageBase64` | HTTP 400 |
| TC-031 | API inbound schema | `sentAt` ISO valid | POST text dengan timestamp valid | Message log memakai waktu input |
| TC-032 | API inbound schema | `sentAt` invalid | POST `sentAt="abc"` | Tidak crash, fallback waktu aman |
| TC-033 | API inbound user | Nomor baru dibuat | Kirim text dari nomor baru | User dibuat `registrationStatus=PENDING`, `onboardingStatus=NOT_STARTED` |
| TC-034 | API inbound user | Nomor lama dipakai ulang | Kirim dua pesan nomor sama | Tidak membuat user duplikat |
| TC-035 | API inbound user | Nomor dengan `+` | Kirim `+628123456789` | Lookup/penyimpanan nomor konsisten |
| TC-036 | API inbound user | Nomor dengan spasi | Kirim `62 812 345 678` | Normalisasi tetap mengarah user sama |
| TC-037 | API inbound user | Payload berisi `waLid` | POST text dengan `waLid` | User/message diproses tanpa mengganti nomor valid |
| TC-038 | API inbound log | Text inbound dicatat | Kirim `makan 50000` | `MessageLog` type TEXT, content sesuai |
| TC-039 | API inbound log | Image inbound dicatat | Kirim image caption kosong | `MessageLog` type IMAGE dan content fallback image |
| TC-040 | API inbound log | AI analysis dicatat | Mock AI extractor sukses | `AIAnalysisLog` EXTRACTION/INTENT tersimpan |
| TC-041 | API inbound log | Reply text dicatat outbound | Handler return reply | `OutboundMessage` dibuat untuk user |
| TC-042 | API inbound style | Reply diproses style bot | Trigger reply biasa | Emoji/style tidak merusak isi utama |
| TC-043 | Rate limit | Melebihi limit per nomor | Kirim request berulang sampai limit | HTTP 429 untuk request berikutnya |
| TC-044 | Rate limit | Nomor berbeda punya bucket berbeda | Nomor A overload, nomor B kirim normal | Nomor B tetap diterima |
| TC-045 | Rate limit | Window reset | Tunggu window rate limit | Request nomor A diterima lagi |
| TC-046 | Registration gate | User baru kirim transaksi | Text `makan 20000` dari user baru | Ditolak halus, diminta ketik `register`, transaksi tidak dibuat |
| TC-047 | Registration gate | User baru kirim `/help` | Text `/help` dari user baru | Help/register guidance muncul tanpa transaksi |
| TC-048 | Registration gate | User baru kirim `register` | Text `register` | Onboarding dimulai |
| TC-049 | Registration gate | Register case-insensitive | Text `REGISTER` | Tetap memulai onboarding |
| TC-050 | Registration gate | Register dengan whitespace | Text `  register  ` | Tetap dikenali |
| TC-051 | Onboarding current | Query tanpa identity | GET `/api/onboarding/current` | HTTP 400 |
| TC-052 | Onboarding current | Query `waNumber` valid | GET dengan nomor existing | Return state onboarding user |
| TC-053 | Onboarding current | Query `userId` valid | GET dengan user id existing | Return state onboarding user |
| TC-054 | Onboarding answer | Body invalid | POST `/api/onboarding/answer` body `{}` | HTTP 400 |
| TC-055 | Onboarding answer | User not found | POST jawaban dengan nomor tidak ada jika resolver tidak create | Return error sesuai resolver |
| TC-056 | Onboarding answer | WAIT_REGISTER jawab register | Submit `register` | Step maju ke goal selection, status IN_PROGRESS |
| TC-057 | Onboarding answer | WAIT_REGISTER jawab bukan register | Submit `halo` | Step tetap atau prompt register |
| TC-058 | Onboarding goal | Pilih emergency fund | Jawab dana darurat | Goal emergency fund masuk pending/active sesuai data |
| TC-059 | Onboarding goal | Pilih house | Jawab rumah | Goal rumah dicatat |
| TC-060 | Onboarding goal | Pilih vehicle | Jawab kendaraan | Goal kendaraan dicatat |
| TC-061 | Onboarding goal | Pilih vacation | Jawab liburan | Goal liburan dicatat |
| TC-062 | Onboarding goal | Pilih custom | Jawab target lain | Step custom name diminta |
| TC-063 | Onboarding goal | Pilih tidak ada goal | Jawab opsi tidak ada | Flow lanjut budget mode |
| TC-064 | Onboarding goal | Multi goal valid | Pilih dana darurat + rumah | Dua goal dibuat/diurutkan |
| TC-065 | Onboarding goal | Input goal ambigu | Jawab `pengin aman aja` | Bot meminta klarifikasi |
| TC-066 | Onboarding goal custom | Nama custom valid | Jawab `modal nikah` | `goalName` tersimpan |
| TC-067 | Onboarding goal custom | Nama terlalu kosong | Jawab whitespace | Step tidak maju, minta input valid |
| TC-068 | Onboarding goal amount | Nominal angka | Jawab `10000000` | Target amount tersimpan 10000000 |
| TC-069 | Onboarding goal amount | Nominal singkatan | Jawab `10 juta` | Target amount tersimpan 10000000 |
| TC-070 | Onboarding goal amount | Nominal invalid | Jawab `sepuluh` jika parser gagal | Step tetap, prompt nominal valid |
| TC-071 | Onboarding goal date | Target bulan tahun | Jawab `Desember 2027` | Target month/year tersimpan |
| TC-072 | Onboarding goal date | Target umur | Jawab `umur 30` | Target age tersimpan |
| TC-073 | Onboarding goal date | Target masa lalu | Jawab tahun lampau | Ditolak/klarifikasi |
| TC-074 | Onboarding budget mode | Manual plan | Pilih manual | Lanjut manual expense breakdown |
| TC-075 | Onboarding budget mode | Guided plan | Pilih dipandu | Lanjut guided food |
| TC-076 | Onboarding budget mode | Opsi auto dari transaksi sudah dihapus | Jawab `3` atau `lihat dari catatan transaksi bulan ini` | Ditolak, prompt hanya menampilkan manual plan dan guided plan |
| TC-077 | Onboarding budget mode | Input invalid | Jawab `terserah` | Prompt pilihan mode budget |
| TC-078 | Onboarding employment | Pilih employee | Jawab karyawan | Lanjut active income count tanpa tanya has active income |
| TC-079 | Onboarding employment | Pilih student | Jawab mahasiswa | Lanjut tanya punya income aktif |
| TC-080 | Onboarding employment | Pilih freelancer | Jawab freelancer | Lanjut estimated/active income sesuai logic |
| TC-081 | Onboarding employment | Pilih entrepreneur | Jawab usaha | Employment type tersimpan |
| TC-082 | Onboarding employment | Pilih mixed | Jawab karyawan + usaha | Employment type mixed/array diproses |
| TC-083 | Onboarding income | Student punya active income | Jawab `ya` | Lanjut active income count |
| TC-084 | Onboarding income | Student tidak punya active income | Jawab `tidak` | Lanjut estimated monthly income |
| TC-085 | Onboarding income count | Count 1 | Jawab `1` | Lanjut active income amount |
| TC-086 | Onboarding income count | Count > 1 | Jawab `3` | Sistem siap menerima multi income |
| TC-087 | Onboarding income count | Count 0 | Jawab `0` | Ditolak |
| TC-088 | Onboarding income amount | Nominal rupiah | Jawab `Rp5.000.000` | Active income 5000000 |
| TC-089 | Onboarding income amount | Nominal juta | Jawab `5 juta` | Active income 5000000 |
| TC-090 | Onboarding income amount | Nominal negatif | Jawab `-5000000` | Ditolak |
| TC-091 | Onboarding salary date | Tanggal 1 | Jawab `1` | salaryDate 1 |
| TC-092 | Onboarding salary date | Tanggal 31 | Jawab `31` | salaryDate 31 |
| TC-093 | Onboarding salary date | Tanggal 32 | Jawab `32` | Ditolak |
| TC-094 | Onboarding salary cycle | Multi income same cycle | Confirm cycle sama | Tidak meminta tanggal lagi untuk setiap income |
| TC-095 | Onboarding salary cycle | Multi income different cycle | Confirm beda | Meminta payday income berikutnya |
| TC-096 | Onboarding passive income | Ada passive income | Jawab `ya`, lalu `500000` | Passive income tersimpan |
| TC-097 | Onboarding passive income | Tidak ada passive income | Jawab `tidak` | Flow lanjut expense |
| TC-098 | Onboarding estimated income | Estimated income valid | Jawab `2 juta` | Estimated monthly income tersimpan |
| TC-099 | Onboarding manual expense | Breakdown valid | Jawab `makan 1jt, transport 500rb`, lalu `sudah` | Bot konfirmasi rincian, lalu ExpensePlan manual dibuat setelah user selesai |
| TC-100 | Onboarding manual expense | Jawaban terlalu umum | Jawab `pengeluaran saya sekitar 5 juta` | Bot menolak total-only dan menawarkan `Saya belum punya, tolong bantu susun` |
| TC-101 | Onboarding guided food | Food valid | Jawab `1.5 juta` | Item food tersimpan |
| TC-102 | Onboarding guided transport | Transport valid | Jawab `500 ribu` | Item transport tersimpan |
| TC-103 | Onboarding guided bills | Bills valid | Jawab `800000` | Item bills tersimpan |
| TC-104 | Onboarding guided entertainment | Entertainment valid | Jawab `300000` | Item entertainment tersimpan |
| TC-105 | Onboarding guided others | Tidak ada pengeluaran lain | Jawab `tidak` | Flow lanjut asset selection |
| TC-106 | Onboarding guided others | Ada pengeluaran lain | Jawab `ya`, kategori, nominal | Item custom tersimpan |
| TC-107 | Onboarding guided others | Tambah custom lain | Jawab add more `ya` | Tetap di others sampai user selesai |
| TC-108 | Onboarding goal expense strategy | Goal butuh expense, user minta dibantu | Pilih help calculate | Lanjut guided expense |
| TC-109 | Onboarding goal expense strategy | User punya data total expense | Pilih have data | Lanjut ask total expense |
| TC-110 | Onboarding asset selection | Pilih tidak ada asset | Jawab tidak ada | Flow menuju analysis/completion |
| TC-111 | Onboarding asset savings | Pilih savings | Isi nama + saldo | Asset SAVINGS dibuat |
| TC-112 | Onboarding asset gold physical | Pilih emas fisik | Isi brand/name/gram/karat | Asset GOLD dibuat dengan quantity/unit |
| TC-113 | Onboarding asset gold digital | Pilih emas digital | Isi platform + gram | Asset GOLD dibuat |
| TC-114 | Onboarding asset stock | Pilih saham | Isi symbol + lot | Asset STOCK dibuat |
| TC-115 | Onboarding asset removed crypto | Jawab `crypto` saat asset selection | Input tidak masuk pilihan aktif | Bot meminta pilih Tabungan, Emas, Saham, Properti, atau Belum punya |
| TC-116 | Onboarding asset removed mutual fund | Jawab `reksa dana` saat asset selection | Input tidak masuk pilihan aktif | Bot meminta pilih Tabungan, Emas, Saham, Properti, atau Belum punya |
| TC-117 | Onboarding asset property | Pilih properti | Isi nama + estimasi nilai | Asset PROPERTY dibuat |
| TC-118 | Onboarding asset unsupported other | Jawab aset di luar pilihan aktif | Input tidak cocok pilihan | Bot meminta klarifikasi/pilihan aktif |
| TC-119 | Onboarding asset invalid quantity | Isi gram/lot `abc` | Step tetap, minta angka valid |
| TC-120 | Onboarding asset add more | Jawab tambah asset `ya` | Kembali ke asset selection |
| TC-121 | Onboarding asset finish | Jawab tambah asset `tidak` | Lanjut completion/analysis |
| TC-122 | Onboarding personalization | Pilih personalisasi lanjutan | Jawab opsi personalisasi | Pending step sesuai opsi |
| TC-123 | Onboarding analysis | Generate analysis dengan data lengkap | GET `/api/onboarding/analysis` | Return `analysisText` dan `analysisData` |
| TC-124 | Onboarding analysis | Data parsial | User income ada, expense kosong | Analysis tetap return fallback wajar |
| TC-125 | Onboarding complete | Complete valid | POST `/api/onboarding/complete` | User `registrationStatus=COMPLETED`, `onboardingStatus=COMPLETED` |
| TC-126 | Onboarding complete | Complete tanpa identity | POST `{}` | HTTP 400 |
| TC-127 | Onboarding complete | Setelah complete langsung aktif | Kirim transaksi setelah complete | Transaksi diproses tanpa aktivasi tambahan |
| TC-128 | Public lookup | Lookup tanpa waNumber | GET `/api/public/customer/lookup` | HTTP 400 |
| TC-129 | Public lookup | Lookup nomor belum ada | GET nomor baru | `exists=false`, status null |
| TC-130 | Public lookup | Lookup nomor existing | GET nomor user | `exists=true`, status registration/onboarding benar |
| TC-131 | Public dashboard | Query tanpa identity | GET `/api/public/user/dashboard` | HTTP 400 |
| TC-132 | Public dashboard | Dashboard user complete | GET dengan `waNumber` complete | Return user, profile, report, goals, assets, expensePlan, recentTransactions |
| TC-133 | Public dashboard | Period daily | GET `period=daily` | Report daily dan summary daily |
| TC-134 | Public dashboard | Period weekly | GET `period=weekly` | Report weekly |
| TC-135 | Public dashboard | Period monthly | GET `period=monthly` | Report monthly |
| TC-136 | Public dashboard | Period invalid | GET `period=yearly` | HTTP 400 |
| TC-137 | Public dashboard | User tanpa financial profile | GET dashboard | API mencoba build initial profile dan tetap return |
| TC-138 | Public profile | GET tanpa identity | GET `/api/public/user/profile` tanpa param | HTTP 400 |
| TC-139 | Public profile | GET valid | GET dengan user existing | Return id, waNumber, name, currency, primaryGoal, budgetMode, salaryDate |
| TC-140 | Public profile | PATCH tanpa perubahan | PATCH hanya identity | HTTP 400 `No profile changes supplied` |
| TC-141 | Public profile | PATCH name valid | PATCH `name="Budi"` | Nama user berubah |
| TC-142 | Public profile | PATCH name terlalu pendek | PATCH `name="A"` | HTTP 400 |
| TC-143 | Public profile | PATCH currency valid | PATCH `currency="IDR"` | Currency berubah |
| TC-144 | Public profile | PATCH salary date valid | PATCH `salaryDate=25` | salaryDate tersimpan |
| TC-145 | Public profile | PATCH salary date invalid | PATCH `salaryDate=40` | HTTP 400 |
| TC-146 | Transaction text | Expense basic | Chat `makan siang 45000` | Transaction EXPENSE amount 45000 category food/makan |
| TC-147 | Transaction text | Income basic | Chat `gaji 5000000` | Transaction INCOME amount 5000000 |
| TC-148 | Transaction text | Saving basic | Chat `nabung 1000000` | Transaction SAVING atau goal contribution sesuai intent |
| TC-149 | Transaction text | Amount with `rb` | Chat `kopi 25rb` | Amount 25000 |
| TC-150 | Transaction text | Amount with `juta` | Chat `bonus 2 juta` | Amount 2000000 |
| TC-151 | Transaction text | Amount with decimal comma | Chat `beli laptop 7,5 juta` | Amount 7500000 |
| TC-152 | Transaction text | Amount with Rp dots | Chat `belanja Rp1.250.000` | Amount 1250000 |
| TC-153 | Transaction text | Forced category | Chat `bayar listrik 300rb kategori bills` | Category mengikuti forced category |
| TC-154 | Transaction text | Merchant detected | Chat `kopi starbucks 55000` | Merchant dinormalisasi bila rule match |
| TC-155 | Transaction text | Detail tag detected | Chat `gofood ayam 45000` | detailTag sesuai rule |
| TC-156 | Transaction text | Date today default | Chat tanpa tanggal | occurredAt hari ini |
| TC-157 | Transaction text | Explicit date | Chat `kemarin makan 30000` | occurredAt tanggal kemarin |
| TC-158 | Transaction text | Missing amount | Chat `makan siang enak` | Tidak insert transaksi, reply minta nominal/clarify |
| TC-159 | Transaction text | Ambiguous finance chat | Chat `pengeluaran bulan ini boros ya?` | Masuk report/analytics/chat, tidak asal insert transaksi |
| TC-160 | Transaction text | AI extractor failure | Mock Gemini error | Fallback parser dicoba atau reply fallback aman |
| TC-161 | Transaction mutation | Hapus transaksi terakhir | Chat `hapus transaksi terakhir` | Candidate ditemukan dan transaksi dihapus/konfirmasi sesuai flow |
| TC-162 | Transaction mutation | Hapus kategori spesifik | Chat `hapus makan 45000 tadi` | Kandidat sesuai hint dipilih |
| TC-163 | Transaction mutation | Ubah nominal | Chat `ubah makan tadi jadi 50000` | Amount transaksi target berubah |
| TC-164 | Transaction mutation | Ubah kategori | Chat `ganti kategori kopi tadi jadi hiburan` | Category berubah |
| TC-165 | Transaction mutation | Kandidat tidak ditemukan | Chat `hapus transaksi 999999` | Reply tidak menemukan transaksi |
| TC-166 | Image OCR | Struk valid | Kirim image struk jelas | OCR text dinormalisasi, transaksi dibuat |
| TC-167 | Image OCR | Caption membantu kategori | Kirim struk caption `makan malam` | Kategori/note mempertimbangkan caption |
| TC-168 | Image OCR | OCR kosong | Mock OCR return empty | Tidak insert, reply minta foto lebih jelas |
| TC-169 | Image OCR | OCR error | Mock Vision throw | Reply fallback OCR gagal |
| TC-170 | Image OCR | Normalizer error | Mock Gemini normalizer throw | Tidak insert parsial |
| TC-171 | Report API | Payload invalid | POST `/api/report` `{}` | HTTP 400 |
| TC-172 | Report API | Daily report kosong | POST valid period daily user tanpa transaksi | Summary menampilkan nol/empty state |
| TC-173 | Report API | Weekly report dengan data | POST weekly | Summary income/expense/category benar |
| TC-174 | Report API | Monthly report dengan data | POST monthly | Summary dan breakdown benar |
| TC-175 | Report API | Chart dibuat bila ada data | Ada income/expense > 0 | `imageBase64` terisi jika service chart sukses |
| TC-176 | Report API | Chart service gagal | Mock chart throw | Response tetap 200 tanpa image |
| TC-177 | Chat report | Slash daily | Chat `/daily report` | Reply daily summary |
| TC-178 | Chat report | Slash weekly | Chat `/weekly report` | Reply weekly summary |
| TC-179 | Chat report | Slash monthly | Chat `/monthly report` | Reply monthly summary |
| TC-180 | Chat report | Slash `/report daily` | Chat `/report daily` | Parsed period daily |
| TC-181 | Chat report | Natural report daily | Chat `laporan hari ini` | Parsed daily |
| TC-182 | Chat report | Natural report weekly | Chat `ringkasan minggu ini` | Parsed weekly |
| TC-183 | Chat report | Natural report monthly default | Chat `laporan keuangan` | Parsed monthly |
| TC-184 | Chat report | Category detail | Chat `detail pengeluaran makan bulan ini` | Reply breakdown kategori makan |
| TC-185 | Chat report | General analytics top spending | Chat `pengeluaran terbesar bulan ini apa` | Reply analytics top items/category |
| TC-186 | Chat report | Comparison range | Chat `bandingkan bulan ini dengan bulan lalu` | Reply comparison report |
| TC-187 | Financial health | Score command | Chat `skor kesehatan keuangan` | Reply health score |
| TC-188 | Financial health | Monthly closing | Chat `tutup buku bulan ini` | Reply closing summary |
| TC-189 | Cashflow forecast | Forecast basic | Chat `cashflow 3 bulan ke depan` | Reply forecast horizon 3 bulan |
| TC-190 | Cashflow forecast | Scenario expense | Chat `kalau beli hp 3 juta cashflow aman?` | Reply scenario impact |
| TC-191 | Budget command | Slash flow start | Chat `/budget set` | Bot minta kategori/nominal |
| TC-192 | Budget command | Natural budget write tidak langsung disimpan | Chat `budget makan 2 juta per bulan` | Tidak menjadi write command otomatis; user diarahkan pakai `/budget set` bila perlu |
| TC-193 | Budget command | Upsert category same | Set kategori sama dua kali lewat `/budget set` | ExpensePlanItem aktif terupdate, kategori tidak duplikat |
| TC-194 | Budget command | Invalid amount | Chat `budget makan nol` | Reply minta nominal valid |
| TC-195 | Goal command | Slash set flow | Chat `/set goal` | Bot mulai flow set goal |
| TC-196 | Goal command | Goal add flow | Chat `/goal add` | Bot mulai flow tambah goal |
| TC-197 | Goal command | Natural set target | Chat `mau nabung 50 juta buat rumah` | FinancialGoal HOUSE dibuat |
| TC-198 | Goal command | Emergency fund formula | Chat goal dana darurat tanpa nominal | Goal formula/pending calculation dibuat |
| TC-199 | Goal command | Goal status all | Chat `/goal status` | Reply status semua goal aktif |
| TC-200 | Goal command | Goal status specific | Chat `status target rumah` | Reply goal rumah |
| TC-201 | Goal command | Goal contribution | Chat `nabung 1 juta untuk rumah` | Contribution dibuat dan progress naik |
| TC-202 | Goal command | Contribution no matching goal | Chat `nabung 1 juta untuk kapal` | Reply goal tidak ditemukan/clarify |
| TC-203 | Goal planner | Prioritas goal | Chat `goal mana dulu yang realistis?` | Reply rekomendasi prioritas |
| TC-204 | Goal planner | Fokus goal | Chat `fokus rumah dulu 6 bulan` | Reply focus plan |
| TC-205 | Goal planner | Split ratio | Chat `split goal 70:30` | Reply alokasi split |
| TC-206 | Goal planner | Expense growth | Chat `pengeluaran naik 10% per tahun untuk target rumah` | Reply perhitungan growth |
| TC-207 | Assets API | GET tanpa identity | GET `/api/assets` tanpa param | HTTP 400 |
| TC-208 | Assets API | GET valid | GET dengan user | Return list assets user |
| TC-209 | Assets API | POST savings valid | POST asset SAVINGS | Asset dibuat dan profile recalculated |
| TC-210 | Assets API | POST invalid body | POST asset tanpa `assetName` | HTTP 400 |
| TC-211 | Goals API | GET tanpa identity | GET `/api/goals` tanpa param | HTTP 400 |
| TC-212 | Goals API | GET valid | GET dengan user | Return goals supported |
| TC-213 | Goals API | POST valid manual goal | POST HOUSE targetAmount | Goal dibuat ACTIVE |
| TC-214 | Goals API | POST emergency no amount | POST EMERGENCY_FUND tanpa amount | Goal formula/pending sesuai logic |
| TC-215 | Goals API | POST invalid goal type | POST unsupported enum/body invalid | HTTP 400 |
| TC-216 | Goals priorities API | Body invalid | POST `/api/goals/priorities` `{}` | HTTP 400 |
| TC-217 | Goals priorities API | Sync priorities valid | POST array goals | Priority order tersimpan |
| TC-218 | Portfolio command | Tambah saham | Chat `tambah saham BBRI 2 lot harga 5000` | PortfolioAsset STOCK dan trade BUY dibuat |
| TC-219 | Portfolio command | Tambah emas | Chat `tambah emas 5 gram harga 1100000` | PortfolioAsset GOLD dibuat |
| TC-220 | Portfolio command | Tambah tabungan/kas | Chat `tambah tabungan 5 juta` | PortfolioAsset DEPOSIT dibuat |
| TC-221 | Portfolio command | Tambah properti | Chat `catat properti rumah senilai 300 juta` | PortfolioAsset PROPERTY dibuat |
| TC-222 | Portfolio command | Portfolio summary | Chat `portofolio saya` | Reply snapshot nilai dan komposisi |
| TC-223 | Portfolio command | Portfolio empty | Chat `portofolio saya` tanpa asset | Reply empty state |
| TC-224 | Portfolio command | Rebalance command tidak diekspos | Chat `rebalance portofolio` | Tidak diroute sebagai command portfolio; saran diversifikasi cukup muncul di summary/risk portfolio |
| TC-225 | Portfolio command | Risiko portfolio | Chat `risiko portofolio saya gimana` | Reply risk analysis |
| TC-226 | Portfolio command | Asset symbol invalid | Chat `tambah saham XYZINVALID 1 lot` | Reply minta symbol valid/saran |
| TC-227 | Market command | Harga saham | Chat `harga BBRI hari ini` | Reply quote saham |
| TC-228 | Market command | Harga crypto sudah dihapus | Chat `harga BTC sekarang` | Tidak resolve symbol crypto; bot fallback/minta konteks lain |
| TC-229 | Market command | Harga emas | Chat `harga emas hari ini` | Reply quote emas |
| TC-230 | Market command | Provider primary gagal | Mock provider pertama error | Provider fallback dipakai |
| TC-231 | Market command | Semua provider gagal | Mock semua error | Reply fallback market unavailable |
| TC-232 | News command | Berita umum finance | Chat `berita ekonomi hari ini` | Reply news digest |
| TC-233 | News command | Berita portfolio | User punya BBRI, chat `berita portofolio saya` | News difilter ke holding relevan |
| TC-234 | News command | News provider kosong | Mock no articles | Reply empty state |
| TC-235 | Reminder preference | Matikan budget reminder | Chat `matikan reminder budget` | `budgetEnabled=false` |
| TC-236 | Reminder preference | Nyalakan budget reminder | Chat `nyalakan reminder budget` | `budgetEnabled=true` |
| TC-237 | Reminder preference | Set quiet hours | Chat `jangan ingetin jam 22 sampai 7` | quiet hours tersimpan |
| TC-238 | Reminder preference | Snooze reminder | Chat `snooze reminder sampai besok` | `snoozedUntil` terisi |
| TC-239 | Reminder preference | Set max per day | Chat `maksimal 2 reminder sehari` | `maxPerDay=2` |
| TC-240 | Reminder dispatch | Auth missing | POST `/api/bot/reminders/run` tanpa token | HTTP 401 |
| TC-241 | Reminder dispatch | Auth valid | POST dengan `x-bot-token` valid | Return `{ok:true}` dan hasil sweep |
| TC-242 | Reminder dispatch | Hanya user complete | Seed user pending + complete | Reminder hanya untuk completed onboarding |
| TC-243 | Reminder dispatch | Budget near limit | Expense kategori mendekati budget | Outbound reminder dibuat |
| TC-244 | Reminder dispatch | Budget exceeded | Expense melewati budget | Outbound exceeded alert dibuat |
| TC-245 | Reminder dispatch | Weekly spending spike | Pengeluaran minggu ini naik signifikan | Weekly alert dibuat |
| TC-246 | Reminder dispatch | Goal reached | Progress goal >= target | Goal alert dibuat |
| TC-247 | Reminder dispatch | Quiet hours aktif | Jalankan sweep dalam quiet hours | Reminder ditahan/tidak dikirim |
| TC-248 | Reminder dispatch | Snoozed user | `snoozedUntil` masa depan | Reminder tidak dibuat |
| TC-249 | Reminder dispatch | Max per day tercapai | ReminderEvent hari ini >= max | Tidak membuat reminder baru |
| TC-250 | Reminder dispatch | Duplicate marker | Marker sama sudah pernah dikirim | Tidak membuat reminder duplikat |
| TC-251 | Outbound API | Poll tanpa token | GET `/api/bot/outbound` tanpa token | HTTP 401 |
| TC-252 | Outbound API | Poll limit default | GET dengan token tanpa limit | Max 5 pesan diklaim |
| TC-253 | Outbound API | Poll limit max | GET `limit=20` | Max 20 pesan diklaim |
| TC-254 | Outbound API | Poll limit terlalu besar | GET `limit=100` | HTTP 400 |
| TC-255 | Outbound API | Claim pending | Seed 3 PENDING | Response 3 pesan, status menjadi PROCESSING |
| TC-256 | Outbound API | Tidak claim SENT | Seed SENT + PENDING | Hanya PENDING dikembalikan |
| TC-257 | Outbound ACK | Ack tanpa token | POST `/api/bot/outbound/ack` tanpa token | HTTP 401 |
| TC-258 | Outbound ACK | Ack sent valid | POST `{id,status:SENT}` | Status SENT, sentAt terisi |
| TC-259 | Outbound ACK | Ack failed valid | POST `{id,status:FAILED,errorMessage}` | Status FAILED, errorMessage tersimpan |
| TC-260 | Outbound ACK | Ack invalid status | POST status `DONE` | HTTP 400 |
| TC-261 | Heartbeat | Bot heartbeat | POST `/api/bot/heartbeat` token valid | `SystemHeartbeat` service bot updated |
| TC-262 | Heartbeat | Heartbeat unauthorized | POST tanpa token | HTTP 401 |
| TC-263 | Health API | Public health | GET `/api/health` | Return ok/service status |
| TC-264 | Admin auth | Login password valid | Submit admin password benar | Cookie/session admin dibuat |
| TC-265 | Admin auth | Login password salah | Submit password salah | Login ditolak |
| TC-266 | Admin auth | Logout | GET/POST logout route | Cookie/session dibersihkan |
| TC-267 | Admin users | GET users unauthorized | Call API tanpa admin token/session | HTTP 401/redirect sesuai layer |
| TC-268 | Admin users | GET users valid | Call dengan auth | Return list users tanpa field obsolete |
| TC-269 | Admin users | Filter status | Query status onboarding/registration | Result sesuai filter |
| TC-270 | Admin users | Delete user | DELETE user existing | User dan related cascade data terhapus |
| TC-271 | Admin user detail | GET detail valid | GET `/api/admin/users/{id}` | Return profile, transactions, goals, assets |
| TC-272 | Admin user detail | GET detail invalid | GET id tidak ada | HTTP 404 |
| TC-273 | Admin transactions | List default | GET `/api/admin/transactions` | Return transactions terbaru |
| TC-274 | Admin transactions | Filter user | Query userId | Hanya transaksi user tersebut |
| TC-275 | Admin transactions | Filter type | Query type INCOME/EXPENSE/SAVING | Result sesuai type |
| TC-276 | Admin transactions | Filter date range | Query start/end | Result dalam range |
| TC-277 | Admin dashboard | Dashboard summary | GET `/api/admin/dashboard` | Return metric users/transactions/activity |
| TC-278 | Admin health | Health page/API | GET `/api/admin/health` | Return heartbeat/system status |
| TC-279 | Admin observability | Observability data | GET `/api/admin/observability` | Return intent/AI/market observation summary |
| TC-280 | Admin reminders | GET templates/events | GET `/api/admin/reminders` | Return reminder config/data |
| TC-281 | Admin reminders | POST template valid | POST template reminder | Template dibuat |
| TC-282 | Admin reminders | PATCH template valid | PATCH isActive/message | Template berubah |
| TC-283 | Admin reminders | Invalid reminder body | POST/PATCH invalid | HTTP 400 |
| TC-284 | Admin web | Root redirect | Open `/` | Redirect/render dashboard/login sesuai auth |
| TC-285 | Admin web | Login page render | Open `/login` | Form login tampil |
| TC-286 | Admin web | Dashboard page render | Login lalu open `/dashboard` | Cards/metrics tampil |
| TC-287 | Admin web | Users page render | Open `/users` | Table users tampil |
| TC-288 | Admin web | User detail page render | Open `/users/{id}` | Detail user tampil |
| TC-289 | Admin web | Reminders page render | Open `/reminders` | Template/event reminder tampil |
| TC-290 | Admin web | Health page render | Open `/health` | Status API/bot tampil |
| TC-291 | Security | Bot token mismatch outbound | Token salah | HTTP 401 |
| TC-292 | Security | Admin token mismatch | Token admin salah | HTTP 401 |
| TC-293 | Security | Invalid JSON inbound | Body bukan JSON | HTTP 500 fallback atau 400 sesuai handler |
| TC-294 | Security | Large text input | Kirim text sangat panjang | Tidak crash, validasi/rate limit aman |
| TC-295 | Security | XSS in user name | PATCH name `<script>` | Disimpan/ditampilkan aman tanpa execute script |
| TC-296 | Security | SQL-like text | Chat `makan 1; drop table` | Diproses sebagai text biasa, DB aman |
| TC-297 | Data integrity | Delete user cascade | Hapus user dengan transaksi/log/asset | Related records terhapus sesuai Prisma cascade |
| TC-298 | Data integrity | Unique budget category | Set budget kategori sama berulang | ExpensePlanItem aktif terdedupe berdasarkan kategori, tidak membuat kategori double |
| TC-299 | Data integrity | Unique portfolio asset | Tambah asset symbol sama dua kali | Quantity/average price terupdate sesuai service |
| TC-300 | Data integrity | Decimal precision | Input lot/gram saham atau emas desimal | Precision tersimpan benar |
| TC-301 | Data integrity | BigInt JSON safe | Dashboard dengan nilai BigInt besar | Response JSON tidak error serialize |
| TC-302 | AI fallback | Gemini unavailable extraction | Mock Gemini network error | Reply fallback, tidak insert data rusak |
| TC-303 | AI fallback | Gemini return invalid JSON | Mock invalid JSON | Parser fallback/validation error aman |
| TC-304 | AI fallback | General chat | Chat non-command finance question | General chat reply muncul |
| TC-305 | AI fallback | Privacy command export | Chat `export data saya` | Route privacy dipilih, reply sesuai kemampuan |
| TC-306 | Formatting | Reply line bullet | Generate reply list | Emoji style mempertahankan bullet/content |
| TC-307 | Formatting | Leading marker preserved | Outbound poll message dengan marker | Marker tidak rusak |
| TC-308 | Formatting | Empty reply skipped | Handler return whitespace | Tidak membuat outbound kosong |
| TC-309 | Reporting service | Python service active | Report dengan data | Chart image base64 valid PNG |
| TC-310 | Reporting service | Python service down | Stop service lalu report | Summary tetap tampil tanpa image |
| TC-311 | Build | API typecheck | Jalankan `pnpm --filter @finance/api typecheck` | Exit 0 |
| TC-312 | Build | Admin typecheck | Jalankan `pnpm --filter @finance/admin-web typecheck` | Exit 0 |
| TC-313 | Build | Bot typecheck | Jalankan `pnpm --filter @finance/bot typecheck` | Exit 0 |
| TC-314 | Build | Shared typecheck | Jalankan `pnpm --filter @finance/shared typecheck` | Exit 0 |
| TC-315 | Test suite | API unit/integration tests | Jalankan `pnpm --filter @finance/api test` | Semua test pass |
| TC-316 | Prisma | Generate client | Jalankan Prisma generate | Client sukses tanpa enum/model lama |
| TC-317 | Prisma | Migration fresh DB | Jalankan migrate di DB kosong | Semua migration sukses |
| TC-318 | Prisma | Migration existing DB | Jalankan migration pada DB dengan tabel lama | Tabel legacy yang tidak dipakai terhapus aman sesuai migration |
| TC-319 | Regression cleanup | Tidak ada route lama | Akses endpoint yang sudah dihapus | Return 404 |
| TC-320 | Regression cleanup | Tidak ada env lama wajib | Start API tanpa env lama | Env validation tidak meminta env yang sudah tidak dipakai |

## Prioritas Eksekusi

| Priority | Cakupan | Test Case |
|---|---|---|
| P0 | Smoke end-to-end utama | TC-001 sampai TC-020, TC-046 sampai TC-050, TC-125 sampai TC-127, TC-146 sampai TC-150, TC-177 sampai TC-183, TC-251 sampai TC-260 |
| P0 | Build dan automated tests | TC-311 sampai TC-317 |
| P1 | Onboarding detail | TC-051 sampai TC-124 |
| P1 | Dashboard/public/admin API | TC-128 sampai TC-145, TC-267 sampai TC-290 |
| P1 | Reminders/outbound | TC-235 sampai TC-263 |
| P2 | Market, portfolio, AI fallback, formatting | TC-218 sampai TC-234, TC-302 sampai TC-310 |
| P2 | Security/data integrity/regression cleanup | TC-291 sampai TC-301, TC-318 sampai TC-320 |

## Checklist Smoke Manual Singkat

1. Jalankan `pnpm --filter @finance/api prisma:generate`.
2. Jalankan `pnpm typecheck`.
3. Jalankan `pnpm --filter @finance/api test`.
4. Start API, admin web, reporting service, dan bot.
5. Scan QR Baileys.
6. Kirim `register` dari nomor uji baru.
7. Selesaikan onboarding sampai status complete.
8. Kirim transaksi text: `makan siang 45000`.
9. Kirim image struk.
10. Kirim `/monthly report`.
11. Kirim `/budget set`, isi kategori dan limit, lalu `simpan`.
12. Kirim `mau nabung 50 juta buat rumah`.
13. Kirim `portofolio saya`.
14. Jalankan reminder sweep dari bot/API.
15. Buka admin web dan cek users, transactions, reminders, health.
