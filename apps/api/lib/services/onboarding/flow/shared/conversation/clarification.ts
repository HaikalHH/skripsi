import type { OnboardingPrompt } from "@/lib/services/onboarding/flow/shared/questions/question-types";
import { normalizeText } from "@/lib/services/onboarding/flow/shared/answers/common-input";
import {
  ASK_QUESTION_CLARIFICATION_PHRASES,
  CHANNEL_CLARIFICATION_PHRASES,
  CLARIFICATION_PHRASES,
  CONFUSION_CLARIFICATION_PHRASES,
  CONSULTATION_CLARIFICATION_PHRASES,
  DATA_PRIVACY_CLARIFICATION_PHRASES,
  DURATION_CLARIFICATION_PHRASES,
  EDIT_LATER_CLARIFICATION_PHRASES,
  ESTIMATE_CLARIFICATION_PHRASES,
  EXAMPLE_CLARIFICATION_PHRASES,
  FEATURE_CLARIFICATION_PHRASES,
  FORMAT_CLARIFICATION_PHRASES,
  HELP_CHOOSE_CLARIFICATION_PHRASES,
  MULTI_SELECT_CLARIFICATION_PHRASES,
  OPTION_EXPLANATION_LEAD_PHRASES,
  PRICING_CLARIFICATION_PHRASES,
  SKIP_CLARIFICATION_PHRASES,
  WHY_NEEDED_CLARIFICATION_PHRASES
} from "@/lib/services/onboarding/flow/shared/questions/help-phrases";

const hasWholePhrase = (text: string, phrase: string) =>
  text === phrase ||
  text.startsWith(`${phrase} `) ||
  text.endsWith(` ${phrase}`) ||
  text.includes(` ${phrase} `);

const hasTruthyPhrase = (text: string, phrases: string[]) =>
  phrases.some((phrase) => {
    const normalizedPhrase = phrase.toLowerCase();
    return hasWholePhrase(text, normalizedPhrase);
  });

const hasAnyWholePhrase = (text: string, phrases: string[]) =>
  phrases.some((phrase) => hasWholePhrase(text, phrase));

const promptAllowsSkip = (prompt?: OnboardingPrompt | null) =>
  Boolean(
    prompt?.allowSkip ||
      prompt?.options?.some((option) => {
        const normalizedLabel = normalizeText(option.label).toLowerCase();
        return option.value === "SKIP" || normalizedLabel.includes("lewati");
      })
  );

