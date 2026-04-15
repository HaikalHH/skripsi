import {
  AssetType,
  BudgetMode,
  ExpensePlanSource,
  FinancialGoalStatus,
  FinancialGoalType,
  GoalCalculationType,
  OnboardingQuestionKey,
  OnboardingStatus,
  OnboardingStep,
  PrimaryGoal,
  Prisma,
  RegistrationStatus,
  type OnboardingSession,
  type User
} from "@prisma/client";
import {
  ASSET_NONE_VALUE,
  formatPromptForChat,
  getNextOnboardingStep,
  getPromptForStep,
  GOAL_NONE_VALUE,
  type OnboardingPrompt,
  type OnboardingPromptContext
} from "@/lib/services/onboarding/onboarding-flow-service";
import {
  buildInitialFinancialProfile,
  createOnboardingAsset,
  createOrUpdateFinancialGoal,
  deriveEmploymentSummary,
  generateOnboardingAnalysis,
  parseManualBreakdownTotal,
  replaceExpensePlan,
  setMonthlyExpenseTotal,
  upsertIncomeProfile,
  type ExpenseBreakdown
} from "@/lib/services/onboarding/onboarding-calculation-service";
import { canonicalizeOnboardingAnswer } from "@/lib/services/ai/ai-service";
import {
  buildDummyPaymentLink,
  createOrGetPendingPaymentSession
} from "@/lib/services/payments/payment-service";
import {
  getCurrentAssetType,
  getCurrentGoalType,
  getEmploymentTypes,
  getGoalExpenseStrategy,
  getLatestAssetName,
  getLatestCustomGoalName,
  getLatestStockQuantity,
  getSessionNormalizedValue,
  isReadyCommand,
  latestSessionForQuestion,
  normalizeText,
  parseAssetSelection,
  parseBooleanAnswer,
  parseBudgetMode,
  parseDayOfMonth,
  parseDecimalInput,
  parseGoalExpenseStrategy,
  parseGoalSelection,
  parseManualExpenseBreakdown,
  parseMoneyInput,
  parseOptionalAge,
  parsePhoneInput,
  parsePrimaryGoal,
  parseEmploymentTypes,
  parseStockQuantityInput,
  parseStockSymbolInput,
  PHONE_PROMPT,
  type SessionAnswerValue
} from "@/lib/services/onboarding/onboarding-parser-service";
import { resolveConversationMemory } from "@/lib/services/assistant/conversation-memory-service";
import { formatMoney } from "@/lib/services/shared/money-format";
import { prisma } from "@/lib/prisma";

type OnboardingResult = {
  handled: boolean;
  replyText: string;
  state?: OnboardingState;
};

export type OnboardingState = {
  userId: string;
  onboardingStatus: OnboardingStatus;
  stepKey: OnboardingStep;
  questionKey: OnboardingQuestionKey | null;
  promptText: string | null;
  prompt: OnboardingPrompt | null;
  isCompleted: boolean;
  analysisText?: string | null;
  paymentLink?: string | null;
};

type RuntimeContext = OnboardingPromptContext & {
  user: User;
  sessions: OnboardingSession[];
};

const getOnboardingSessionModel = () => (prisma as { onboardingSession?: any }).onboardingSession;
const getFinancialProfileModel = () => (prisma as { financialProfile?: any }).financialProfile;
const getExpensePlanModel = () => (prisma as { expensePlan?: any }).expensePlan;
const createState = (params: {
  user: User;
  prompt: OnboardingPrompt | null;
  analysisText?: string | null;
  paymentLink?: string | null;
}): OnboardingState => ({
  userId: params.user.id,
  onboardingStatus: params.user.onboardingStatus,
  stepKey: params.user.onboardingStep,
  questionKey: params.prompt?.questionKey ?? null,
  promptText: params.prompt ? formatPromptForChat(params.prompt) : null,
  prompt: params.prompt,
  isCompleted: params.user.onboardingStatus === OnboardingStatus.COMPLETED,
  analysisText: params.analysisText ?? null,
  paymentLink: params.paymentLink ?? null
});

const buildValidationReply = (prompt: OnboardingPrompt, message: string): OnboardingResult => ({
  handled: true,
  replyText: `${message}\n\n${formatPromptForChat(prompt)}`
});

const formatStockHoldingLabel = (amount: number, shares: number, unit: string) =>
  unit === "lot" ? `${amount} lot (${shares} lembar)` : `${shares} lembar`;

