export const SAVING_KEYWORD_PATTERN =
  /\b(?:nabung|menabung|setor\s+tabungan|simpan|saving)\b|\btabung\b(?=\s+(?:ke|buat|untuk|rp|\d|satu|dua|tiga|empat|lima|enam|tujuh|delapan|sembilan|sepuluh|seratus|sejuta))/i;
export const SAVING_PLANNING_PATTERN =
  /\b(?:target|goal|status|progress|progres)\b/i;
export const SAVING_TARGET_INTENT_PATTERN =
  /\b(?:mau|ingin|pengen)\s+(?:nabung|menabung|tabung)\b/i;
export const SAVING_PROJECTION_PATTERN =
  /\b(?:kalau|jika)\b.*\b(?:nabung|menabung|tabung|saving)\b.*\b(?:jadi berapa|hasilnya berapa|berapa nanti|berapa lama|kapan tercapai)\b/i;
