import { describe, expect, it } from "vitest";
import type { VoiceSkillManifest } from "./skill-metadata.js";
import {
  buildVoiceExecutionConfirmationPrompt,
  executeVoiceToolSkill,
  interpretVoiceExecutionConfirmationReply,
  resolveDeterministicVoiceAnswer,
} from "./voice-skill-executor.js";

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
      slotConstraints: {},
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

  it("builds a confirmation prompt for department email execution", () => {
    const skill: VoiceSkillManifest = {
      skillName: "leave_message",
      skillPath: "/tmp/leave-message/SKILL.md",
      intentExamples: ["i want to leave a message"],
      requiredSlots: ["department", "caller_name", "message", "contact"],
      optionalSlots: [],
      toolRequired: true,
      missingSlotPrompts: {},
      slotConstraints: {},
      waitPrompt: "One moment while I send that message.",
      failurePrompt: "I couldn't send that message right now. Please try again.",
      execution: {
        kind: "department_email",
        requiresConfirmation: true,
        fromHeader: "FortiVoice AI assistant <sender@example.com>",
        routes: {
          sales: "sales@example.com",
          service: "service@example.com",
        },
      },
      executionMode: "deterministic",
      escalationPolicy: "on_low_confidence",
      answerMode: "none",
    };

    expect(
      buildVoiceExecutionConfirmationPrompt({
        skill,
        slots: {
          department: "service",
          caller_name: "John Smith",
          message: "Please call me back.",
          contact: "613-123-4567",
        },
      }),
    ).toContain("Please confirm the message details for the Service department:");
  });

  it("interprets confirmation replies conservatively", () => {
    expect(interpretVoiceExecutionConfirmationReply("yes, send it")).toBe("confirm");
    expect(interpretVoiceExecutionConfirmationReply("cancel that")).toBe("cancel");
    expect(interpretVoiceExecutionConfirmationReply("Tənqid.")).toBe("unclear");
  });

  it("sends department email only after executing himalaya successfully", async () => {
    const skill: VoiceSkillManifest = {
      skillName: "leave_message",
      skillPath: "/tmp/leave-message/SKILL.md",
      intentExamples: ["i want to leave a message"],
      requiredSlots: ["department", "caller_name", "message", "contact"],
      optionalSlots: [],
      toolRequired: true,
      missingSlotPrompts: {},
      slotConstraints: {},
      waitPrompt: "One moment while I send that message.",
      failurePrompt: "I couldn't send that message right now. Please try again.",
      execution: {
        kind: "department_email",
        requiresConfirmation: true,
        fromHeader: "FortiVoice AI assistant <sender@example.com>",
        routes: {
          sales: "sales@example.com",
          service: "service@example.com",
        },
      },
      executionMode: "deterministic",
      escalationPolicy: "on_low_confidence",
      answerMode: "none",
    };

    let command = "";
    let args: string[] = [];
    let stdin = "";
    const result = await executeVoiceToolSkill({
      skill,
      slots: {
        department: "service",
        caller_name: "John Smith",
        message: "Please call me back.",
        contact: "613-123-4567",
      },
      runCommand: async (params) => {
        command = params.command;
        args = params.args;
        stdin = params.stdin;
        return {
          code: 0,
          stdout: "",
          stderr: "",
        };
      },
    });

    expect(command).toBe("himalaya");
    expect(args).toEqual(["template", "send"]);
    expect(stdin).toContain("To: service@example.com");
    expect(stdin).toContain("Message: Please call me back.");
    expect(result).toEqual({
      ok: true,
      speakText:
        "I have sent your message to the Service department. Someone will get back to you at 613-123-4567.",
    });
  });
});