const buildAssetCompletionSummary = (
  context: RuntimeContext,
  normalizedAnswer: SessionAnswerValue
) => {
  const assetType = context.currentAssetType ?? getCurrentAssetType(context.sessions);

  if (context.user.onboardingStep === OnboardingStep.ASK_ASSET_GOLD_GRAMS && assetType === AssetType.GOLD) {
    const goldName =
      getLatestAssetName(context.sessions, OnboardingQuestionKey.ASSET_GOLD_NAME) ?? "Emas";
    return [
      "Berikut catatan emas kamu:",
      `- Jenis emas: ${goldName}`,
      `- Jumlah: ${normalizedAnswer as number} gram`
    ].join("\n");
  }

  if (context.user.onboardingStep !== OnboardingStep.ASK_ASSET_ESTIMATED_VALUE || !assetType) {
    return null;
  }

  const assetName =
    getLatestAssetName(context.sessions, OnboardingQuestionKey.ASSET_NAME) ??
    getLatestAssetName(context.sessions, OnboardingQuestionKey.ASSET_GOLD_NAME) ??
    "Aset";
  const amount = normalizedAnswer as number;

  switch (assetType) {
    case AssetType.SAVINGS:
      return [
        "Berikut catatan tabungan kamu:",
        `- Bank: ${assetName}`,
        `- Saldo: ${formatMoney(amount)}`
      ].join("\n");
    case AssetType.PROPERTY:
      return [
        "Berikut catatan properti kamu:",
        `- Properti: ${assetName}`,
        `- Estimasi nilai: ${formatMoney(amount)}`
      ].join("\n");
    case AssetType.GOLD:
      return [
        "Berikut catatan emas kamu:",
        `- Jenis emas: ${assetName}`,
        `- Estimasi nilai: ${formatMoney(amount)}`
      ].join("\n");
    case AssetType.STOCK: {
      const stockQuantity = getLatestStockQuantity(context.sessions);
      if (!stockQuantity) return null;

      const totalValue = stockQuantity.shares * amount;
      return [
        "Berikut catatan saham kamu:",
        `- Kode saham: ${assetName}`,
        `- Jumlah: ${formatStockHoldingLabel(
          stockQuantity.amount,
          stockQuantity.shares,
          stockQuantity.unit
        )}`,
        `- Harga beli per lembar: ${formatMoney(amount)}`,
        `- Total nilai: ${formatMoney(totalValue)}`
      ].join("\n");
    }
    default:
      return [
        "Berikut catatan aset kamu:",
        `- Nama aset: ${assetName}`,
        `- Nilai: ${formatMoney(amount)}`
      ].join("\n");
  }
};

const resolvePrompt = (context: RuntimeContext) => getPromptForStep(context.user.onboardingStep, context);

const buildRuntimeContext = async (userId: string, existingUser?: User): Promise<RuntimeContext> => {
  const user = existingUser ?? (await prisma.user.findUnique({ where: { id: userId } }));
  if (!user) throw new Error("User not found");

  const onboardingSessionModel = getOnboardingSessionModel();
  const financialProfileModel = getFinancialProfileModel();
  const expensePlanModel = getExpensePlanModel();

  const [sessions, profile, activePlan] = await Promise.all([
    onboardingSessionModel
      ? onboardingSessionModel.findMany({ where: { userId }, orderBy: { createdAt: "asc" } })
      : Promise.resolve([]),
    financialProfileModel
      ? financialProfileModel.findUnique({ where: { userId } })
      : Promise.resolve(null),
    expensePlanModel
      ? expensePlanModel.findFirst({ where: { userId, isActive: true }, orderBy: { createdAt: "desc" } })
      : Promise.resolve(null)
  ]);

  return {
    user,
    sessions,
    needsPhoneVerification: !/^62\d{7,15}$/.test(user.waNumber),
    budgetMode: user.budgetMode ?? null,
    employmentTypes: getEmploymentTypes(sessions),
    currentGoalType: getCurrentGoalType(sessions),
    currentAssetType: getCurrentAssetType(sessions),
    expenseAvailable: Boolean(activePlan || profile?.monthlyExpenseTotal != null),
    goalExpenseStrategy: getGoalExpenseStrategy(sessions)
  };
};

const saveSessionAnswer = async (params: {
  userId: string;
  stepKey: OnboardingStep;
  questionKey: OnboardingQuestionKey;
  rawAnswer: unknown;
  normalizedAnswer: SessionAnswerValue;
}) => {
  const onboardingSessionModel = getOnboardingSessionModel();
  if (!onboardingSessionModel) return null;

  return onboardingSessionModel.create({
    data: {
      userId: params.userId,
      stepKey: params.stepKey,
      questionKey: params.questionKey,
      rawAnswerJson: params.rawAnswer as Prisma.InputJsonValue,
      normalizedAnswerJson: params.normalizedAnswer as Prisma.InputJsonValue,
      isCompleted: true
    }
  });
};

