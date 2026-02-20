import { inboundMessageSchema } from "@finance/shared";
import { MessageType } from "@prisma/client";
import { env } from "@/lib/env";
import { checkRateLimit } from "@/lib/rate-limit";
import { createMessageLog } from "@/lib/services/message-service";
import { buildSubscriptionRequiredText, handleOnboarding } from "@/lib/services/onboarding-service";
import { hasUsableSubscription } from "@/lib/services/subscription-service";
import { findOrCreateUserByWaNumber } from "@/lib/services/user-service";
import { parseSentAt } from "./formatters";
import { handleImageMessage } from "./image-handler";
import { badRequest, ok, tooManyRequests, type InboundHandlerResult } from "./result";
import { handleTextMessage } from "./text-handler";

export const processInboundBody = async (body: unknown): Promise<InboundHandlerResult> => {
  const parsedBody = inboundMessageSchema.safeParse(body);
  if (!parsedBody.success) {
    return badRequest({
      replyText: "Payload tidak valid.",
      issues: parsedBody.error.issues
    });
  }

  const payload = parsedBody.data;
  const rateLimit = checkRateLimit(payload.waNumber, env.RATE_LIMIT_MAX, env.RATE_LIMIT_WINDOW_MS);
  if (!rateLimit.allowed) {
    return tooManyRequests({
      replyText: `Terlalu banyak request. Coba lagi dalam ${Math.ceil(
        rateLimit.retryAfterMs / 1000
      )} detik.`
    });
  }

  const userResult = await findOrCreateUserByWaNumber(payload.waNumber);
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
    messageType: payload.messageType,
    text: payload.messageType === "TEXT" ? payload.text : payload.caption
  });
  if (onboardingResult.handled) {
    return ok({ replyText: onboardingResult.replyText });
  }

  const canUseSubscription = await hasUsableSubscription(user.id);
  if (!canUseSubscription) {
    const replyText = await buildSubscriptionRequiredText(user.id);
    return ok({ replyText });
  }

  if (payload.messageType === "TEXT") {
    return handleTextMessage({
      userId: user.id,
      messageId: messageLog.id,
      text: payload.text
    });
  }

  return handleImageMessage({
    userId: user.id,
    messageId: messageLog.id,
    caption: payload.caption,
    imageBase64: payload.imageBase64
  });
};
