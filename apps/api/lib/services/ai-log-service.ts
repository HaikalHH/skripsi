import { AnalysisType } from "@prisma/client";
import { prisma } from "../prisma";

export const createAIAnalysisLog = async (params: {
  userId: string;
  messageId?: string;
  analysisType: AnalysisType;
  payload: unknown;
}) =>
  prisma.aIAnalysisLog.create({
    data: {
      userId: params.userId,
      messageId: params.messageId,
      analysisType: params.analysisType,
      payloadJson: params.payload as object
    }
  });