const goalNameByType = (goalType: FinancialGoalType, customName: string | null) => {
  if (goalType === FinancialGoalType.CUSTOM) return customName ?? "Custom Target";
  if (goalType === FinancialGoalType.EMERGENCY_FUND) return "Dana Darurat";
  if (goalType === FinancialGoalType.HOUSE) return "Beli Rumah";
  if (goalType === FinancialGoalType.VEHICLE) return "Beli Kendaraan";
  if (goalType === FinancialGoalType.VACATION) return "Liburan";
  return "Financial Freedom";
};

const PROFILE_RECALCULATION_STEPS: OnboardingStep[] = [
  OnboardingStep.ASK_ACTIVE_INCOME,
  OnboardingStep.ASK_PASSIVE_INCOME,
  OnboardingStep.ASK_ESTIMATED_MONTHLY_INCOME,
  OnboardingStep.ASK_MANUAL_EXPENSE_BREAKDOWN,
  OnboardingStep.ASK_GUIDED_EXPENSE_OTHERS,
  OnboardingStep.ASK_GOAL_SELECTION,
  OnboardingStep.ASK_GOAL_TARGET_AMOUNT,
  OnboardingStep.ASK_GOAL_EXPENSE_STRATEGY,
  OnboardingStep.ASK_GOAL_EXPENSE_TOTAL,
  OnboardingStep.ASK_GOAL_FINANCIAL_FREEDOM_AGE,
  OnboardingStep.ASK_ASSET_GOLD_GRAMS,
  OnboardingStep.ASK_ASSET_ESTIMATED_VALUE
];

const needsProfileRecalculation = (step: OnboardingStep) =>
  PROFILE_RECALCULATION_STEPS.includes(step);

const normalizeComparableText = (value: string) => normalizeText(value).toLowerCase();

