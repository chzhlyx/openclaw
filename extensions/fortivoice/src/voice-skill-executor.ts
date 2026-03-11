import type { VoiceSkillManifest } from "./skill-metadata.js";
import { findBestFaqAnswer } from "./faq-knowledge.js";

export function resolveDeterministicVoiceAnswer(params: {
  skill: VoiceSkillManifest;
  sourceText: string;
  answerKey?: string;
}): string | null {
  if (params.skill.answerMode !== "knowledge") {
    return null;
  }
  const faqEntries = params.skill.answerData?.faqEntries ?? [];
  if (faqEntries.length === 0) {
    return null;
  }
  const selected =
    faqEntries.find((entry) => entry.id === params.answerKey) ??
    findBestFaqAnswer(faqEntries, params.sourceText);
  return selected?.answer ?? null;
}
