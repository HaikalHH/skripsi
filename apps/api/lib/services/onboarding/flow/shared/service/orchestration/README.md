# Onboarding Orchestration

Runtime orchestration untuk percakapan onboarding.

File utama `onboarding-orchestrator.ts` mengoordinasikan:
- state sesi onboarding
- validasi dan konfirmasi jawaban
- transisi step
- finalisasi onboarding
- response text ke user

Subfolder ini dipisah dari `shared/service` supaya import publik tetap stabil, sementara developer bisa langsung tahu bahwa logic di dalamnya adalah orchestration flow.