const validateAnswerForStep = (context: RuntimeContext, rawAnswer: unknown) => {
  const prompt = resolvePrompt(context);
  switch (context.user.onboardingStep) {
    case OnboardingStep.WAIT_REGISTER:
      return typeof rawAnswer === "string" && isReadyCommand(rawAnswer)
        ? { value: "START" as SessionAnswerValue }
        : ({ handled: true, replyText: formatPromptForChat(prompt) } as OnboardingResult);
    case OnboardingStep.VERIFY_PHONE: {
      const phone = typeof rawAnswer === "string" ? parsePhoneInput(rawAnswer) : null;
      return phone
        ? { value: phone }
        : buildValidationReply(prompt, "Nomor WhatsApp belum valid.");
    }
    case OnboardingStep.ASK_PRIMARY_GOAL: {
      const parsed = parsePrimaryGoal(rawAnswer);
      return parsed ? { value: parsed } : buildValidationReply(prompt, "Pilih salah satu tujuan utama ya Boss.");
    }
    case OnboardingStep.ASK_EMPLOYMENT_TYPES: {
      const parsed = parseEmploymentTypes(rawAnswer);
      return parsed?.length
        ? { value: parsed }
        : buildValidationReply(prompt, "Status pekerjaan belum kebaca. Coba pilih salah satu atau kombinasinya ya Boss.");
    }
    case OnboardingStep.ASK_HAS_ACTIVE_INCOME:
    case OnboardingStep.ASK_HAS_PASSIVE_INCOME:
    case OnboardingStep.ASK_GOAL_ADD_MORE:
    case OnboardingStep.ASK_ASSET_ADD_MORE: {
      const parsed = parseBooleanAnswer(rawAnswer);
      return parsed === null
        ? buildValidationReply(prompt, "Balas dengan `Ada` atau `Ga ada` ya Boss.")
        : { value: parsed };
    }
    case OnboardingStep.ASK_ACTIVE_INCOME:
    case OnboardingStep.ASK_PASSIVE_INCOME:
    case OnboardingStep.ASK_ESTIMATED_MONTHLY_INCOME:
    case OnboardingStep.ASK_GUIDED_EXPENSE_FOOD:
    case OnboardingStep.ASK_GUIDED_EXPENSE_TRANSPORT:
    case OnboardingStep.ASK_GUIDED_EXPENSE_BILLS:
    case OnboardingStep.ASK_GUIDED_EXPENSE_ENTERTAINMENT:
    case OnboardingStep.ASK_GUIDED_EXPENSE_OTHERS:
    case OnboardingStep.ASK_GOAL_TARGET_AMOUNT:
    case OnboardingStep.ASK_GOAL_EXPENSE_TOTAL: {
      const parsed = parseMoneyInput(rawAnswer);
      return parsed === null
        ? buildValidationReply(prompt, "Nominalnya belum valid. Coba kirim angka rupiah ya Boss.")
        : { value: parsed };
    }
    case OnboardingStep.ASK_ASSET_ESTIMATED_VALUE: {
      const parsed = parseMoneyInput(rawAnswer);
      if (parsed === null || (context.currentAssetType === AssetType.STOCK && parsed <= 0)) {
        const message =
          context.currentAssetType === AssetType.STOCK
            ? "Harga beli per lembar belum valid. Coba kirim angka rupiah ya."
            : context.currentAssetType === AssetType.SAVINGS
              ? "Saldo tabungannya belum valid. Coba kirim angka rupiah ya."
              : context.currentAssetType === AssetType.PROPERTY
                ? "Estimasi nilai propertinya belum valid. Coba kirim angka rupiah ya."
                : context.currentAssetType === AssetType.GOLD
                  ? "Estimasi nilai emasnya belum valid. Coba kirim angka rupiah ya."
                  : "Nominalnya belum valid. Coba kirim angka rupiah ya Boss.";
        return buildValidationReply(prompt, message);
      }
      return { value: parsed };
    }
    case OnboardingStep.ASK_SALARY_DATE: {
      const parsed = parseDayOfMonth(rawAnswer);
      return parsed === null
        ? buildValidationReply(prompt, "Tanggal gajian harus angka 1-31 ya Boss.")
        : { value: parsed };
    }
    case OnboardingStep.ASK_BUDGET_MODE: {
      const parsed = parseBudgetMode(rawAnswer);
      return parsed ? { value: parsed } : buildValidationReply(prompt, "Pilih salah satu mode pengeluaran ya Boss.");
    }
    case OnboardingStep.ASK_MANUAL_EXPENSE_BREAKDOWN: {
      const parsed = typeof rawAnswer === "string" ? parseManualExpenseBreakdown(rawAnswer) : null;
      return parsed && parseManualBreakdownTotal(parsed) !== null
        ? { value: parsed }
        : buildValidationReply(
            prompt,
            "Alokasi pengeluarannya belum kebaca. Kirim saja kategori dan nominal apa adanya, saya bantu baca otomatis."
          );
    }
    case OnboardingStep.ASK_GOAL_SELECTION: {
      const parsed = parseGoalSelection(rawAnswer);
      return parsed ? { value: parsed } : buildValidationReply(prompt, "Pilih salah satu target dulu ya Boss.");
    }
    case OnboardingStep.ASK_GOAL_CUSTOM_NAME:
    case OnboardingStep.ASK_ASSET_GOLD_NAME:
      return typeof rawAnswer === "string" && normalizeText(rawAnswer).length >= 2
        ? { value: normalizeText(rawAnswer) }
        : buildValidationReply(prompt, "Jawabannya masih terlalu pendek, coba lebih spesifik ya Boss.");
    case OnboardingStep.ASK_ASSET_NAME:
      if (context.currentAssetType === AssetType.STOCK) {
        const parsed = parseStockSymbolInput(rawAnswer);
        return parsed
          ? { value: parsed }
          : buildValidationReply(
              prompt,
              "Kode saham belum valid. Pakai huruf saja, misalnya `BBRI` atau `TLKM`."
            );
      }

      return typeof rawAnswer === "string" && normalizeText(rawAnswer).length >= 2
        ? { value: normalizeText(rawAnswer) }
        : buildValidationReply(prompt, "Jawabannya masih terlalu pendek, coba lebih spesifik ya Boss.");
    case OnboardingStep.ASK_GOAL_EXPENSE_STRATEGY: {
      const parsed = parseGoalExpenseStrategy(rawAnswer);
      return parsed ? { value: parsed } : buildValidationReply(prompt, "Pilih salah satu opsi dulu ya Boss.");
    }
    case OnboardingStep.ASK_GOAL_FINANCIAL_FREEDOM_AGE: {
      const parsed = parseOptionalAge(rawAnswer);
      return parsed === undefined
        ? buildValidationReply(prompt, "Usia target belum valid. Balas angka 18-100 atau `skip`.")
        : { value: parsed };
    }
    case OnboardingStep.ASK_ASSET_SELECTION: {
      const parsed = parseAssetSelection(rawAnswer);
      return parsed ? { value: parsed } : buildValidationReply(prompt, "Pilih salah satu aset dulu ya Boss.");
    }
    case OnboardingStep.ASK_ASSET_GOLD_GRAMS: {
      if (context.currentAssetType === AssetType.STOCK) {
        const parsed = parseStockQuantityInput(rawAnswer);
        return parsed
          ? { value: parsed }
          : buildValidationReply(
              prompt,
              "Jumlah saham belum valid. Tulis angka + unit, misalnya `2 lot` atau `150 lembar`."
            );
      }

      const parsed = typeof rawAnswer === "string" ? parseDecimalInput(rawAnswer) : null;
      return parsed ? { value: parsed } : buildValidationReply(prompt, "Jumlah gram emas belum valid ya Boss.");
    }
    default:
      return buildValidationReply(prompt, "Jawaban belum bisa diproses. Coba lagi ya Boss.");
  }
};

