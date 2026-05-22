# Report Renderer

Python FastAPI service untuk render output report.

- `/charts/generate`: render chart PNG dari payload report.
- `/reports/monthly-pdf`: render PDF laporan bulanan.
- `/health`: health check service.

Business logic reporting tetap berada di `apps/api/lib/services/reporting`; service ini hanya menangani rendering chart/PDF.

## Local setup

Folder `.venv` tidak masuk git karena isinya spesifik ke mesin masing-masing developer. Buat ulang virtual environment dari `requirements.txt`.

```powershell
cd services/report-renderer
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
uvicorn app.main:app --reload --port 8000
```

Untuk macOS/Linux:

```bash
cd services/report-renderer
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --port 8000
```
