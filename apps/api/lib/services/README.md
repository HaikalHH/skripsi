## Service Structure

`lib/services` sekarang dipecah per fitur supaya entry point domain lebih cepat dicari.

- `ai`: integrasi AI, OCR, dan logging analisis
- `assistant`: parsing command, routing konteks, memory percakapan, dan chat umum
- `market`: market data, news, dan portfolio command/valuation
- `messaging`: message log dan outbound queue
- `observability`: pencatatan observability intent dan routing
- `onboarding`: onboarding flow, parser, helper route, dan kalkulasi profil awal
- `planning`: goal, health score, projection, cashflow forecast, dan allocation planning
- `reminders`: reminder runner dan preference user
- `reporting`: aggregation dan report builder
- `shared`: formatter dan helper lintas service
- `system`: heartbeat dan status internal
- `transactions`: parsing, normalization, budget, anomaly, recurring, dan mutation flow
- `user`: user profile dan financial context summary