const tryCanonicalizeFailedOnboardingAnswer = async (
  context: RuntimeContext,
  rawAnswer: unknown
) => {
  if (typeof rawAnswer !== "string") return null;
  const trimmedAnswer = normalizeText(rawAnswer);
  if (!trimmedAnswer) return null;
  if (context.user.onboardingStep === OnboardingStep.VERIFY_PHONE) return null;

  const prompt = resolvePrompt(context);

  try {
    const normalizedAnswer = await canonicalizeOnboardingAnswer({
      stepKey: context.user.onboardingStep,
      questionTitle: prompt.title,
      questionBody: prompt.body,
      inputType: prompt.inputType,
      rawAnswer: trimmedAnswer,
      options: prompt.options
    });

    if (!normalizedAnswer) return null;
    if (normalizeComparableText(normalizedAnswer) === normalizeComparableText(trimmedAnswer)) {
      return null;
    }

    return normalizedAnswer;
  } catch {
    return null;
  }
};

const persistAnswer = async (context: RuntimeContext, normalizedAnswer: SessionAnswerValue, rawAnswer: unknown) => {
  const prompt = resolvePrompt(context);
  await saveSessionAnswer({
    userId: context.user.id,
    stepKey: context.user.onboardingStep,
    questionKey: prompt.questionKey,
    rawAnswer,
    normalizedAnswer
  });

  switch (context.user.onboardingStep) {
    case OnboardingStep.WAIT_REGISTER:
      await prisma.user.update({ where: { id: context.user.id }, data: { onboardingStatus: OnboardingStatus.IN_PROGRESS } });
      break;
    case OnboardingStep.VERIFY_PHONE:
      await prisma.user.update({ where: { id: context.user.id }, data: { waNumber: normalizedAnswer as string } });
      break;
    case OnboardingStep.ASK_PRIMARY_GOAL:
      await prisma.user.update({ where: { id: context.user.id }, data: { primaryGoal: normalizedAnswer as PrimaryGoal } });
      break;
    case OnboardingStep.ASK_EMPLOYMENT_TYPES: {
      const summary = deriveEmploymentSummary(normalizedAnswer as any[]);
      await prisma.user.update({ where: { id: context.user.id }, data: { employmentType: summary.employmentType, incomeStability: summary.incomeStability } });
      break;
    }
    case OnboardingStep.ASK_ACTIVE_INCOME:
      await upsertIncomeProfile({ userId: context.user.id, activeIncomeMonthly: normalizedAnswer as number });
      break;
    case OnboardingStep.ASK_SALARY_DATE:
      await prisma.user.update({ where: { id: context.user.id }, data: { salaryDate: normalizedAnswer as number } });
      break;
    case OnboardingStep.ASK_HAS_PASSIVE_INCOME:
      await prisma.user.update({ where: { id: context.user.id }, data: { hasPassiveIncome: normalizedAnswer as boolean } });
      if ((normalizedAnswer as boolean) === false) {
        await upsertIncomeProfile({ userId: context.user.id, passiveIncomeMonthly: null });
      }
      break;
    case OnboardingStep.ASK_PASSIVE_INCOME:
      await upsertIncomeProfile({ userId: context.user.id, passiveIncomeMonthly: normalizedAnswer as number });
      break;
    case OnboardingStep.ASK_ESTIMATED_MONTHLY_INCOME:
      await upsertIncomeProfile({ userId: context.user.id, estimatedMonthlyIncome: normalizedAnswer as number });
      break;
    case OnboardingStep.ASK_BUDGET_MODE:
      await prisma.user.update({ where: { id: context.user.id }, data: { budgetMode: normalizedAnswer as BudgetMode } });
      break;
    case OnboardingStep.ASK_MANUAL_EXPENSE_BREAKDOWN:
      await replaceExpensePlan({ userId: context.user.id, source: ExpensePlanSource.MANUAL_USER_PLAN, breakdown: normalizedAnswer as ExpenseBreakdown });
      break;
    case OnboardingStep.ASK_GUIDED_EXPENSE_OTHERS: {
      const onboardingSessionModel = getOnboardingSessionModel();
      const sessions = onboardingSessionModel
        ? await onboardingSessionModel.findMany({ where: { userId: context.user.id }, orderBy: { createdAt: "asc" } })
        : [];
      const breakdown: ExpenseBreakdown = {
        food: getSessionNormalizedValue<number>(latestSessionForQuestion(sessions, OnboardingQuestionKey.GUIDED_EXPENSE_FOOD)) ?? 0,
        transport: getSessionNormalizedValue<number>(latestSessionForQuestion(sessions, OnboardingQuestionKey.GUIDED_EXPENSE_TRANSPORT)) ?? 0,
        bills: getSessionNormalizedValue<number>(latestSessionForQuestion(sessions, OnboardingQuestionKey.GUIDED_EXPENSE_BILLS)) ?? 0,
        entertainment: getSessionNormalizedValue<number>(latestSessionForQuestion(sessions, OnboardingQuestionKey.GUIDED_EXPENSE_ENTERTAINMENT)) ?? 0,
        others: normalizedAnswer as number
      };
      await replaceExpensePlan({ userId: context.user.id, source: ExpensePlanSource.GUIDED_ONBOARDING_PLAN, breakdown });
      break;
    }
    case OnboardingStep.ASK_GOAL_SELECTION:
      if (normalizedAnswer === FinancialGoalType.EMERGENCY_FUND && context.expenseAvailable) {
        await createOrUpdateFinancialGoal({ userId: context.user.id, goalType: FinancialGoalType.EMERGENCY_FUND, goalName: goalNameByType(FinancialGoalType.EMERGENCY_FUND, null), targetAmount: null, calculationType: GoalCalculationType.FORMULA_BASED, status: FinancialGoalStatus.ACTIVE });
      }
      break;
    case OnboardingStep.ASK_GOAL_TARGET_AMOUNT:
      if (context.currentGoalType) {
        await createOrUpdateFinancialGoal({ userId: context.user.id, goalType: context.currentGoalType, goalName: goalNameByType(context.currentGoalType, getLatestCustomGoalName(context.sessions)), targetAmount: normalizedAnswer as number, calculationType: GoalCalculationType.MANUAL, status: FinancialGoalStatus.ACTIVE });
      }
      break;
    case OnboardingStep.ASK_GOAL_EXPENSE_STRATEGY:
      if (normalizedAnswer === "SKIP" && context.currentGoalType === FinancialGoalType.EMERGENCY_FUND) {
        await createOrUpdateFinancialGoal({ userId: context.user.id, goalType: FinancialGoalType.EMERGENCY_FUND, goalName: goalNameByType(FinancialGoalType.EMERGENCY_FUND, null), targetAmount: null, calculationType: GoalCalculationType.AUTO_FROM_EXPENSE, status: FinancialGoalStatus.PENDING_CALCULATION });
      }
      break;
    case OnboardingStep.ASK_GOAL_EXPENSE_TOTAL:
      await setMonthlyExpenseTotal(context.user.id, normalizedAnswer as number);
      if (context.currentGoalType === FinancialGoalType.EMERGENCY_FUND) {
        await createOrUpdateFinancialGoal({ userId: context.user.id, goalType: FinancialGoalType.EMERGENCY_FUND, goalName: goalNameByType(FinancialGoalType.EMERGENCY_FUND, null), targetAmount: null, calculationType: GoalCalculationType.FORMULA_BASED, status: FinancialGoalStatus.ACTIVE });
      }
      break;
    case OnboardingStep.ASK_GOAL_FINANCIAL_FREEDOM_AGE:
      await prisma.user.update({ where: { id: context.user.id }, data: { targetFinancialFreedomAge: typeof normalizedAnswer === "number" ? normalizedAnswer : null } });
      await createOrUpdateFinancialGoal({ userId: context.user.id, goalType: FinancialGoalType.FINANCIAL_FREEDOM, goalName: goalNameByType(FinancialGoalType.FINANCIAL_FREEDOM, null), targetAmount: null, calculationType: GoalCalculationType.FORMULA_BASED, status: context.expenseAvailable ? FinancialGoalStatus.ACTIVE : FinancialGoalStatus.PENDING_CALCULATION, targetAge: typeof normalizedAnswer === "number" ? normalizedAnswer : null });
      break;
    case OnboardingStep.ASK_ASSET_SELECTION:
      await prisma.user.update({ where: { id: context.user.id }, data: { hasAssets: normalizedAnswer !== ASSET_NONE_VALUE } });
      break;
    case OnboardingStep.ASK_ASSET_GOLD_GRAMS:
      if (context.currentAssetType === AssetType.STOCK) break;
      await createOnboardingAsset({
        userId: context.user.id,
        assetType: AssetType.GOLD,
        assetName: getLatestAssetName(context.sessions, OnboardingQuestionKey.ASSET_GOLD_NAME) ?? "Emas",
        quantity: normalizedAnswer as number,
        unit: "gram"
      });
      break;
    case OnboardingStep.ASK_ASSET_ESTIMATED_VALUE:
      if (context.currentAssetType === AssetType.STOCK) {
        const stockQuantity = getLatestStockQuantity(context.sessions);
        if (!stockQuantity) break;

        const pricePerShare = normalizedAnswer as number;
        await createOnboardingAsset({
          userId: context.user.id,
          assetType: AssetType.STOCK,
          assetName: getLatestAssetName(context.sessions, OnboardingQuestionKey.ASSET_NAME) ?? "SAHAM",
          quantity: stockQuantity.shares,
          unit: "lembar",
          estimatedValue: stockQuantity.shares * pricePerShare,
          notes: `${stockQuantity.displayLabel} @ ${pricePerShare}`
        });
        break;
      }

      if (context.currentAssetType) {
        await createOnboardingAsset({
          userId: context.user.id,
          assetType: context.currentAssetType,
          assetName: getLatestAssetName(context.sessions, OnboardingQuestionKey.ASSET_NAME) ?? "Aset",
          estimatedValue: normalizedAnswer as number,
          unit: context.currentAssetType === AssetType.SAVINGS ? "account" : "unit"
        });
      }
      break;
  }
};