const normalizeClarificationText = (rawAnswer: string) =>
  normalizeText(rawAnswer)
    .toLowerCase()
    .replace(/[?!.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export const isClarificationInsteadOfAnswer = (rawAnswer: unknown) => {
  if (typeof rawAnswer !== "string") return false;
  const normalized = normalizeClarificationText(rawAnswer);
  if (!normalized) return false;

  return hasAnyWholePhrase(normalized, CLARIFICATION_PHRASES);
};

export const getClarificationLeadText = (rawAnswer: unknown, prompt?: OnboardingPrompt) => {
  if (typeof rawAnswer !== "string") {
    return "Jawab dulu pertanyaan onboarding ini ya Boss.";
  }

  const normalized = normalizeClarificationText(rawAnswer);

  if (hasAnyWholePhrase(normalized, CONSULTATION_CLARIFICATION_PHRASES)) {
    return "Bisa Boss. Supaya konsultasinya nanti nyambung dengan kondisi kamu, jawab dulu pertanyaan ini ya.";
  }

  if (hasAnyWholePhrase(normalized, CONFUSION_CLARIFICATION_PHRASES)) {
    return "Saya bantu pelan-pelan Boss. Untuk sekarang, pilih jawaban yang paling mendekati dulu ya.";
  }

  if (hasAnyWholePhrase(normalized, FEATURE_CLARIFICATION_PHRASES)) {
    return "Bisa Boss. Saya nanti bisa bantu catat transaksi, pantau aset, dan kasih analisis. Untuk setup awal, jawab dulu pertanyaan ini ya.";
  }

  if (hasAnyWholePhrase(normalized, DATA_PRIVACY_CLARIFICATION_PHRASES)) {
    return "Pertanyaan soal data penting Boss. Saya jawab setelah setup awal ini, tapi untuk sekarang lanjutkan dulu pertanyaan berikut supaya profilnya kebentuk.";
  }

  if (hasAnyWholePhrase(normalized, PRICING_CLARIFICATION_PHRASES)) {
    return "Soal biaya bisa dibahas setelah setup awal Boss. Jawab dulu pertanyaan ini supaya saya bisa siapkan profil keuangannya.";
  }

  if (hasAnyWholePhrase(normalized, EDIT_LATER_CLARIFICATION_PHRASES)) {
    return "Bisa Boss, nanti datanya bisa diperbarui. Untuk sekarang jawab yang paling mendekati dulu ya.";
  }

  if (hasAnyWholePhrase(normalized, WHY_NEEDED_CLARIFICATION_PHRASES)) {
    return "Pertanyaan ini bantu saya kenal kondisi kamu dulu Boss, supaya arahan awalnya lebih pas. Jawab yang paling mendekati dulu ya.";
  }

  if (hasAnyWholePhrase(normalized, SKIP_CLARIFICATION_PHRASES)) {
    if (promptAllowsSkip(prompt)) {
      return "Bisa Boss, pertanyaan ini boleh dilewati dulu. Kalau mau lewati, balas `skip` atau `lewati` ya.";
    }
    return "Kalau belum yakin, pilih opsi yang paling mendekati dulu ya Boss. Kalau ada pilihan lewati, kamu juga bisa pilih itu.";
  }

  if (hasAnyWholePhrase(normalized, EXAMPLE_CLARIFICATION_PHRASES)) {
    return "Contohnya bisa lihat dari pilihan di bawah ini Boss. Pilih yang paling cocok dengan kondisi kamu.";
  }

  if (hasAnyWholePhrase(normalized, FORMAT_CLARIFICATION_PHRASES)) {
    if (prompt?.inputType === "money") {
      return "Jawabnya cukup pakai angka rupiah Boss. Singkatan seperti `2jt` juga bisa.";
    }
    if (prompt?.inputType === "integer" || prompt?.inputType === "decimal") {
      return "Jawabnya cukup pakai angka Boss. Nanti saya baca dan simpan sesuai pertanyaan ini.";
    }
    if (prompt?.options?.length) {
      return prompt.inputType === "multi_select"
        ? "Jawabnya boleh pilih satu atau beberapa opsi yang cocok Boss. Tulis angkanya atau nama opsinya juga bisa."
        : "Jawabnya cukup pilih salah satu opsi yang paling cocok Boss. Tulis angkanya atau nama opsinya juga bisa.";
    }
    return "Jawabnya cukup tulis singkat sesuai kondisi kamu Boss.";
  }

  if (hasAnyWholePhrase(normalized, ESTIMATE_CLARIFICATION_PHRASES)) {
    return "Belum harus presisi Boss. Pakai estimasi paling mendekati dulu, nanti datanya bisa diperbarui.";
  }

  if (hasAnyWholePhrase(normalized, HELP_CHOOSE_CLARIFICATION_PHRASES)) {
    return "Bisa saya bantu arahkan Boss. Untuk sekarang, pilih yang paling mendekati kondisi kamu dari opsi di bawah ini dulu ya.";
  }

  if (hasAnyWholePhrase(normalized, MULTI_SELECT_CLARIFICATION_PHRASES)) {
    if (prompt?.inputType === "multi_select") {
      return "Boleh Boss. Kalau ada beberapa yang cocok, tulis sekaligus saja dari pilihan di bawah ini.";
    }
    return "Untuk pertanyaan ini pilih satu jawaban yang paling cocok dulu ya Boss.";
  }

  if (hasAnyWholePhrase(normalized, DURATION_CLARIFICATION_PHRASES)) {
    return "Sebentar saja Boss. Saya butuh beberapa jawaban dasar dulu supaya profil awalnya kebentuk.";
  }

  if (hasAnyWholePhrase(normalized, CHANNEL_CLARIFICATION_PHRASES)) {
    return "Setup awal cukup lewat chat teks ini dulu Boss. Jawab pertanyaan berikut supaya profilnya kebentuk.";
  }

  if (
    hasAnyWholePhrase(normalized, [
      ...ASK_QUESTION_CLARIFICATION_PHRASES,
      ...OPTION_EXPLANATION_LEAD_PHRASES
    ])
  ) {
    return "Bisa Boss. Jawab dulu pertanyaan ini supaya saya punya konteks, setelah itu kamu bisa tanya lebih detail.";
  }

  return "Jawab dulu pertanyaan onboarding ini ya Boss.";
};

export const isOptionExplanationQuestion = (prompt: OnboardingPrompt, rawAnswer: unknown) => {
  if (typeof rawAnswer !== "string" || !prompt.options?.length) return false;

  const normalized = normalizeClarificationText(rawAnswer);
  if (!normalized) return false;

  const explanationPhrases = [
    "apa bedanya",
    "bedanya apa",
    "maksudnya",
    "contohnya",
    "contoh jawabannya",
    "jelasin",
    "jelasin dong",
    "gimana",
    "gmn",
    "yang mana",
    "opsi mana",
    "pilihan mana"
  ];

  if (!explanationPhrases.some((phrase) => hasWholePhrase(normalized, phrase))) {
    return false;
  }

  const optionKeywords = prompt.options.flatMap((option) =>
    normalizeText(option.label)
      .toLowerCase()
      .split(" ")
      .filter((token) => token.length >= 4)
  );

  const optionReferenceDetected =
    normalized.includes("opsi") ||
    normalized.includes("pilihan") ||
    normalized.startsWith("yang ") ||
    normalized.includes(" yang ") ||
    /\b\d+\b/.test(normalized);

  return optionReferenceDetected || optionKeywords.some((token) => normalized.includes(token));
};

export const isPositiveAnswerConfirmation = (rawAnswer: unknown) => {
  if (typeof rawAnswer !== "string") return false;
  const normalized = normalizeText(rawAnswer).toLowerCase();
  if (!normalized) return false;

  return hasTruthyPhrase(normalized, [
    "benar",
    "benerr",
    "benarrr",
    "bener",
    "bener banget",
    "betul",
    "betull",
    "bner",
    "bnr",
    "sudah",
    "udah",
    "sudah benar",
    "udah benar",
    "sudah pas",
    "udah pas",
    "pas",
    "cocok",
    "sip lanjut",
    "oke lanjut",
    "ok lanjut",
    "lanjut aja",
    "pakai ini",
    "pakai itu",
    "pakai yang ini",
    "pake ini",
    "pake itu",
    "pake yang ini",
    "tetap yang ini",
    "tetap target ini",
    "itu aja",
    "itu saja",
    "itu doang",
    "setuju",
    "confirmed",
    "confirm"
  ]);
};

export const isNegativeAnswerConfirmation = (rawAnswer: unknown) => {
  if (typeof rawAnswer !== "string") return false;
  const normalized = normalizeText(rawAnswer).toLowerCase();
  if (!normalized) return false;

  return hasTruthyPhrase(normalized, [
    "salah",
    "salh",
    "slah",
    "sala",
    "slh",
    "ga",
    "gak",
    "nggak",
    "engga",
    "enggak",
    "bukan",
    "masih salah",
    "belum benar",
    "belum pas",
    "kurang pas",
    "belum cocok",
    "ubah lagi",
    "mau diubah",
    "masih mau diubah",
    "ganti lagi",
    "revisi",
    "geser lagi"
  ]);
};
