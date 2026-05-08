ALTER TABLE `ReminderTemplate`
  ADD COLUMN `entitiesJson` JSON NULL;

UPDATE `ReminderTemplate`
SET
  `marker` = 'Recap Harian ({1})',
  `messageText` = 'Ringkasan kemarin (({1})):\n- Uang masuk: ({2})\n- Uang keluar: ({3})\n- Selisih hari itu: ({4})\n- Total transaksi: ({5}) transaksi',
  `entitiesJson` = JSON_ARRAY(
    JSON_OBJECT('token', '({1})', 'source', 'date'),
    JSON_OBJECT('token', '({2})', 'source', 'income'),
    JSON_OBJECT('token', '({3})', 'source', 'expense'),
    JSON_OBJECT('token', '({4})', 'source', 'net'),
    JSON_OBJECT('token', '({5})', 'source', 'transaction_count')
  ),
  `updatedAt` = NOW(3)
WHERE `templateKey` = 'daily_recap';

UPDATE `ReminderTemplate`
SET
  `marker` = 'Review Mingguan ({1})',
  `messageText` = 'Review Mingguan:\n- Income 7 hari terakhir: ({1})\n- Expense 7 hari terakhir: ({2})\n- Net flow: ({3})\n- Bucket terbesar: ({4})',
  `entitiesJson` = JSON_ARRAY(
    JSON_OBJECT('token', '({1})', 'source', 'income'),
    JSON_OBJECT('token', '({2})', 'source', 'expense'),
    JSON_OBJECT('token', '({3})', 'source', 'net'),
    JSON_OBJECT('token', '({4})', 'source', 'top_category')
  ),
  `updatedAt` = NOW(3)
WHERE `templateKey` = 'weekly_review';

UPDATE `ReminderTemplate`
SET
  `marker` = 'Closing Bulanan ({1})',
  `messageText` = 'Closing Bulanan:\n- Review kondisi cashflow bulan ({1})\n- Cek pengeluaran terbesar\n- Siapkan target budget bulan ini',
  `entitiesJson` = JSON_ARRAY(
    JSON_OBJECT('token', '({1})', 'source', 'month')
  ),
  `updatedAt` = NOW(3)
WHERE `templateKey` = 'monthly_closing';

UPDATE `ReminderTemplate`
SET
  `marker` = 'Reminder Recurring ({1}) ({2})',
  `messageText` = 'Reminder Langganan: ({1}) di bucket ({2}) kemungkinan jatuh tempo ({3}). Rata-rata ({4}) per tagihan.',
  `entitiesJson` = JSON_ARRAY(
    JSON_OBJECT('token', '({1})', 'source', 'label'),
    JSON_OBJECT('token', '({2})', 'source', 'bucket'),
    JSON_OBJECT('token', '({3})', 'source', 'due_label'),
    JSON_OBJECT('token', '({4})', 'source', 'average_amount')
  ),
  `updatedAt` = NOW(3)
WHERE `templateKey` = 'recurring_due';

UPDATE `ReminderTemplate`
SET
  `marker` = 'Reminder Gajian ({1})',
  `messageText` = 'Reminder Gajian: hari ini jadwal gajian (({1})). Kalau gaji sudah masuk, catat dengan format "gaji 9.2jt" atau "gaji 9200000".',
  `entitiesJson` = JSON_ARRAY(
    JSON_OBJECT('token', '({1})', 'source', 'payday')
  ),
  `updatedAt` = NOW(3)
WHERE `templateKey` = 'payday_salary_input';

UPDATE `ReminderTemplate`
SET
  `marker` = 'Reminder Goal Pace ({1})',
  `messageText` = 'Reminder Goal: ({1}) masih ({2}) lagi. Dengan ritme sekarang, estimasinya ({3}). Pertimbangkan tambah setoran rutin atau kurangi bucket yang paling bocor.',
  `entitiesJson` = JSON_ARRAY(
    JSON_OBJECT('token', '({1})', 'source', 'goal_name'),
    JSON_OBJECT('token', '({2})', 'source', 'remaining_amount'),
    JSON_OBJECT('token', '({3})', 'source', 'eta')
  ),
  `updatedAt` = NOW(3)
WHERE `templateKey` = 'goal_off_track';

UPDATE `ReminderTemplate`
SET
  `marker` = 'Reminder Mingguan ({1})',
  `messageText` = 'Reminder Mingguan: pengeluaran 7 hari terakhir meningkat ke ({1}) dari periode sebelumnya ({2}). Cek kategori pengeluaran terbesar minggu ini agar tidak kebablasan.',
  `entitiesJson` = JSON_ARRAY(
    JSON_OBJECT('token', '({1})', 'source', 'current_expense'),
    JSON_OBJECT('token', '({2})', 'source', 'previous_expense')
  ),
  `updatedAt` = NOW(3)
WHERE `templateKey` = 'weekly_spike';

UPDATE `ReminderTemplate`
SET
  `marker` = 'Reminder Goal Reached ({1})',
  `messageText` = 'Target tabungan tercapai: ({1}) dari target ({2}).',
  `entitiesJson` = JSON_ARRAY(
    JSON_OBJECT('token', '({1})', 'source', 'current_progress'),
    JSON_OBJECT('token', '({2})', 'source', 'target_amount')
  ),
  `updatedAt` = NOW(3)
WHERE `templateKey` = 'goal_reached';

UPDATE `ReminderTemplate`
SET
  `marker` = 'Reminder Digest ({1})',
  `messageText` = 'Ringkasan reminder penting hari ini:\n- ({1})\n- ({2})\n- ({3})',
  `entitiesJson` = JSON_ARRAY(
    JSON_OBJECT('token', '({1})', 'source', 'reminder_one'),
    JSON_OBJECT('token', '({2})', 'source', 'reminder_two'),
    JSON_OBJECT('token', '({3})', 'source', 'reminder_three')
  ),
  `updatedAt` = NOW(3)
WHERE `templateKey` = 'daily_digest';