const moveToStep = async (userId: string, step: OnboardingStep) =>
  prisma.user.update({ where: { id: userId }, data: { onboardingStep: step, onboardingStatus: step === OnboardingStep.COMPLETED ? OnboardingStatus.COMPLETED : OnboardingStatus.IN_PROGRESS } });

const finalizeOnboarding = async (userId: string) => {
  await buildInitialFinancialProfile(userId);
  const analysisText = await generateOnboardingAnalysis(userId);
  const payment = await createOrGetPendingPaymentSession(userId);
  const user = await prisma.user.update({ where: { id: userId }, data: { registrationStatus: RegistrationStatus.COMPLETED, onboardingStatus: OnboardingStatus.COMPLETED, onboardingStep: OnboardingStep.COMPLETED, onboardingCompletedAt: new Date(), analysisReady: true } });
  return createState({ user, prompt: null, analysisText, paymentLink: buildDummyPaymentLink(payment.token) });
};

const buildCompletedReplyText = (state: OnboardingState) => [state.analysisText ?? "Onboarding selesai.", state.paymentLink ? `Aktifkan paket Boss di link ini:\n${state.paymentLink}` : null].filter(Boolean).join("\n\n");

const continueFromValidatedAnswer = async (
  context: RuntimeContext,
  normalizedAnswer: SessionAnswerValue,
  rawAnswer: unknown
): Promise<OnboardingResult> => {
  await persistAnswer(context, normalizedAnswer, rawAnswer);
  if (needsProfileRecalculation(context.user.onboardingStep)) {
    await buildInitialFinancialProfile(context.user.id);
  }

  const nextContext = await buildRuntimeContext(context.user.id);
  const nextStep = getNextOnboardingStep(context.user.onboardingStep, nextContext, normalizedAnswer);
  if (nextStep === OnboardingStep.SHOW_ANALYSIS) {
    const state = await finalizeOnboarding(context.user.id);
    return { handled: true, replyText: buildCompletedReplyText(state), state };
  }

  const assetSummary = buildAssetCompletionSummary(nextContext, normalizedAnswer);
  const updatedUser = await moveToStep(context.user.id, nextStep);
  const updatedContext = await buildRuntimeContext(context.user.id, updatedUser);
  const prompt = resolvePrompt(updatedContext);
  return {
    handled: true,
    replyText: assetSummary ? `${assetSummary}\n\n${formatPromptForChat(prompt)}` : formatPromptForChat(prompt),
    state: createState({ user: updatedUser, prompt })
  };
};

