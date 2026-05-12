export const extractAmountPhrase = (text: string): string | null => {
  const withUnit = text.match(/\brp\.?\s*\d[\d.,]*\s*(?:jt|juta|rb|ribu|k)\b|\b\d[\d.,]*\s*(?:jt|juta|rb|ribu|k)\b/i);
  if (withUnit) return withUnit[0];

  const withRp = text.match(/\brp\.?\s*\d[\d.,]+\b/i);
  if (withRp) return withRp[0];

  const plainDigits = text.match(/\b\d{3,}\b/);
  if (plainDigits) return plainDigits[0];

  return null;
};

export const detectIncomeCategory = (text: string) => {
  if (/\b(nabung|tabungan|saving)\b/i.test(text)) return "Savings";
  if (/\b(gaji|salary|payroll)\b/i.test(text)) return "Salary";
  if (/\b(bonus|thr|insentif|komisi)\b/i.test(text)) return "Bonus";
  if (/\b(freelance|project|proyek|client)\b/i.test(text)) return "Freelance";
  return "Other Income";
};

export const detectExpenseCategory = (text: string) => {
  if (/\b(makan|minum|kopi|ngopi|coffee|resto|restoran|warung|sarapan|lunch|dinner|snack|cemilan)\b/i.test(text)) {
    return "Food & Drink";
  }
  if (/\b(groceries|grocery|sembako|belanja dapur|sayur|buah|beras|lauk)\b/i.test(text)) {
    return "Groceries";
  }
  if (/\b(transport|bensin|bbm|tol|parkir|ojek|ojol|gojek|grab|taxi|taksi|kereta|krl|mrt|lrt|bus|transjakarta)\b/i.test(text)) {
    return "Transport";
  }
  if (/\b(listrik|air|internet|pulsa|token|tagihan|bill|wifi|pdam|gas|sewa|kontrakan|kost|cicilan|kredit|angsuran|asuransi|bpjs)\b/i.test(text)) {
    return "Bills";
  }
  if (/\b(dokter|klinik|rumah sakit|hospital|apotek|obat|medical|kesehatan)\b/i.test(text)) {
    return "Health";
  }
  if (/\b(sekolah|kuliah|kampus|spp|les|kursus|tuition|pendidikan)\b/i.test(text)) {
    return "Education";
  }
  if (/\b(belanja|shopping|toko|market|mart|alfamart|indomaret|shopee|tokopedia|fashion|baju|pakaian|skincare|kosmetik|elektronik|gadget)\b/i.test(text)) {
    return "Shopping";
  }
  if (/\b(netflix|spotify|bioskop|cinema|movie|film|game|gaming|steam|playstation|ps5|xbox|konser|hobi|nongkrong|hangout)\b/i.test(text)) {
    return "Entertainment";
  }
  if (/\b(liburan|travel|traveling|hotel|tiket|pesawat)\b/i.test(text)) {
    return "Travel";
  }
  if (/\b(donasi|zakat|amal|sedekah|charity)\b/i.test(text)) {
    return "Charity";
  }
  if (/\b(istri|suami|anak|ortu|orang tua|keluarga)\b/i.test(text)) {
    return "Family";
  }
  return "General Expense";
};
