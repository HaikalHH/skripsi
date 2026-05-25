import { ADD_MORE_OPTIONS, YES_NO_OPTIONS } from "./answer-options";
import type { OnboardingPrompt } from "./question-types";

const shouldRenderPromptOptions = (prompt: OnboardingPrompt) => {
  if (!prompt.options?.length || prompt.options.length <= 1) return false;
  if (prompt.options === YES_NO_OPTIONS || prompt.options === ADD_MORE_OPTIONS) return false;
  return true;
};

const appendPromptOptions = (lines: string[], prompt: OnboardingPrompt) => {
  const options = prompt.options ?? [];
  lines.push("");
  if (prompt.optionHeading !== null) {
    lines.push(prompt.optionHeading ?? "Pilihan:");
  }
  for (const [index, option] of options.entries()) {
    lines.push(`${index + 1}. ${option.label}`);
  }
};

export const formatPromptForChat = (prompt: OnboardingPrompt) => {
  const lines = [prompt.body];
  if (shouldRenderPromptOptions(prompt)) {
    appendPromptOptions(lines, prompt);
  }
  return lines.join("\n").trim();
};

export const formatPromptForChatBubbles = (prompt: OnboardingPrompt) => {
  const baseBodies =
    prompt.chatBubbleBodies?.map((item) => item.trim()).filter(Boolean) ?? [prompt.body];

  if (!shouldRenderPromptOptions(prompt)) {
    return baseBodies;
  }

  const optionLines: string[] = [];
  appendPromptOptions(optionLines, prompt);

  if (!baseBodies.length) {
    return [optionLines.join("\n").trim()];
  }

  const bubbles = [...baseBodies];
  bubbles[bubbles.length - 1] = `${bubbles.at(-1)}\n${optionLines.join("\n")}`.trim();
  return bubbles;
};
