# Financial Profile Planning

Perhitungan dan persistence hasil onboarding.

`financial-profile-planning.ts` berisi:
- sinkronisasi income, expense, asset, dan goal dari jawaban onboarding
- perhitungan feasibility target
- timeline goal planning
- pembuatan financial profile awal
- teks analisis akhir onboarding

Facade publik tetap ada di `../onboarding-calculation-service.ts` agar import lama tidak berubah.
