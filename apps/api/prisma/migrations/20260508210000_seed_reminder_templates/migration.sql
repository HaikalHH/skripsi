INSERT INTO `ReminderTemplate` (
  `id`,
  `templateKey`,
  `reminderType`,
  `title`,
  `marker`,
  `messageText`,
  `isActive`,
  `createdAt`,
  `updatedAt`
)
VALUES
  (
    'reminder_template_daily_recap',
    'daily_recap',
    'weekly_review',
    'Recap Harian',
    'Recap Harian {date}',
    'Ringkasan kemarin ({date}):\n- Uang masuk: {income}\n- Uang keluar: {expense}\n- Selisih hari itu: {net}\n- Total transaksi: {transactionCount} transaksi',
    true,
    NOW(3),
    NOW(3)
  ),
  (
    'reminder_template_weekly_review',
    'weekly_review',
    'weekly_review',
    'Review Mingguan',
    'Review Mingguan {weekStart}',
    'Review Mingguan:\n- Income 7 hari terakhir: {income}\n- Expense 7 hari terakhir: {expense}\n- Net flow: {net}\n- Bucket terbesar: {topCategory}',
    true,
    NOW(3),
    NOW(3)
  ),
  (
    'reminder_template_monthly_closing',
    'monthly_closing',
    'monthly_closing',
    'Closing Bulanan',
    'Closing Bulanan {month}',
    'Closing Bulanan:\n- Review kondisi cashflow bulan lalu\n- Cek pengeluaran terbesar\n- Siapkan target budget bulan ini',
    true,
    NOW(3),
    NOW(3)
  ),
  (
    'reminder_template_recurring_due',
    'recurring_due',
    'recurring_due',
    'Tagihan Berulang',
    'Reminder Recurring {label} {dueDate}',
    'Reminder Langganan: {label} di bucket {bucket} kemungkinan jatuh tempo {dueLabel}. Rata-rata {averageAmount} per tagihan.',
    true,
    NOW(3),
    NOW(3)
  ),
  (
    'reminder_template_payday_salary_input',
    'payday_salary_input',
    'cashflow_buffer',
    'Reminder Gajian',
    'Reminder Gajian {payday}',
    'Reminder Gajian: hari ini jadwal gajian ({payday}). Kalau gaji sudah masuk, catat dengan format "gaji 9.2jt" atau "gaji 9200000".',
    true,
    NOW(3),
    NOW(3)
  ),
  (
    'reminder_template_goal_off_track',
    'goal_off_track',
    'goal_off_track',
    'Goal Off Track',
    'Reminder Goal Pace {goalName}',
    'Reminder Goal: {goalName} masih {remainingAmount} lagi. Dengan ritme sekarang, estimasinya {eta}. Pertimbangkan tambah setoran rutin atau kurangi bucket yang paling bocor.',
    true,
    NOW(3),
    NOW(3)
  ),
  (
    'reminder_template_weekly_spike',
    'weekly_spike',
    'weekly_spike',
    'Spending Spike Mingguan',
    'Reminder Mingguan {weekStart}',
    'Reminder Mingguan: pengeluaran 7 hari terakhir meningkat ke {currentExpense} dari periode sebelumnya {previousExpense}. Cek kategori pengeluaran terbesar minggu ini agar tidak kebablasan.',
    true,
    NOW(3),
    NOW(3)
  ),
  (
    'reminder_template_goal_reached',
    'goal_reached',
    'goal_reached',
    'Target Tercapai',
    'Reminder Goal Reached {goalName}',
    'Target tabungan tercapai: {currentProgress} dari target {targetAmount}.',
    true,
    NOW(3),
    NOW(3)
  ),
  (
    'reminder_template_daily_digest',
    'daily_digest',
    'daily_digest',
    'Digest Reminder',
    'Reminder Digest {date}',
    'Ringkasan reminder penting hari ini:\n- {reminderOne}\n- {reminderTwo}\n- {reminderThree}',
    true,
    NOW(3),
    NOW(3)
  )
ON DUPLICATE KEY UPDATE
  `templateKey` = VALUES(`templateKey`);