const advanceOnboarding = async (user: User, rawAnswer: unknown): Promise<OnboardingResult> => {
  const context = await buildRuntimeContext(user.id, user);
  const initialValidation = validateAnswerForStep(context, rawAnswer);
  if (!("handled" in initialValidation)) {
    return continueFromValidatedAnswer(context, initialValidation.value, rawAnswer);
  }

  const canonicalizedAnswer = await tryCanonicalizeFailedOnboardingAnswer(context, rawAnswer);
  if (!canonicalizedAnswer) {
    return initialValidation;
  }

  const retryValidation = validateAnswerForStep(context, canonicalizedAnswer);
  if ("handled" in retryValidation) {
    return initialValidation;
  }

  return continueFromValidatedAnswer(context, retryValidation.value, rawAnswer);
};

export const getOnboardingState = async (params: { userId: string }): Promise<OnboardingState> => {
  const context = await buildRuntimeContext(params.userId);
  if (context.user.onboardingStatus === OnboardingStatus.COMPLETED) {
    const payment = await createOrGetPendingPaymentSession(params.userId);
    return createState({ user: context.user, prompt: null, analysisText: context.user.analysisReady ? await generateOnboardingAnalysis(params.userId) : null, paymentLink: buildDummyPaymentLink(payment.token) });
  }
  const prompt = resolvePrompt(context);
  return createState({ user: context.user, prompt });
};

