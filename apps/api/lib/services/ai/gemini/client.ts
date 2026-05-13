import { env } from "@/lib/env";
import { GeminiRateLimitError } from "@/lib/services/ai/gemini/errors";

const GEMINI_MAX_RETRIES = 3;

const normalizeModelName = (model: string) => model.trim().replace(/^models\//, "");

const isRetryableGeminiStatus = (status: number) => status === 429 || status === 503;

const sleep = async (ms: number) => {
  await new Promise((resolve) => setTimeout(resolve, ms));
};

const getRetryDelayMs = (attempt: number, retryAfterHeader: string | null): number => {
  if (retryAfterHeader) {
    const seconds = Number(retryAfterHeader);
    if (Number.isFinite(seconds) && seconds > 0) {
      return Math.min(10_000, Math.round(seconds * 1000));
    }
  }

  const base = 400 * 2 ** attempt;
  const jitter = Math.floor(Math.random() * 150);
  return Math.min(5_000, base + jitter);
};

const getModelCandidates = (): string[] => {
  const rawCandidates = [
    env.GEMINI_MODEL,
    "gemini-2.0-flash",
    "gemini-2.0-flash-lite",
    "gemini-1.5-flash-latest",
    "gemini-flash-latest"
  ];

  const seen = new Set<string>();
  const result: string[] = [];

  for (const raw of rawCandidates) {
    const normalized = normalizeModelName(raw);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }

  return result;
};

export const callGemini = async (prompt: string): Promise<string> => {
  let lastNotFoundError = "";
  let lastRateLimitError = "";
  const modelCandidates = getModelCandidates();

  for (const model of modelCandidates) {
    for (let attempt = 0; attempt < GEMINI_MAX_RETRIES; attempt += 1) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`;
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: "application/json"
          }
        })
      });

      if (!response.ok) {
        const errorBody = await response.text();
        if (response.status === 404) {
          lastNotFoundError = `${model}: ${errorBody}`;
          break;
        }

        if (isRetryableGeminiStatus(response.status)) {
          lastRateLimitError = `${model}: ${response.status} ${errorBody}`;
          const hasMoreAttempt = attempt < GEMINI_MAX_RETRIES - 1;
          if (hasMoreAttempt) {
            const delayMs = getRetryDelayMs(attempt, response.headers.get("retry-after"));
            await sleep(delayMs);
            continue;
          }

          break;
        }

        throw new Error(`Gemini API error: ${response.status} ${errorBody}`);
      }

      const data = await response.json();
      const text = data?.candidates?.[0]?.content?.parts
        ?.map((part: { text?: string }) => part.text ?? "")
        .join("")
        .trim();

      if (!text) {
        throw new Error("Gemini output is empty");
      }

      return text;
    }
  }

  if (lastRateLimitError) {
    throw new GeminiRateLimitError(
      `Gemini API temporarily unavailable due to quota/rate limit. Last=${lastRateLimitError}`
    );
  }

  throw new Error(
    `Gemini API error: no supported model for generateContent. Tried models=${modelCandidates.join(
      ", "
    )}. Last 404=${lastNotFoundError}`
  );
};
