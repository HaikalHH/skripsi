# Bot Runtime

Runtime WhatsApp bot berbasis Baileys.

- `runtime/`: bootstrap socket dan lifecycle koneksi.
- `whatsapp/`: logic spesifik WhatsApp seperti LID mapping, media, dan incoming message.
- `api/`: komunikasi bot ke API internal untuk inbound, outbound, heartbeat, dan reminders.
- `config.ts`: env parsing dan schema response API.
- `logger.ts`: logger bot.
