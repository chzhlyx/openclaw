import { describe, expect, it } from "vitest";
import {
  buildFortivoiceAgentHandoffInput,
  buildVoiceFailureFallback,
  shouldEmitWaitPrompt,
} from "./monitor.js";

describe("fortivoice monitor", () => {
  it("includes active skill and collected slots in fallback handoff input", () => {
    const handoff = buildFortivoiceAgentHandoffInput({
      latestUserText: "613-555-0100",
      activeSkill: "leave_message",
      waitPrompt: "One moment while I send that message.",
      toolRequired: true,
      collectedSlots: {
        department: "sales",
        caller_name: "John Smith",
        message: "Please call me back about pricing.",
      },
    });

    expect(handoff).toContain("Active skill: leave_message");
    expect(handoff).toContain("Execution wait prompt: One moment while I send that message.");
    expect(handoff).toContain("- department: sales");
    expect(handoff).toContain("- caller_name: John Smith");
    expect(handoff).toContain("Latest caller utterance:");
    expect(handoff).toContain("613-555-0100");
    expect(handoff).toContain(
      "This skill requires real command or tool execution. Do not claim completion or success unless you actually execute the required command/tool and observe success in this turn.",
    );
    expect(handoff).toContain(
      'If you are about to execute a command or tool call that may take time, first tell the caller: "One moment while I send that message.".',
    );
    expect(handoff).toContain(
      "Do not bundle the wait prompt together with the final result. Say the wait prompt first, then execute, then return the final result separately.",
    );
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
        skillInstructions: "# weather",
        intentExamples: [],
        requiredSlots: ["city"],
        optionalSlots: [],
        toolRequired: true,
        missingSlotPrompts: { city: "What city should I check?" },
        slotConstraints: {},
        waitPrompt: "One moment while I check that.",
        failurePrompt: "I couldn't retrieve the weather right now. Please try again.",
        allowedTools: ["read", "exec", "process"],
        requiredTool: "exec",
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
          skillInstructions: "# leave_message",
          intentExamples: [],
          requiredSlots: ["department", "caller_name", "message", "contact"],
          optionalSlots: [],
          toolRequired: true,
          missingSlotPrompts: { department: "Should I send this to Sales or Service?" },
          slotConstraints: {},
          waitPrompt: "One moment while I send that message.",
          allowedTools: ["read", "exec", "process"],
          requiredTool: "exec",
          executionMode: "agentic",
          escalationPolicy: "always",
          answerMode: "none",
        },
      }),
    ).toBe(false);
  });

  it("emits the wait prompt for agent-owned skills at slow-path handoff", () => {
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
          skillInstructions: "# weather",
          intentExamples: [],
          requiredSlots: ["city"],
          optionalSlots: [],
          toolRequired: true,
          missingSlotPrompts: { city: "What city should I check?" },
          slotConstraints: {},
          waitPrompt: "One moment while I check that.",
          allowedTools: ["read", "exec", "process"],
          requiredTool: "exec",
          executionMode: "agentic",
          escalationPolicy: "on_low_confidence",
          answerMode: "none",
        },
      }),
    ).toBe(true);
  });

  it("emits the wait prompt for deterministic tool execution when ready", () => {
    expect(
      shouldEmitWaitPrompt({
        decision: {
          decision: "wait_and_execute",
          skill: "weather",
          confidence: 0.95,
          slots: { city: "Ottawa" },
          missingSlots: [],
          toolRequired: true,
          executionMode: "deterministic",
          escalationPolicy: "on_low_confidence",
          reason: "ready",
        },
        skill: {
          skillName: "weather",
          skillPath: "/tmp/weather/SKILL.md",
          skillInstructions: "# weather",
          intentExamples: [],
          requiredSlots: ["city"],
          optionalSlots: [],
          toolRequired: true,
          missingSlotPrompts: { city: "What city should I check?" },
          slotConstraints: {},
          waitPrompt: "One moment while I check that.",
          allowedTools: ["read", "exec", "process"],
          requiredTool: "exec",
          executionMode: "deterministic",
          escalationPolicy: "on_low_confidence",
          answerMode: "none",
        },
      }),
    ).toBe(true);
  });
});
