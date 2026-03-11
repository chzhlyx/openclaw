import { describe, expect, it } from "vitest";
import {
  buildFortivoiceAgentHandoffInput,
  buildVoiceFailureFallback,
  inferFortivoiceCollectActionFromPlainReply,
  shouldEmitWaitPrompt,
} from "./monitor.js";

describe("fortivoice monitor", () => {
  it("infers collect(city) when weather follow-up asks for city", () => {
    const action = inferFortivoiceCollectActionFromPlainReply({
      latestUserText: "What is the weather today?",
      assistantText: "Which city?",
    });

    expect(action).toEqual({
      type: "collect",
      schema: {
        fields: [{ key: "city", type: "string", required: true }],
      },
    });
  });

  it("does not infer collect when prompt is unrelated to weather", () => {
    const action = inferFortivoiceCollectActionFromPlainReply({
      latestUserText: "Can you summarize my notes?",
      assistantText: "Which city?",
    });

    expect(action).toBeNull();
  });

  it("does not infer collect when assistant is not asking for city", () => {
    const action = inferFortivoiceCollectActionFromPlainReply({
      latestUserText: "What is the weather today?",
      assistantText: "The weather is sunny right now.",
    });

    expect(action).toBeNull();
  });

  it("includes active skill and collected slots in fallback handoff input", () => {
    const handoff = buildFortivoiceAgentHandoffInput({
      latestUserText: "613-555-0100",
      activeSkill: "leave_message",
      collectedSlots: {
        department: "sales",
        caller_name: "John Smith",
        message: "Please call me back about pricing.",
      },
    });

    expect(handoff).toContain("Active skill: leave_message");
    expect(handoff).toContain("- department: sales");
    expect(handoff).toContain("- caller_name: John Smith");
    expect(handoff).toContain("Latest caller utterance:");
    expect(handoff).toContain("613-555-0100");
  });

  it("returns latest user text unchanged when no slot context exists", () => {
    const handoff = buildFortivoiceAgentHandoffInput({
      latestUserText: "I need help",
      collectedSlots: {},
    });

    expect(handoff).toBe("I need help");
  });

  it("uses the skill failure prompt when the fallback agent returns no actions", () => {
    const actions = buildVoiceFailureFallback({
      requestId: "req-1",
      skill: {
        skillName: "weather",
        skillPath: "/tmp/weather/SKILL.md",
        intentExamples: [],
        requiredSlots: ["city"],
        optionalSlots: [],
        toolRequired: true,
        missingSlotPrompts: { city: "What city should I check?" },
        slotConstraints: {},
        waitPrompt: "One moment while I check that.",
        failurePrompt: "I couldn't retrieve the weather right now. Please try again.",
        executionMode: "agentic",
        escalationPolicy: "on_low_confidence",
        answerMode: "none",
      },
    });

    expect(actions).toEqual([
      {
        type: "speak",
        message_id: "req-1-1",
        text: "I couldn't retrieve the weather right now. Please try again.",
        barge_in: true,
      },
    ]);
  });

  it("does not emit the wait prompt when fallback still has missing slots", () => {
    expect(
      shouldEmitWaitPrompt({
        decision: {
          decision: "fallback_agent",
          skill: "leave_message",
          confidence: 0.6,
          slots: {},
          missingSlots: ["department", "message"],
          toolRequired: true,
          executionMode: "agentic",
          escalationPolicy: "always",
          reason: "low_confidence",
        },
        skill: {
          skillName: "leave_message",
          skillPath: "/tmp/leave-message/SKILL.md",
          intentExamples: [],
          requiredSlots: ["department", "caller_name", "message", "contact"],
          optionalSlots: [],
          toolRequired: true,
          missingSlotPrompts: { department: "Should I send this to Sales or Service?" },
          slotConstraints: {},
          waitPrompt: "One moment while I take that message.",
          executionMode: "agentic",
          escalationPolicy: "always",
          answerMode: "none",
        },
      }),
    ).toBe(false);
  });

  it("emits the wait prompt when execution is ready", () => {
    expect(
      shouldEmitWaitPrompt({
        decision: {
          decision: "wait_and_execute",
          skill: "weather",
          confidence: 0.95,
          slots: { city: "Ottawa" },
          missingSlots: [],
          toolRequired: true,
          executionMode: "agentic",
          escalationPolicy: "on_low_confidence",
          reason: "ready",
        },
        skill: {
          skillName: "weather",
          skillPath: "/tmp/weather/SKILL.md",
          intentExamples: [],
          requiredSlots: ["city"],
          optionalSlots: [],
          toolRequired: true,
          missingSlotPrompts: { city: "What city should I check?" },
          slotConstraints: {},
          waitPrompt: "One moment while I check that.",
          executionMode: "agentic",
          escalationPolicy: "on_low_confidence",
          answerMode: "none",
        },
      }),
    ).toBe(true);
  });
});
