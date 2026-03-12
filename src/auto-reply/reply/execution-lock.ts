import type { ReplyPayload, LockedSkillExecution } from "../types.js";

type ExecutionLockRunMeta = {
  toolMetas?: Array<{ toolName?: string; meta?: string }>;
  lastToolError?: { toolName?: string; meta?: string; error?: string };
};

type ExecutionLockRunResult = {
  payloads?: ReplyPayload[];
  meta: ExecutionLockRunMeta & Record<string, unknown>;
};

function normalizeToolName(name: string): string {
  const normalized = name.trim().toLowerCase();
  return normalized === "bash" ? "exec" : normalized;
}

function normalizeToolList(tools?: string[]): string[] | undefined {
  const values = (tools ?? []).map(normalizeToolName).filter(Boolean);
  return values.length > 0 ? Array.from(new Set(values)) : undefined;
}

function normalizeText(value?: string): string {
  return value?.trim().toLowerCase() ?? "";
}

function formatLockedSkillInstructions(lock: LockedSkillExecution): string {
  const instructions = lock.skillInstructions?.trim();
  if (!instructions) {
    return "";
  }
  const skillPathLine = lock.skillPath?.trim() ? `Source: ${lock.skillPath.trim()}\n` : "";
  return [
    "## Selected Skill Instructions",
    skillPathLine ? skillPathLine.trimEnd() : "",
    "The full instructions for the already-selected skill are included below. Follow them exactly for this run.",
    "Do not wait to call read on the skill file. Treat the following SKILL.md content as authoritative.",
    "",
    "```md",
    instructions,
    "```",
  ]
    .filter(Boolean)
    .join("\n");
}

function looksLikeQuestionOrClarification(text: string): boolean {
  const normalized = normalizeText(text);
  if (!normalized) {
    return true;
  }
  if (normalized.includes("?")) {
    return true;
  }
  return /^(please confirm|confirm|should i|would you like|could you|can you|what |which |where |when |who |how |do you|does |is |are |let me confirm)\b/.test(
    normalized,
  );
}

function hasUserFacingCompletionText(payloads: ReplyPayload[]): boolean {
  return payloads.some((payload) => {
    const text = payload.text?.trim();
    if (!text) {
      return false;
    }
    return !looksLikeQuestionOrClarification(text);
  });
}

export function mergeExecutionLockSystemPrompt(params: {
  extraSystemPrompt?: string;
  executionLock?: LockedSkillExecution;
}): string | undefined {
  const extra = params.extraSystemPrompt?.trim();
  const lock = params.executionLock;
  if (!lock || lock.mode !== "skill_locked") {
    return extra || undefined;
  }

  const allowedTools = normalizeToolList(lock.allowedTools);
  const sections = [
    extra || "",
    [
      "## Locked Skill Execution",
      `The selected skill is already decided: ${lock.skillName}.`,
      "Do not scan or switch to other skills during this run.",
      "Treat the collected slot state in the user prompt as authoritative unless the caller explicitly corrects it.",
      allowedTools?.length ? `Only use these tools in this run: ${allowedTools.join(", ")}.` : "",
      lock.requiredTool
        ? `Before claiming success or completion for this skill, you must successfully use the ${normalizeToolName(lock.requiredTool)} tool in this run.`
        : "",
      lock.waitPrompt
        ? `If you are about to execute a command or tool call that may take time, first tell the caller exactly: "${lock.waitPrompt}".`
        : "",
      lock.waitPrompt
        ? "Keep the wait prompt as a separate assistant turn before the actual execution result."
        : "",
      "Caller-facing replies for voice must be natural spoken language only.",
      "Do not output JSON, YAML, code fences, schemas, field dumps, or structured objects in caller-facing replies unless the caller explicitly asked for them.",
    ]
      .filter(Boolean)
      .join("\n"),
    formatLockedSkillInstructions(lock),
  ]
    .filter(Boolean)
    .join("\n\n")
    .trim();

  return sections || undefined;
}

export function normalizeExecutionLockAllowedTools(
  executionLock?: LockedSkillExecution,
): string[] | undefined {
  if (!executionLock || executionLock.mode !== "skill_locked") {
    return undefined;
  }
  return normalizeToolList(executionLock.allowedTools);
}

export function guardExecutionLockedResult(params: {
  executionLock?: LockedSkillExecution;
  result: ExecutionLockRunResult;
}): ExecutionLockRunResult;
export function guardExecutionLockedResult<T extends ExecutionLockRunResult>(params: {
  executionLock?: LockedSkillExecution;
  result: T;
}): T;
export function guardExecutionLockedResult<T extends ExecutionLockRunResult>(params: {
  executionLock?: LockedSkillExecution;
  result: T;
}): T {
  const lock = params.executionLock;
  if (!lock?.requiredTool || lock.mode !== "skill_locked") {
    return params.result;
  }

  const requiredTool = normalizeToolName(lock.requiredTool);
  const usedRequiredTool =
    params.result.meta.toolMetas?.some(
      (entry) => normalizeToolName(entry.toolName ?? "") === requiredTool,
    ) ?? false;
  if (usedRequiredTool) {
    return params.result;
  }

  const payloads = params.result.payloads ?? [];
  if (!hasUserFacingCompletionText(payloads)) {
    return params.result;
  }

  const failureText =
    lock.failureReplyText?.trim() ||
    "I couldn't complete that request right now. Please try again.";

  return {
    ...params.result,
    payloads: failureText ? [{ text: failureText }] : [],
  };
}
