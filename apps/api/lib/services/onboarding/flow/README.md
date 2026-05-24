# Onboarding Flow Map

Semua file onboarding sekarang berada di dalam `flow/`. Root `onboarding/` hanya menjadi container folder.

## Flow

`flow/` berisi urutan pertanyaan, perpindahan step, dan helper yang memang spesifik ke flow tersebut.

- `01-start-and-targets`: salam awal, verifikasi nomor, dan pilihan target.
- `02-income`: status kerja, income aktif, tanggal gajian, dan income pasif.
- `03-expenses`: pilihan cara isi budget dan rincian pengeluaran. Flow aktif hanya memakai dua mode: user sudah punya breakdown manual atau user minta dibantu susun guided.
- `04-goal-planning`: detail target, deadline, dan prioritas.
- `05-assets`: pendataan tabungan, emas, saham, dan properti. Crypto dan reksa dana tidak termasuk pilihan onboarding aktif.
- `06-completion`: pilihan personalisasi lanjutan dan penutup onboarding.
- `get-prompt-for-step.ts`: memilih prompt yang cocok untuk step saat ini.
- `next-step.ts`: menentukan step berikutnya setelah user menjawab.
- `helpers/`: helper kecil khusus flow.
- `shared/`: kode yang dipakai lintas flow, tapi tetap dikelompokkan berdasarkan fungsi.

Di dalam folder flow boleh ada subfolder yang lebih spesifik:

- `parser/`: parser dan pembaca jawaban khusus flow tersebut.
- `calculation/`: kalkulasi kecil yang hanya relevan untuk flow tersebut.
- `service/`: helper orkestrasi/chat khusus flow tersebut.

Contoh saat ini:

- `02-income/parser`: baca state income dari sesi onboarding.
- `02-income/service`: state dan sinkronisasi income aktif.
- `03-expenses/parser`: parser manual/guided expense.
- `03-expenses/calculation`: tipe dan helper breakdown pengeluaran.
- `03-expenses/service`: ringkasan guided expense dan transisi ke aset.
- `04-goal-planning/parser`: pending goal, prioritas, dan rekomendasi urutan goal.
- `05-assets/parser`: pending asset detail dan state aset aktif.
- `05-assets/service`: helper state asset, label emas, notes valuasi, dan format quantity asset.

## Shared

`shared/` berisi kode lintas-flow yang sebelumnya ada di root `onboarding/`.

- `shared/answers`: parser jawaban umum seperti boolean, uang, tanggal, dan pilihan menu.
- `shared/questions`: opsi jawaban, label tampilan, format chat, dan tipe prompt.
- `shared/conversation`: deteksi user bertanya, bingung, minta contoh, atau konfirmasi jawaban.
- `shared/planning`: timeline dan preview target.
- `shared/calculation`: kalkulasi profil finansial, target, aset, dan analisis yang lintas flow.
- `shared/intent`: helper intent ringan dari chat user.
- `shared/parser`: barrel export parser untuk pemakaian lintas modul.
- `shared/route`: helper route API onboarding dan financial profile.
- `shared/service`: orkestrator utama sesi onboarding.
