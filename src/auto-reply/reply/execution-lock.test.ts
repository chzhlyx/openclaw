import { describe, expect, it } from "vitest";
import { guardExecutionLockedResult, mergeExecutionLockSystemPrompt } from "./execution-lock.js";

describe("execution lock", () => {
  const lock = {
    mode: "skill_locked" as const,
    skillName: "leave_message",
    skillPath: "/tmp/leave-message/SKILL.md",
    skillInstructions:
      "# leave_message\n\n1. Confirm details.\n2. Run `himalaya template send` with exec.\n",
    allowedTools: ["read", "exec", "process"],
    requiredTool: "exec",
    waitPrompt: "One moment while I send that message.",
    failureReplyText: "I couldn't send that message right now. Please try again.",
  };

  it("builds a locked-skill system prompt section", () => {
    const prompt = mergeExecutionLockSystemPrompt({
      extraSystemPrompt: "Existing system note.",
      executionLock: lock,
    });

    expect(prompt).toContain("The selected skill is already decided: leave_message.");
    expect(prompt).toContain("Only use these tools in this run: read, exec, process.");
    expect(prompt).toContain("Before claiming success or completion");
    expect(prompt).toContain("## Selected Skill Instructions");
    expect(prompt).toContain("Run `himalaya template send` with exec.");
    expect(prompt).toContain("Existing system note.");
  });

  it("preserves clarification turns without the required tool call", () => {
    const result = guardExecutionLockedResult({
      executionLock: lock,
      result: {
        payloads: [{ text: "Please confirm the message details. Should I send it now?" }],
        meta: { toolMetas: [] },
      },
    });

    expect(result.payloads?.[0]?.text).toContain("Should I send it now?");
  });

  it("replaces a completion reply when the required tool was never called", () => {
    const result = guardExecutionLockedResult({
      executionLock: lock,
      result: {
        payloads: [{ text: "I have sent your message to the Sales department." }],
        meta: { toolMetas: [] },
      },
    });

    expect(result.payloads).toEqual([
      { text: "I couldn't send that message right now. Please try again." },
    ]);
  });

  it("keeps the reply when the required tool was called", () => {
    const result = guardExecutionLockedResult({
      executionLock: lock,
      result: {
        payloads: [{ text: "I have sent your message to the Sales department." }],
        meta: { toolMetas: [{ toolName: "exec" }] },
      },
    });

    expect(result.payloads?.[0]?.text).toBe("I have sent your message to the Sales department.");
  });
});
