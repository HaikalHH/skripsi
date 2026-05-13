# Report Renderer

Python FastAPI service untuk render output report.

- `/charts/generate`: render chart PNG dari payload report.
- `/reports/monthly-pdf`: render PDF laporan bulanan.
- `/health`: health check service.

Business logic reporting tetap berada di `apps/api/lib/services/reporting`; service ini hanya menangani rendering chart/PDF.
