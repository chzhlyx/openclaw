import { describe, expect, it } from "vitest";
import {
  clearVoiceSessionPendingState,
  getVoiceSessionSnapshot,
  resetVoiceSessionForInterrupt,
  startVoiceTurn,
  updateVoiceSessionState,
} from "./voice-session-state.js";

describe("voice session state", () => {
  it("increments generic branch and clears active skill state on interrupt", () => {
    startVoiceTurn({
      accountId: "acct-interrupt",
      sessionId: "sess-interrupt",
    });
    updateVoiceSessionState(
      {
        accountId: "acct-interrupt",
        sessionId: "sess-interrupt",
      },
      {
        pendingSkill: "leave_message",
        agentOwnedSkill: "leave_message",
        lastSelectedSkill: "leave_message",
        activeSlot: "department",
        activeSlotPrompt: "Should I send this to Sales or Service?",
        slotMode: "collecting",
        pendingSlots: {
          department: "sales",
        },
        waitPromptSentForTurn: "turn-1",
      },
    );

    const snapshot = resetVoiceSessionForInterrupt({
      accountId: "acct-interrupt",
      sessionId: "sess-interrupt",
    });

    expect(snapshot.genericBranch).toBe(1);
    expect(snapshot.pendingSkill).toBeUndefined();
    expect(snapshot.agentOwnedSkill).toBeUndefined();
    expect(snapshot.lastSelectedSkill).toBeUndefined();
    expect(snapshot.activeSlot).toBeUndefined();
    expect(snapshot.slotMode).toBe("idle");
    expect(snapshot.pendingSlots).toEqual({});
    expect(snapshot.waitPromptSentForTurn).toBeUndefined();
  });

  it("preserves generic branch when only clearing pending skill state", () => {
    startVoiceTurn({
      accountId: "acct-clear",
      sessionId: "sess-clear",
    });
    updateVoiceSessionState(
      {
        accountId: "acct-clear",
        sessionId: "sess-clear",
      },
      {
        genericBranch: 2,
        pendingSkill: "leave_message",
        agentOwnedSkill: "leave_message",
        pendingSlots: {
          department: "sales",
        },
      },
    );

    clearVoiceSessionPendingState({
      accountId: "acct-clear",
      sessionId: "sess-clear",
    });

    const snapshot = getVoiceSessionSnapshot({
      accountId: "acct-clear",
      sessionId: "sess-clear",
    });

    expect(snapshot.genericBranch).toBe(2);
    expect(snapshot.pendingSkill).toBeUndefined();
    expect(snapshot.agentOwnedSkill).toBeUndefined();
    expect(snapshot.pendingSlots).toEqual({});
  });
});
