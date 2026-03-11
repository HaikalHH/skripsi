import { prisma } from "../prisma";

const DAILY_NEWS_PATTERN =
  /berita finance(?:\s+hari ini)?|finance update(?:\s+pagi ini)?|ringkas berita ekonomi|berita ekonomi(?:\s+hari ini)?|daily digest|update ekonomi|headline finance|news finance/i;
const PORTFOLIO_NEWS_PATTERN =
  /berita tentang saham aku|news tentang aset aku|portfolio news|ada news penting tentang aset aku|berita aset aku|update buat portfolio aku|news portfolio/i;

type NewsItem = {
  title: string;
  link: string;
  source: string;
};

const decodeHtml = (value: string) =>
  value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");

const stripCdata = (value: string) => value.replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "");

const getTagValue = (block: string, tag: string) => {
  const match = block.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "i"));
  if (!match) return "";
  return decodeHtml(stripCdata(match[1]).trim());
};

const parseRssItems = (xml: string): NewsItem[] => {
  const blocks = xml.match(/<item>[\s\S]*?<\/item>/gi) ?? [];
  return blocks
    .map((block) => ({
      title: getTagValue(block, "title"),
      link: getTagValue(block, "link"),
      source: getTagValue(block, "source") || "Unknown"
    }))
    .filter((item) => item.title && item.link);
};

const fetchNews = async (query: string) => {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=id&gl=ID&ceid=ID:id`;
  const response = await fetch(url, { headers: { "User-Agent": "finance-bot/1.0" } });
  if (!response.ok) throw new Error("Feed berita tidak tersedia.");
  const xml = await response.text();
  return parseRssItems(xml).slice(0, 7);
};

const buildImpactHint = (title: string) => {
  const lower = title.toLowerCase();
  if (/suku bunga|inflasi|bank sentral|fed|bi/i.test(lower)) {
    return "Dampak: bisa mengubah biaya pinjaman dan selera risiko pasar.";
  }
  if (/rupiah|usd|dolar|kurs/i.test(lower)) {
    return "Dampak: potensi pengaruh ke harga impor, saham, dan biaya hidup.";
  }
  if (/bbca|saham|idx|ihsg|obligasi/i.test(lower)) {
    return "Dampak: bisa mempengaruhi valuasi portfolio saham/obligasi.";
  }
  if (/bitcoin|btc|crypto|kripto/i.test(lower)) {
    return "Dampak: volatilitas aset crypto bisa naik dalam jangka pendek.";
  }
  return "Dampak: pantau sentimen karena bisa berpengaruh ke keputusan finansial mingguan.";
};

const toHeadlineLines = (items: NewsItem[]) =>
  items.map((item, index) => `${index + 1}. ${item.title} (${item.source})`);

const buildDigestText = (title: string, items: NewsItem[]) => {
  if (!items.length) {
    return "Belum ada headline relevan yang berhasil diambil saat ini.";
  }

  return [title, ...toHeadlineLines(items), buildImpactHint(items[0].title)].join("\n");
};

const getPortfolioSymbols = async (userId: string) => {
  const portfolioModel = (prisma as { portfolioAsset?: any }).portfolioAsset;
  if (!portfolioModel) return [];

  const assets = await portfolioModel.findMany({
    where: { userId },
    select: { symbol: true, displayName: true },
    take: 5
  });
  return assets
    .map((asset: { symbol?: string | null; displayName?: string | null }) => asset.symbol || asset.displayName)
    .filter((value: string | null | undefined): value is string => Boolean(value));
};

export const tryHandleFinanceNewsCommand = async (params: { userId: string; text: string }) => {
  const text = params.text.trim();

  if (DAILY_NEWS_PATTERN.test(text)) {
    const news = await fetchNews("finance OR ekonomi OR pasar saham Indonesia");
    return {
      handled: true as const,
      replyText: buildDigestText("Daily finance digest:", news)
    };
  }

  if (PORTFOLIO_NEWS_PATTERN.test(text)) {
    const symbols = await getPortfolioSymbols(params.userId);
    if (!symbols.length) {
      return {
        handled: true as const,
        replyText:
          "Portfolio Anda masih kosong, jadi news personal belum bisa difilter. Tambahkan aset dulu dengan format `Tambah saham BBCA 10 lot harga 9000`."
      };
    }

    const query = symbols.join(" OR ");
    const news = await fetchNews(`${query} saham crypto emas market`);
    return {
      handled: true as const,
      replyText: buildDigestText(`News relevan untuk aset Anda (${symbols.join(", ")}):`, news)
    };
  }

  return { handled: false as const };
};
