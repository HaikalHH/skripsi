# Onboarding Orchestration

Runtime orchestration untuk percakapan onboarding.

File utama `onboarding-orchestrator.ts` mengoordinasikan:
- state sesi onboarding
- validasi dan konfirmasi jawaban
- transisi step
- finalisasi onboarding
- response text ke user

Catatan flow aktif:
- manual expense breakdown dikonfirmasi dulu sebelum disimpan
- jawaban total-only seperti `pengeluaran sekitar 5 juta` diarahkan ke breakdown kategori atau guided setup
- target date memakai pending confirmation supaya user bisa memilih deadline awal, versi realistis, ubah nominal, atau ubah deadline

Subfolder ini dipisah dari `shared/service` supaya import publik tetap stabil, sementara developer bisa langsung tahu bahwa logic di dalamnya adalah orchestration flow.