export const submitOnboardingAnswer = async (params: { userId: string; answer: unknown }) => {
  const user = await prisma.user.findUnique({ where: { id: params.userId } });
  if (!user) throw new Error("User not found");
  const result = await advanceOnboarding(user, params.answer);
  if (!result.state) throw new Error("Onboarding state not available");
  return result.state;
};

export const completeOnboarding = async (userId: string) => finalizeOnboarding(userId);

export const handleOnboarding = async (params: {
  user: User;
  isNew: boolean;
  messageId?: string;
  messageType: "TEXT" | "IMAGE";
  text: string | undefined;
  phoneInput?: string;
  phoneInputRegistered?: boolean;
}): Promise<OnboardingResult> => {
  if (params.user.onboardingStatus === OnboardingStatus.COMPLETED || params.user.registrationStatus === RegistrationStatus.COMPLETED) {
    return { handled: false, replyText: "" };
  }

  const context = await buildRuntimeContext(params.user.id, params.user);
  const prompt = resolvePrompt(context);
  if (params.messageType !== "TEXT") {
    return { handled: true, replyText: `Onboarding awal hanya bisa via teks ya Boss.\n\n${formatPromptForChat(prompt)}`, state: createState({ user: context.user, prompt }) };
  }

  const rawText = (params.text ?? "").trim();
  if (!rawText) {
    return { handled: true, replyText: formatPromptForChat(prompt), state: createState({ user: context.user, prompt }) };
  }

  if (context.user.onboardingStep === OnboardingStep.VERIFY_PHONE && params.phoneInputRegistered === false) {
    return buildValidationReply(prompt, "Nomor tersebut tidak terdaftar di WhatsApp.");
  }

  if (context.user.onboardingStep === OnboardingStep.VERIFY_PHONE && params.phoneInputRegistered === true && params.phoneInput) {
    return advanceOnboarding(context.user, params.phoneInput);
  }

  if (rawText.startsWith("/") && !isReadyCommand(rawText)) {
    return { handled: true, replyText: `Perintah belum bisa dipakai sebelum onboarding selesai.\n\n${formatPromptForChat(prompt)}`, state: createState({ user: context.user, prompt }) };
  }

  const memoryResolution = await resolveConversationMemory({
    userId: context.user.id,
    currentMessageId: params.messageId,
    text: rawText,
    fallbackAssistantText: formatPromptForChat(prompt)
  });

  if (memoryResolution.kind === "reply") {
    return {
      handled: true,
      replyText: `${memoryResolution.replyText}\n\n${formatPromptForChat(prompt)}`,
      state: createState({ user: context.user, prompt })
    };
  }

  return advanceOnboarding(
    context.user,
    memoryResolution.kind === "rewrite" ? memoryResolution.effectiveText : rawText
  );
};

export const buildSubscriptionRequiredText = async (userId: string) => {
  const payment = await createOrGetPendingPaymentSession(userId);
  return ["Subscription Anda belum aktif.", `Silakan selesaikan pembayaran dummy di: ${buildDummyPaymentLink(payment.token)}`, "Setelah status paid, bot akan mengirim notifikasi aktivasi."].join("\n");
};




