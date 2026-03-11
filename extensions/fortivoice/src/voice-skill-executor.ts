import { spawn } from "node:child_process";
import { once } from "node:events";
import type { VoiceExecutionConfig, VoiceSkillManifest } from "./skill-metadata.js";
import { findBestFaqAnswer } from "./faq-knowledge.js";

type VoiceToolExecutionSuccess = {
  ok: true;
  speakText: string;
};

type VoiceToolExecutionFailure = {
  ok: false;
  speakText: string;
};

export type VoiceToolExecutionResult = VoiceToolExecutionSuccess | VoiceToolExecutionFailure;

type CommandResult = {
  code: number;
  stdout: string;
  stderr: string;
};

export type CommandRunner = (params: {
  command: string;
  args: string[];
  stdin: string;
}) => Promise<CommandResult>;

function normalizeSlotValue(slots: Record<string, string>, key: string): string {
  return String(slots[key] ?? "").trim();
}

function capitalize(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  return `${trimmed[0]?.toUpperCase() ?? ""}${trimmed.slice(1)}`;
}

function sanitizeHeaderValue(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

function splitContact(contact: string): { phone?: string; email?: string } {
  const normalized = contact.trim();
  if (!normalized) {
    return {};
  }
  if (normalized.includes("@")) {
    return { email: normalized };
  }
  return { phone: normalized };
}

export function hasExecutableVoiceAction(skill: VoiceSkillManifest): boolean {
  return Boolean(skill.execution);
}

function buildDepartmentEmailConfirmationPrompt(
  execution: VoiceExecutionConfig,
  slots: Record<string, string>,
): string {
  const department = normalizeSlotValue(slots, "department").toLowerCase();
  const departmentLabel = capitalize(department);
  const callerName = normalizeSlotValue(slots, "caller_name");
  const message = normalizeSlotValue(slots, "message");
  const contact = normalizeSlotValue(slots, "contact");

  return [
    `Please confirm the message details for the ${departmentLabel} department:`,
    `- Name: ${callerName}`,
    `- Message: "${message}"`,
    `- Contact phone number: ${contact}`,
    "",
    "Is this correct? Should I send the message now?",
  ].join("\n");
}

export function buildVoiceExecutionConfirmationPrompt(params: {
  skill: VoiceSkillManifest;
  slots: Record<string, string>;
}): string | null {
  const execution = params.skill.execution;
  if (!execution?.requiresConfirmation) {
    return null;
  }
  if (execution.kind === "department_email") {
    return buildDepartmentEmailConfirmationPrompt(execution, params.slots);
  }
  return null;
}

export function interpretVoiceExecutionConfirmationReply(
  text: string,
): "confirm" | "cancel" | "unclear" {
  const normalized = text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .trim();
  if (!normalized) {
    return "unclear";
  }

  const confirmPatterns = [
    /^yes\b/,
    /^correct\b/,
    /^that s correct\b/,
    /^send\b/,
    /^send it\b/,
    /^go ahead\b/,
    /^please do\b/,
    /^confirm(?:ed)?\b/,
    /^that s right\b/,
  ];
  if (confirmPatterns.some((pattern) => pattern.test(normalized))) {
    return "confirm";
  }

  const cancelPatterns = [/^no\b/, /^cancel\b/, /^stop\b/, /^incorrect\b/, /^that s wrong\b/];
  if (cancelPatterns.some((pattern) => pattern.test(normalized))) {
    return "cancel";
  }

  return "unclear";
}

async function defaultCommandRunner(params: {
  command: string;
  args: string[];
  stdin: string;
}): Promise<CommandResult> {
  const child = spawn(params.command, params.args, {
    stdio: ["pipe", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  child.stdin.write(params.stdin);
  child.stdin.end();
  const [code] = (await once(child, "close")) as [number];
  return {
    code: Number(code ?? 1),
    stdout,
    stderr,
  };
}

function buildDepartmentEmailMessage(params: {
  execution: VoiceExecutionConfig;
  slots: Record<string, string>;
}): { to: string; stdin: string; successPrompt: string } {
  const department = normalizeSlotValue(params.slots, "department").toLowerCase();
  const to = params.execution.routes[department];
  if (!to) {
    throw new Error(`no route configured for department '${department}'`);
  }

  const callerName = normalizeSlotValue(params.slots, "caller_name");
  const message = normalizeSlotValue(params.slots, "message");
  const contact = normalizeSlotValue(params.slots, "contact");
  const company = normalizeSlotValue(params.slots, "company");
  const preferredCallbackTime = normalizeSlotValue(params.slots, "preferred_callback_time");
  const { phone, email } = splitContact(contact);
  const departmentLabel = capitalize(department);
  const subject = `[OpenClaw Caller Message][${departmentLabel}] ${sanitizeHeaderValue(callerName)}`;
  const stdin = [
    `From: ${sanitizeHeaderValue(params.execution.fromHeader)}`,
    `To: ${sanitizeHeaderValue(to)}`,
    `Subject: ${sanitizeHeaderValue(subject)}`,
    "",
    `Department: ${departmentLabel}`,
    `Caller name: ${callerName}`,
    `Phone: ${phone ?? ""}`,
    `Email: ${email ?? ""}`,
    `Company: ${company}`,
    `Preferred callback time: ${preferredCallbackTime}`,
    `Message: ${message}`,
    "",
  ].join("\n");
  const successPrompt = contact
    ? `I have sent your message to the ${departmentLabel} department. Someone will get back to you at ${contact}.`
    : `I have sent your message to the ${departmentLabel} department.`;

  return {
    to,
    stdin,
    successPrompt,
  };
}

export async function executeVoiceToolSkill(params: {
  skill: VoiceSkillManifest;
  slots: Record<string, string>;
  runCommand?: CommandRunner;
}): Promise<VoiceToolExecutionResult> {
  const execution = params.skill.execution;
  if (!execution) {
    return {
      ok: false,
      speakText:
        params.skill.failurePrompt?.trim() ||
        "I couldn't complete that request right now. Please try again.",
    };
  }

  const runCommand = params.runCommand ?? defaultCommandRunner;

  try {
    let message: { to: string; stdin: string; successPrompt: string };
    switch (execution.kind) {
      case "department_email":
        message = buildDepartmentEmailMessage({
          execution,
          slots: params.slots,
        });
        break;
      default:
        throw new Error(`unsupported voice execution kind '${String(execution.kind)}'`);
    }
    const result = await runCommand({
      command: "himalaya",
      args: ["template", "send"],
      stdin: message.stdin,
    });
    if (result.code !== 0) {
      throw new Error(result.stderr.trim() || result.stdout.trim() || `exit code ${result.code}`);
    }
    return {
      ok: true,
      speakText: message.successPrompt,
    };
  } catch {
    return {
      ok: false,
      speakText:
        params.skill.failurePrompt?.trim() ||
        "I couldn't complete that request right now. Please try again.",
    };
  }
}

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
