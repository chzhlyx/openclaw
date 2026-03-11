import { describe, expect, it } from "vitest";
import type { VoiceSkillManifest } from "./skill-metadata.js";
import { resolveDeterministicVoiceAnswer } from "./voice-skill-executor.js";

describe("voice skill executor", () => {
  it("resolves approved FAQ answers from structured knowledge", () => {
    const skill: VoiceSkillManifest = {
      skillName: "answer_faq",
      skillPath: "/tmp/answer-faq/SKILL.md",
      intentExamples: ["what is your company address"],
      requiredSlots: [],
      optionalSlots: [],
      toolRequired: false,
      missingSlotPrompts: {},
      executionMode: "deterministic",
      escalationPolicy: "on_low_confidence",
      answerMode: "knowledge",
      answerData: {
        faqEntries: [
          {
            id: "FAQ-001",
            title: "Company Address",
            questionExamples: ["What is your company address?", "Where are you located?"],
            answer: "326 Moodie Drive, Ottawa, Ontario, Canada.",
          },
        ],
      },
    };

    expect(
      resolveDeterministicVoiceAnswer({
        skill,
        sourceText: "what is your company address",
        answerKey: "FAQ-001",
      }),
    ).toBe("326 Moodie Drive, Ottawa, Ontario, Canada.");
  });
});
