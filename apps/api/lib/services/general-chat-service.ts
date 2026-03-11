import { OnboardingStatus, RegistrationStatus } from "@prisma/client";
import { HELP_TEXT } from "@/lib/constants";
import { prisma } from "../prisma";
import { generateGroundedGeneralChatReply, isGeminiRateLimitError } from "./ai-service";
import {
  buildUserFinancialContextSummary,
  loadUserFinancialContext
} from "./user-financial-context-service";

type GeneralChatResult =
  | { handled: true; replyText: string; source: "rule" | "ai" }
  | { handled: false };

const GREETING_PATTERN =
  /^(hi|halo|hello|hai|pagi|siang|sore|malam|permisi|halo finance ai|halo bot)\b/i;
const THANKS_PATTERN = /\b(thanks|thank you|makasih|terima kasih|thx)\b/i;
const CAPABILITY_PATTERN =
  /\b(bisa apa|fitur apa|menu apa|bantu apa|cara pakai|pakainya gimana|gimana cara pakai)\b/i;
const OUT_OF_SCOPE_PATTERN =
  /\b(cuaca|weather|film|lagu|musik|game|bola|skor|berita artis|coding|programming|kode program)\b/i;
const FINANCE_RELATED_PATTERN =
  /\b(keuangan|uang|transaksi|pengeluaran|pemasukan|income|expense|budget|anggaran|laporan|report|insight|goal|target|tabungan|saving|investasi|investment|portfolio|portofolio|aset|asset|saham|crypto|kripto|emas|harga|market|financial freedom|dana darurat|nabung)\b/i;

const normalizeText = (value: string) => value.trim().replace(/\s+/g, " ");

const buildGreetingReply = () =>
  "Halo Boss. Saya siap bantu urusan keuangan kamu, mulai dari catat transaksi, laporan, budget, target, sampai portfolio. Kalau mau langsung, kirim aja pesan natural seperti `beli kopi 25 ribu` atau `laporan minggu ini`.";

const buildThanksReply = () =>
  "Siap Boss. Kalau ada yang mau dicek lagi, tinggal chat aja dengan bahasa biasa.";

const buildOutOfScopeReply = () =>
  "Untuk itu saya belum bantu ya Boss, karena fokus saya di urusan keuangan pribadi dan penggunaan Finance AI ini. Kalau mau, saya bisa bantu catat transaksi, cek laporan, budget, target, portfolio, atau kasih insight keuangan.";

const buildLowContextReply = () =>
  "Saya belum cukup paham maksud Boss dari pesan ini, jadi saya belum mau jawab ngawur. Kalau maksudnya terkait transaksi, laporan, budget, target, portfolio, market, atau advice keuangan, tulis aja dengan bahasa bebas dan saya bantu arahkan.";

const buildCapabilityReply = () =>
  [
    "Saya bisa bantu lewat chat biasa untuk:",
    "- catat pemasukan/pengeluaran",
    "- edit atau hapus transaksi",
    "- laporan harian/mingguan/bulanan",
    "- budget dan target tabungan",
    "- portfolio, harga market, finance news",
    "- insight, advice, financial freedom, dan simulasi wealth projection"
  ].join("\n");

const buildUserContextSummary = async (userId: string) => {
  const [baseContext, txCount, budgetCount] = await Promise.all([
    loadUserFinancialContext({ userId, recentMessagesLimit: 5 }),
    prisma.transaction.count({ where: { userId } }),
    prisma.budget.count({ where: { userId } })
  ]);

  const summaryText = [
    buildUserFinancialContextSummary(baseContext),
    `transactionCount=${txCount}`,
    `budgetCount=${budgetCount}`,
    `assetCount=${baseContext.assets.length}`
  ].join("\n");

  return {
    summaryText,
    recentMessages: baseContext.recentMessages.map((item) => normalizeText(item))
  };
};

export const tryHandleGeneralChat = async (params: {
  userId: string;
  text: string;
  mode?: "quick" | "full";
}): Promise<GeneralChatResult> => {
  const text = normalizeText(params.text);
  if (!text) return { handled: false };

  if (GREETING_PATTERN.test(text) && text.split(" ").length <= 6) {
    return { handled: true, replyText: buildGreetingReply(), source: "rule" };
  }

  if (THANKS_PATTERN.test(text) && text.split(" ").length <= 8) {
    return { handled: true, replyText: buildThanksReply(), source: "rule" };
  }

  if (CAPABILITY_PATTERN.test(text)) {
    return { handled: true, replyText: buildCapabilityReply(), source: "rule" };
  }

  if (OUT_OF_SCOPE_PATTERN.test(text) && !FINANCE_RELATED_PATTERN.test(text)) {
    return { handled: true, replyText: buildOutOfScopeReply(), source: "rule" };
  }

  if (params.mode === "quick") {
    return { handled: false };
  }

  if (!FINANCE_RELATED_PATTERN.test(text) && text.split(" ").length <= 5) {
    return { handled: true, replyText: buildLowContextReply(), source: "rule" };
  }

  const context = await buildUserContextSummary(params.userId);

  try {
    const replyText = await generateGroundedGeneralChatReply({
      userMessage: text,
      appCapabilities: HELP_TEXT,
      userContext: context.summaryText,
      recentMessages: context.recentMessages
    });
    return {
      handled: true,
      replyText: normalizeText(replyText),
      source: "ai"
    };
  } catch (error) {
    if (isGeminiRateLimitError(error)) {
      return { handled: true, replyText: buildLowContextReply(), source: "rule" };
    }

    return {
      handled: true,
      replyText: FINANCE_RELATED_PATTERN.test(text) ? buildLowContextReply() : buildOutOfScopeReply(),
      source: "rule"
    };
  }
};
