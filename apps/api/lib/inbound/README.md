# Inbound

Pipeline penerimaan pesan dari bot WhatsApp ke domain finance assistant.

- `pipeline/`: entrypoint pemrosesan payload inbound.
- `handlers/`: handler per bentuk pesan atau intent awal.
- `reports/`: formatter dan response khusus report.
- `transactions/`: flow penyimpanan transaksi dari hasil ekstraksi.
- `formatting/`: text formatter untuk balasan bot.
- `shared/`: tipe dan result helper yang dipakai antar handler.
