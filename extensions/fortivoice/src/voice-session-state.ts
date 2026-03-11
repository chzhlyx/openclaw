import { randomUUID } from "node:crypto";

export type VoiceSessionSnapshot = {
  activeTurnId?: string;
  pendingSkill?: string;
  lastSelectedSkill?: string;
  activeSlot?: string;
  activeSlotPrompt?: string;
  slotMode?: "collecting" | "idle";
  awaitingConfirmation?: boolean;
  pendingSlots: Record<string, string>;
  waitPromptSentForTurn?: string;
};

type VoiceSessionState = VoiceSessionSnapshot & {
  updatedAt: number;
};

const voiceSessionStates = new Map<string, VoiceSessionState>();

function getSessionKey(accountId: string, sessionId: string): string {
  return `${accountId}:${sessionId}`;
}

function cloneSnapshot(state?: VoiceSessionState): VoiceSessionSnapshot {
  return {
    activeTurnId: state?.activeTurnId,
    pendingSkill: state?.pendingSkill,
    lastSelectedSkill: state?.lastSelectedSkill,
    activeSlot: state?.activeSlot,
    activeSlotPrompt: state?.activeSlotPrompt,
    slotMode: state?.slotMode,
    awaitingConfirmation: state?.awaitingConfirmation,
    pendingSlots: { ...(state?.pendingSlots ?? {}) },
    waitPromptSentForTurn: state?.waitPromptSentForTurn,
  };
}

export function getVoiceSessionSnapshot(params: {
  accountId: string;
  sessionId: string;
}): VoiceSessionSnapshot {
  return cloneSnapshot(voiceSessionStates.get(getSessionKey(params.accountId, params.sessionId)));
}

export function startVoiceTurn(params: {
  accountId: string;
  sessionId: string;
}): VoiceSessionSnapshot {
  const key = getSessionKey(params.accountId, params.sessionId);
  const existing = voiceSessionStates.get(key);
  const next: VoiceSessionState = {
    activeTurnId: randomUUID(),
    pendingSkill: existing?.pendingSkill,
    lastSelectedSkill: existing?.lastSelectedSkill,
    activeSlot: existing?.activeSlot,
    activeSlotPrompt: existing?.activeSlotPrompt,
    slotMode: existing?.slotMode,
    awaitingConfirmation: existing?.awaitingConfirmation,
    pendingSlots: { ...(existing?.pendingSlots ?? {}) },
    waitPromptSentForTurn: undefined,
    updatedAt: Date.now(),
  };
  voiceSessionStates.set(key, next);
  return cloneSnapshot(next);
}

export function updateVoiceSessionState(
  params: {
    accountId: string;
    sessionId: string;
  },
  patch: Partial<VoiceSessionSnapshot>,
): VoiceSessionSnapshot {
  const key = getSessionKey(params.accountId, params.sessionId);
  const existing = voiceSessionStates.get(key);
  const has = <K extends keyof VoiceSessionSnapshot>(field: K) =>
    Object.prototype.hasOwnProperty.call(patch, field);
  const next: VoiceSessionState = {
    activeTurnId: has("activeTurnId") ? patch.activeTurnId : existing?.activeTurnId,
    pendingSkill: has("pendingSkill") ? patch.pendingSkill : existing?.pendingSkill,
    lastSelectedSkill: has("lastSelectedSkill")
      ? patch.lastSelectedSkill
      : existing?.lastSelectedSkill,
    activeSlot: has("activeSlot") ? patch.activeSlot : existing?.activeSlot,
    activeSlotPrompt: has("activeSlotPrompt") ? patch.activeSlotPrompt : existing?.activeSlotPrompt,
    slotMode: has("slotMode") ? patch.slotMode : existing?.slotMode,
    awaitingConfirmation: has("awaitingConfirmation")
      ? patch.awaitingConfirmation
      : existing?.awaitingConfirmation,
    pendingSlots: patch.pendingSlots
      ? { ...patch.pendingSlots }
      : { ...(existing?.pendingSlots ?? {}) },
    waitPromptSentForTurn: has("waitPromptSentForTurn")
      ? patch.waitPromptSentForTurn
      : existing?.waitPromptSentForTurn,
    updatedAt: Date.now(),
  };
  voiceSessionStates.set(key, next);
  return cloneSnapshot(next);
}

export function mergeVoiceSessionSlots(
  params: {
    accountId: string;
    sessionId: string;
  },
  slots: Record<string, string>,
): VoiceSessionSnapshot {
  const key = getSessionKey(params.accountId, params.sessionId);
  const existing = voiceSessionStates.get(key);
  const nextSlots = { ...(existing?.pendingSlots ?? {}) };
  for (const [slotName, rawValue] of Object.entries(slots)) {
    const value = String(rawValue ?? "").trim();
    if (!value) {
      continue;
    }
    nextSlots[slotName] = value;
  }
  return updateVoiceSessionState(params, { pendingSlots: nextSlots });
}

export function clearVoiceSessionPendingState(params: {
  accountId: string;
  sessionId: string;
}): VoiceSessionSnapshot {
  return updateVoiceSessionState(params, {
    pendingSkill: undefined,
    activeSlot: undefined,
    activeSlotPrompt: undefined,
    slotMode: "idle",
    awaitingConfirmation: false,
    pendingSlots: {},
    waitPromptSentForTurn: undefined,
  });
}

export function endVoiceSession(params: { accountId: string; sessionId: string }) {
  voiceSessionStates.delete(getSessionKey(params.accountId, params.sessionId));
}
