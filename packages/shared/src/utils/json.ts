export const extractJsonObject = (value: string): unknown => {
  const trimmed = value.trim();
  const withoutFence = trimmed
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/, "");

  const firstBrace = withoutFence.indexOf("{");
  const lastBrace = withoutFence.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new Error("JSON object not found in model output");
  }

  const jsonText = withoutFence.slice(firstBrace, lastBrace + 1);
  return JSON.parse(jsonText);
};
