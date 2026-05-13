import { prisma } from "@/lib/prisma";

const PRIVACY_PATTERN = /data aku aman|aman & privat|privasi/i;
const EXPORT_PATTERN = /export data|download data|minta export/i;

export const tryHandlePrivacyCommand = async (userId: string, text: string) => {
  if (PRIVACY_PATTERN.test(text)) {
    return {
      handled: true as const,
      replyText:
        "Data Anda bersifat private per nomor WhatsApp. Data tidak dibagikan ke user lain dan hanya dipakai untuk analisa keuangan akun Anda."
    };
  }

  if (!EXPORT_PATTERN.test(text)) return { handled: false as const };

  const portfolioModel = (prisma as { portfolioAsset?: any }).portfolioAsset;

  const [txCount, budgetCount, assetCountRaw] = await Promise.all([
    prisma.transaction.count({ where: { userId } }),
    prisma.budget.count({ where: { userId } }),
    portfolioModel?.count({ where: { userId } }) ?? Promise.resolve(0)
  ]);
  const assetCount = Number(assetCountRaw) || 0;

  return {
    handled: true as const,
    replyText: [
      "Ringkasan data untuk export:",
      `- Total transaksi: ${txCount}`,
      `- Total budget kategori: ${budgetCount}`,
      `- Total aset portfolio: ${assetCount}`,
      "Jika perlu full export JSON/CSV, admin bisa generate dari API admin."
    ].join("\n")
  };
};
