import { AssetType, OnboardingQuestionKey, OnboardingStep } from "@prisma/client";
import {
  ADD_MORE_OPTIONS,
  ASSET_OPTIONS,
  GOLD_BRAND_OPTIONS,
  GOLD_KARAT_OPTIONS,
  GOLD_PLATFORM_OPTIONS,
  GOLD_TYPE_OPTIONS
} from "@/lib/services/onboarding/flow/shared/questions/answer-options";
import {
  assetLabel,
  goldTypeLabel
} from "@/lib/services/onboarding/flow/shared/questions/display-labels";
import type {
  OnboardingPrompt,
  OnboardingPromptContext
} from "@/lib/services/onboarding/flow/shared/questions/question-types";
import type { PromptFlowHandler } from "@/lib/services/onboarding/flow/helpers/prompt-handler-types";

const getAssetPromptForStep = (
  step: OnboardingStep,
  context: OnboardingPromptContext
): OnboardingPrompt | null => {
  switch (step) {
    case OnboardingStep.ASK_ASSET_SELECTION:
      return {
        stepKey: step,
        questionKey: OnboardingQuestionKey.ASSET_SELECTION,
        title: "Aset Yang Sudah Jalan",
        body: [
          "Sekarang aset yang sudah Boss punya apa aja?",
          "Kalau ada beberapa, boleh pilih sekaligus. Kalau belum ada, pilih `Belum punya` ya."
        ].join("\n\n"),
        inputType: "multi_select",
        options: ASSET_OPTIONS
      };
    case OnboardingStep.ASK_ASSET_SAVINGS_NAME:
      return {
        stepKey: step,
        questionKey: OnboardingQuestionKey.ASSET_SAVINGS_NAME,
        title: "Detail Tabungan",
        body: "Tabungan ini kamu taruh di mana Boss? Bisa di bank, cash, atau e-wallet. Contohnya `BCA`, `Jago`, `SeaBank`, `cash`, atau `DANA`.",
        inputType: "text"
      };
    case OnboardingStep.ASK_ASSET_SAVINGS_BALANCE:
      return {
        stepKey: step,
        questionKey: OnboardingQuestionKey.ASSET_SAVINGS_BALANCE,
        title: "Jumlah Tabungan",
        body: "Jumlah tabungannya sekarang berapa Boss?",
        inputType: "money"
      };
    case OnboardingStep.ASK_ASSET_GOLD_TYPE:
    case OnboardingStep.ASK_ASSET_GOLD_NAME:
      return {
        stepKey: OnboardingStep.ASK_ASSET_GOLD_TYPE,
        questionKey: OnboardingQuestionKey.ASSET_GOLD_TYPE,
        title: "Detail Emas",
        body: "Emas yang kamu punya bentuknya apa Boss?",
        inputType: "single_select",
        options: GOLD_TYPE_OPTIONS
      };
    case OnboardingStep.ASK_ASSET_GOLD_BRAND:
      return {
        stepKey: step,
        questionKey: OnboardingQuestionKey.ASSET_GOLD_BRAND,
        title: "Brand Emas",
        body: "Kalau emas batangan, mereknya apa Boss?",
        inputType: "single_select",
        options: GOLD_BRAND_OPTIONS
      };
    case OnboardingStep.ASK_ASSET_GOLD_GRAMS:
      return {
        stepKey: step,
        questionKey: OnboardingQuestionKey.ASSET_GOLD_GRAMS,
        title: "Berat Emas",
        body:
          context.currentGoldType === "BULLION"
            ? "Berapa gram emas batangannya Boss? Balas angka saja ya."
            : context.currentGoldType === "JEWELRY"
              ? "Berat perhiasannya berapa gram Boss? Balas angka saja ya."
              : context.currentGoldType === "DIGITAL"
                ? "Kamu punya berapa gram emas digital Boss? Balas angka saja ya."
                : `Total berat ${goldTypeLabel(context.currentGoldType)} itu berapa gram Boss? Contoh: \`10.5\`.`,
        inputType: "decimal"
      };
    case OnboardingStep.ASK_ASSET_GOLD_KARAT:
      return {
        stepKey: step,
        questionKey: OnboardingQuestionKey.ASSET_GOLD_KARAT,
        title: "Karat Emas",
        body: "Karat perhiasannya berapa Boss?",
        inputType: "single_select",
        options: GOLD_KARAT_OPTIONS
      };
    case OnboardingStep.ASK_ASSET_GOLD_PLATFORM:
      return {
        stepKey: step,
        questionKey: OnboardingQuestionKey.ASSET_GOLD_PLATFORM,
        title: "Platform Emas Digital",
        body: "Platform emas digitalnya apa Boss?",
        inputType: "single_select",
        options: GOLD_PLATFORM_OPTIONS
      };
    case OnboardingStep.ASK_ASSET_STOCK_SYMBOL:
      return {
        stepKey: step,
        questionKey: OnboardingQuestionKey.ASSET_STOCK_SYMBOL,
        title: "Detail Saham",
        body: "Saham apa yang kamu punya Boss? Boleh kirim kode seperti `BBRI` atau `BBCA`.",
        inputType: "text"
      };
    case OnboardingStep.ASK_ASSET_STOCK_LOTS:
      return {
        stepKey: step,
        questionKey: OnboardingQuestionKey.ASSET_STOCK_LOTS,
        title: "Jumlah Lot",
        body: "Kamu pegang berapa lot saham ini Boss?",
        inputType: "decimal"
      };
    case OnboardingStep.ASK_ASSET_PROPERTY_NAME:
      return {
        stepKey: step,
        questionKey: OnboardingQuestionKey.ASSET_PROPERTY_NAME,
        title: "Detail Properti",
        body: "Propertinya apa Boss? Contoh: `Rumah`, `Apartemen`, atau `Tanah`.",
        inputType: "text"
      };
    case OnboardingStep.ASK_ASSET_PROPERTY_ESTIMATED_VALUE:
      return {
        stepKey: step,
        questionKey: OnboardingQuestionKey.ASSET_PROPERTY_ESTIMATED_VALUE,
        title: "Nilai Properti",
        body: "Kira-kira nilai propertinya sekarang berapa Boss? Ini saya pakai sebagai patokan awal dulu ya.",
        inputType: "money"
      };
    case OnboardingStep.ASK_ASSET_NAME:
      if (context.currentAssetType === AssetType.SAVINGS) {
        return getAssetPromptForStep(OnboardingStep.ASK_ASSET_SAVINGS_NAME, context);
      }
      if (context.currentAssetType === AssetType.STOCK) {
        return getAssetPromptForStep(OnboardingStep.ASK_ASSET_STOCK_SYMBOL, context);
      }
      if (context.currentAssetType === AssetType.PROPERTY) {
        return getAssetPromptForStep(OnboardingStep.ASK_ASSET_PROPERTY_NAME, context);
      }
      return {
        stepKey: step,
        questionKey: OnboardingQuestionKey.ASSET_NAME,
        title: assetLabel(context.currentAssetType),
        body: "Aset ini mau kamu sebut apa Boss?",
        inputType: "text"
      };
    case OnboardingStep.ASK_ASSET_ESTIMATED_VALUE:
      if (context.currentAssetType === AssetType.SAVINGS) {
        return getAssetPromptForStep(OnboardingStep.ASK_ASSET_SAVINGS_BALANCE, context);
      }
      if (context.currentAssetType === AssetType.STOCK) {
        return getAssetPromptForStep(OnboardingStep.ASK_ASSET_STOCK_LOTS, context);
      }
      if (context.currentAssetType === AssetType.PROPERTY) {
        return getAssetPromptForStep(OnboardingStep.ASK_ASSET_PROPERTY_ESTIMATED_VALUE, context);
      }
      return {
        stepKey: step,
        questionKey: OnboardingQuestionKey.ASSET_ESTIMATED_VALUE,
        title: assetLabel(context.currentAssetType),
        body: "Kira-kira nilainya sekarang berapa Boss?",
        inputType: "money"
      };
    case OnboardingStep.ASK_ASSET_ADD_MORE:
      return {
        stepKey: step,
        questionKey: OnboardingQuestionKey.ASSET_ADD_MORE,
        title: "Tambah Aset",
        body: "Masih ada aset lain yang mau dipantau juga Boss?",
        inputType: "single_select",
        options: ADD_MORE_OPTIONS
      };
    default:
      return null;
  }
};

export const getAssetsPrompt: PromptFlowHandler = ({ step, context }) =>
  getAssetPromptForStep(step, context);
