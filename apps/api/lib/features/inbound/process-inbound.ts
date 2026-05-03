import { inboundMessageSchema } from "@finance/shared";
import { MessageType } from "@prisma/client";
import { env } from "@/lib/env";
import { checkRateLimit } from "@/lib/rate-limit";
import { createMessageLog } from "@/lib/services/messaging/message-service";
import { handleOnboarding } from "@/lib/services/onboarding/onboarding-service";
import { logDirectAssistantReply } from "@/lib/services/messaging/outbound-message-service";
import { ensureUsableSubscription } from "@/lib/services/payments/subscription-service";
import { findOrCreateUserByWaNumber, normalizeWaNumber } from "@/lib/services/user/user-service";
import { parseSentAt } from "./formatters";
import { handleImageMessage } from "./image-handler";
import { badRequest, ok, tooManyRequests, type InboundHandlerResult } from "./result";
import { handleTextMessage } from "./text-handler";

const withReplyLog = async (
  user: { id: string; waNumber: string },
  result: InboundHandlerResult
) => {
  const replyTexts = Array.isArray(result.body.replyTexts)
    ? result.body.replyTexts.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean)
    : [];
  const fallbackReplyText = typeof result.body.replyText === "string" ? result.body.replyText.trim() : "";
  const messagesToLog = replyTexts.length ? replyTexts : fallbackReplyText ? [fallbackReplyText] : [];

  for (const messageText of messagesToLog) {
    await logDirectAssistantReply({
      userId: user.id,
      waNumber: user.waNumber,
      messageText
    }).catch(() => null);
  }

  return result;
};

export const processInboundBody = async (body: unknown): Promise<InboundHandlerResult> => {
  const parsedBody = inboundMessageSchema.safeParse(body);
  if (!parsedBody.success) {
    return badRequest({
      replyText: "Payload tidak valid.",
      issues: parsedBody.error.issues
    });
  }

  const payload = parsedBody.data;
  const waNumberForBucket = normalizeWaNumber(payload.waNumber) || payload.waNumber;
  const rateLimit = checkRateLimit(
    waNumberForBucket,
    env.RATE_LIMIT_MAX,
    env.RATE_LIMIT_WINDOW_MS
  );
  if (!rateLimit.allowed) {
    return tooManyRequests({
      replyText: `Terlalu banyak request. Coba lagi dalam ${Math.ceil(
        rateLimit.retryAfterMs / 1000
      )} detik.`
    });
  }

  const userResult = await findOrCreateUserByWaNumber(payload.waNumber, payload.waLid);
  const user = userResult.user;
  const messageLog = await createMessageLog({
    userId: user.id,
    messageType: payload.messageType as MessageType,
    contentOrCaption:
      payload.messageType === "TEXT" ? payload.text ?? "" : payload.caption ?? "(image message)",
    mediaUrlOrLocalPath: payload.messageType === "IMAGE" ? "uploaded:base64" : undefined,
    sentAt: parseSentAt(payload.sentAt)
  });

  const onboardingResult = await handleOnboarding({
    user,
    isNew: userResult.isNew,
    messageId: messageLog.id,
    messageType: payload.messageType,
    text: payload.messageType === "TEXT" ? payload.text : payload.caption,
    phoneInput: payload.phoneInput,
    phoneInputRegistered: payload.phoneInputRegistered
  });
  if (onboardingResult.handled) {
    return withReplyLog(
      user,
      ok({
        replyText: onboardingResult.replyText,
        replyTexts: onboardingResult.replyTexts,
        preserveReplyTextBubbles: onboardingResult.preserveReplyTextBubbles
      })
    );
  }

  const canUseSubscription = await ensureUsableSubscription(user.id);
  if (!canUseSubscription) {
    return withReplyLog(
      user,
      ok({
        replyText:
          "Akun belum aktif karena onboarding belum selesai. Ketik lanjut untuk menyelesaikan onboarding dulu ya Boss."
      })
    );
  }

  if (payload.messageType === "TEXT") {
    const result = await handleTextMessage({
      userId: user.id,
      messageId: messageLog.id,
      text: payload.text
    });
    return withReplyLog(user, result);
  }

  const result = await handleImageMessage({
    userId: user.id,
    messageId: messageLog.id,
    caption: payload.caption,
    imageBase64: payload.imageBase64
  });
  return withReplyLog(user, result);
};
