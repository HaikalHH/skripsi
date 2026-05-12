const DAILY_NEWS_PATTERN =
  /berita finance(?:\s+hari ini)?|finance update(?:\s+pagi ini)?|ringkas berita ekonomi|berita ekonomi(?:\s+hari ini)?|daily digest|update ekonomi|headline finance|news finance|berita(?:nya)?\s+(?:lagi|lainnya|berikutnya)|news\s+(?:lagi|lainnya|berikutnya)|artikel\s+(?:lagi|lainnya|berikutnya)/i;
const PORTFOLIO_NEWS_PATTERN =
  /berita tentang saham aku|news tentang aset aku|portfolio news|ada news penting tentang aset aku|berita aset aku|update buat portfolio aku|news portfolio/i;

export const parseFinanceNewsCommandScope = (text: string) => {
  if (DAILY_NEWS_PATTERN.test(text)) return "daily" as const;
  if (PORTFOLIO_NEWS_PATTERN.test(text)) return "portfolio" as const;
  return null;
};
