import { expect, test } from "bun:test";
import { resolvePresetName } from "../prompts/models/catalog.js";

test.each([
  ["anthropic/claude-opus-4.6", "claude-opus-4-6"],
  ["claude-opus-4.7", "claude-opus-4-7"],
  ["proxy/v2:tenant@anthropic/claude-opus-4.8", "claude-opus-4-8"],
  ["EU.ANTHROPIC.CLAUDE_OPUS_4_6_V1:0", "claude-opus-4-6"],
  ["[Gateway] Claude.Opus 4.7 @default", "claude-opus-4-7"],
  ["anthropic/claude-opus-4-8:thinking:high", "claude-opus-4-8"],
  ["opus-4.5@20251101", "claude-opus-4-5"],
  ["claude-opus-4.6-2026-05-07", "claude-opus-4-6"],
  ["anthropic/claude-opus-5.5-fast", "claude-opus-5-5"],
  ["claude-opus-5-20261109", "claude-opus-5"],
  ["claude-opus-5.50", "claude-opus-5"],
  ["anthropic/claude-mythos-5_2@20261109", "claude-fable-5-2"],
  ["anthropic/claude-fable-5.10", "claude-fable-5"],
  ["CLAUDE_SONNET_5_5", "claude-sonnet-5-5"],
  ["anthropic/claude-haiku-5.5-1m", "claude-haiku-5-5"],
] as const)("routes Claude release alias %s to %s", (id, preset) => {
  expect(resolvePresetName({ id })).toBe(preset);
});

test.each([
  "octopus-5-5",
  "tenant/notclaude-opus-4.8",
  "unrelated-opus-4.8",
  "tenant/not-duo-chat-opus-4-6",
  "deepseek-r1-distill-claude-opus-5.5",
  "anthropic/claude-opus-4.8-distilled",
  "fable-50",
  "claude-fable-5.2x",
  "claude-opus-4.60",
  "claude-opus-4-8-1",
  "anthropic/claude-sonnet-4.6",
  "claude-sonnet-5.50",
  "anthropic/claude-haiku-4.5-20251001",
  "claude-haiku-5.50",
])("does not route unrelated or unsupported alias %s", id => {
  expect(resolvePresetName({ id })).toBeUndefined();
});

test.each([
  // Venice's compact IDs and GitLab Duo's dashed IDs.
  ["openai-gpt-52", "gpt-5.2"],
  ["openai-gpt-52-codex", "gpt-5.2"],
  ["openai-gpt-53-codex", "gpt-5.3-codex"],
  ["openai-gpt-54", "gpt-5.4"],
  ["openai-gpt-54-mini", "gpt-5.4"],
  ["openai-gpt-54-pro", "gpt-5.4"],
  ["openai-gpt-55", "gpt-5.5"],
  ["openai-gpt-55-pro", "gpt-5.5"],
  ["openai-gpt-56-luna", "gpt-5.6"],
  ["openai-gpt-56-luna-pro", "gpt-5.6"],
  ["openai-gpt-56-sol", "gpt-5.6"],
  ["openai-gpt-56-sol-pro", "gpt-5.6"],
  ["openai-gpt-56-terra", "gpt-5.6"],
  ["openai-gpt-56-terra-pro", "gpt-5.6"],
  ["duo-chat-gpt-5-2", "gpt-5.2"],
  ["duo-chat-gpt-5-2-codex", "gpt-5.2"],
  ["openai/gpt-5.3-codex-spark", "gpt-5.3-codex"],
  ["global.openai.gpt-5.6-luna", "gpt-5.6"],
  ["openai-codex/gpt-6.1-terra", "gpt-6-astra"],
  ["moonshotai/Kimi-K3-TEE", "kimi-k3"],
  ["k3-256k", "kimi-k3"],
  ["e2ee-kimi-k3-p", "kimi-k3"],
  ["moonshotai/kimi-k3.1-pro:batch", "kimi-k3-1"],
  ["kimi-k3-1-pro-highspeed", "kimi-k3-1"],
  ["k3p1", "kimi-k3-1"],
  ["kimi-k3-2026-05-19", "kimi-k3"],
] as const)("routes the GPT or Kimi alias %s to %s", (id, preset) => {
  expect(resolvePresetName({ id })).toBe(preset);
});

test.each([
  "gpt-5",
  "gpt-5.1-codex",
  "duo-chat-gpt-5-1",
  "gpt-5.20",
  "gpt-5.60",
  "openai-gpt-560-luna",
  "openai/gpt-5.6x",
  "notgpt-5.6",
  "tenant/unrelated-gpt-5.6",
  "gpt-5.7",
  "kimi-k3.10",
  "kimi-k3.1.2",
  "moonshotai/kimi-k3.2",
  "kimi-k3-10-pro",
  "kimi-k3p2",
  "k3.2",
  "krea/k3-edit",
])("leaves GPT or Kimi lookalike or unprofiled release %s to the host", id => {
  expect(resolvePresetName({ id })).toBeUndefined();
});

type ModelReference = Parameters<typeof resolvePresetName>[0];

test.each([
  ["opaque ID with a display name", { id: "deployment-42", name: "Claude Opus 4.8 Fast" }, "claude-opus-4-8"],
  ["family-only display name", { id: "deployment-42", name: "Opus 4.6" }, "claude-opus-4-6"],
  ["logical ID over a conflicting label", {
    id: "deployment-42", identity: { logicalId: "anthropic/claude-mythos-5.2" }, name: "Claude Opus 4.8",
  }, "claude-fable-5-2"],
  ["logical ID over a label from another family", {
    id: "deployment-42", identity: { logicalId: "claude-opus-4-7" }, name: "GPT 6.2 Sol",
  }, "claude-opus-4-7"],
  ["concrete ID over both metadata aliases", {
    id: "claude-opus-5.50", identity: { logicalId: "claude-opus-5.5" }, name: "GPT 6.2 Sol",
  }, "claude-opus-5"],
  ["another concrete model over Claude aliases", {
    id: "grok-4.7", identity: { logicalId: "claude-opus-4.8" }, name: "Claude Opus 4.8",
  }, "grok-4.7"],
  ["unsupported concrete Haiku release over supported metadata", {
    id: "claude-haiku-4-5", identity: { logicalId: "claude-haiku-5-5" }, name: "Claude Haiku 5.5",
  }, undefined],
  ["unsupported logical release over a supported label", {
    id: "deployment-42", identity: { logicalId: "claude-haiku-4.5" }, name: "Claude Haiku 5.5",
  }, undefined],
  ["distilled ID despite canonical-looking metadata", {
    id: "distilled/claude-opus-4.8", identity: { logicalId: "claude-opus-4.8" }, name: "Claude Opus 4.8",
  }, undefined],
  ["known unrelated lineage with a Claude-like label", {
    id: "deployment-42", identity: { class: "meta" }, name: "Claude Opus 4.8",
  }, undefined],
  ["malformed family-first release despite a canonical display name", {
    id: "claude-opus-4-8-1", name: "Claude Opus 4.8",
  }, undefined],
  ["malformed family-first release despite a supported logical identity", {
    id: "claude-opus-4-8-1", identity: { class: "anthropic", logicalId: "claude-opus-4-8" },
  }, undefined],
  ["GitLab Duo's Opus 4.5 deployment", {
    id: "duo-chat-opus-4-5", provider: "gitlab-duo", name: "Duo Chat Opus 4.5", identity: { class: "unknown" },
  }, "claude-opus-4-5"],
  ["GitLab Duo's Opus 4.6 deployment", {
    id: "duo-chat-opus-4-6", provider: "gitlab-duo", name: "Duo Chat Opus 4.6", identity: { class: "unknown" },
  }, "claude-opus-4-6"],
  ["GitLab Duo's unsupported Sonnet release despite a supported label", {
    id: "duo-chat-sonnet-4-5", provider: "gitlab-duo", name: "Claude Sonnet 5.5",
  }, undefined],
  ["Duo Chat ID on a different provider despite a Claude label", {
    id: "duo-chat-opus-4-6", provider: "custom", name: "Claude Opus 4.6",
  }, undefined],
  ["Venice's compact Opus 4.5 ID corroborated by its catalog label", {
    id: "claude-opus-45", provider: "venice", name: "Claude Opus 4.5", identity: { class: "anthropic" },
  }, "claude-opus-4-5"],
  ["Venice's compact ID corroborated by its canonical logical ID", {
    id: "claude-opus-45", provider: "venice", identity: { class: "anthropic", logicalId: "anthropic/claude-opus-4-5" },
  }, "claude-opus-4-5"],
  ["Venice's compact ID without release corroboration", {
    id: "claude-opus-45", provider: "venice", identity: { class: "anthropic" },
  }, undefined],
  ["Venice's compact ID with a conflicting logical release despite a matching label", {
    id: "claude-opus-45", provider: "venice", name: "Claude Opus 4.5",
    identity: { class: "anthropic", logicalId: "claude-opus-4-6" },
  }, undefined],
  ["Venice's compact ID with a same-version label from another Claude family", {
    id: "claude-opus-55", provider: "venice", name: "Claude Sonnet 5.5",
  }, undefined],
  ["Venice's compact ID with a contradictory lineage", {
    id: "claude-opus-45", provider: "venice", name: "Claude Opus 4.5", identity: { class: "meta" },
  }, undefined],
  ["compact ID on an unrelated provider despite matching metadata", {
    id: "claude-opus-45", provider: "custom", name: "Claude Opus 4.5",
  }, undefined],
  ["Venice's longer numeric release despite a supported label", {
    id: "claude-opus-450", provider: "venice", name: "Claude Opus 4.5",
  }, undefined],
  ["Cursor's version-first Opus 4.5 High ID", {
    id: "claude-4.5-opus-high", provider: "cursor", name: "Claude Opus 4.5",
    identity: { class: "anthropic", logicalId: "claude-4.5-opus" },
  }, "claude-opus-4-5"],
  ["Cursor's version-first Opus 4.6 High ID", {
    id: "claude-4.6-opus-high", provider: "cursor", name: "Claude Opus 4.6 1M",
    identity: { class: "anthropic", logicalId: "claude-4.6-opus" },
  }, "claude-opus-4-6"],
  ["Cursor's version-first Opus 4.6 Max ID", {
    id: "claude-4.6-opus-max", provider: "cursor", name: "Claude Opus 4.6 1M Max",
    identity: { class: "anthropic", logicalId: "claude-4.6-opus" },
  }, "claude-opus-4-6"],
  ["version-first canonical Claude ID over a conflicting label", {
    id: "deployment-42", identity: { class: "anthropic", logicalId: "claude-4.6-opus" }, name: "Claude Opus 4.8",
  }, "claude-opus-4-6"],
  ["unsupported version-first Claude release despite a supported label", {
    id: "anthropic/claude-4.60-opus-high", name: "Claude Opus 4.6",
  }, undefined],
  ["snapshot encoded in the Ollama Cloud DeepSeek ID", {
    id: "deepseek-v4-flash:0731", provider: "ollama-cloud", identity: { class: "deepseek" },
  }, "deepseek-v4-flash-0731"],
  ["Kilo's discounted DeepSeek V4 Flash snapshot", {
    id: "deepseek/deepseek-v4-flash:discounted", provider: "kilo", name: "DeepSeek V4 Flash 0731 (lowest price)",
    identity: { class: "deepseek" },
  }, "deepseek-v4-flash-0731"],
  ["ZenMux's free DeepSeek V4 Flash snapshot", {
    id: "deepseek/deepseek-v4-flash-free", provider: "zenmux", name: "DeepSeek V4 Flash 0731 (Free)",
    identity: { class: "deepseek" },
  }, "deepseek-v4-flash-0731"],
  ["concrete DeepSeek V4.1 over older snapshot label", {
    id: "deepseek-v4.1-flash", name: "DeepSeek V4 Flash 0731",
  }, "deepseek-v4-1-flash"],
  ["DeepSeek V4 Flash with a conflicting logical alias and snapshot label", {
    id: "deepseek-v4-flash-free", identity: { logicalId: "meta/llama-4" }, name: "DeepSeek V4 Flash 0731",
  }, "deepseek-v4-flash"],
  ["DeepSeek V4 Flash with a distilled snapshot label", {
    id: "deepseek-v4-flash-free", name: "DeepSeek V4 Flash 0731 Distilled",
  }, "deepseek-v4-flash"],
  ["OrcaCyber's distinct Kimi-based variant", {
    id: "orca/orcacyber-k3.1-pro", provider: "nanogpt", name: "OrcaCyber K3.1 Pro Uncensored", identity: { class: "kimi" },
  }, undefined],
  ["ZenMux's versioned label for an opaque ID", {
    id: "openai/chat-latest", provider: "zenmux", identity: { class: "openai" }, name: "Chat Latest (GPT-5.5 Instant)",
  }, "gpt-5.5"],
  ["parenthetical GPT reference unrelated to the deployed alias", {
    id: "openai/chat-latest", name: "Unrelated (GPT-5.5 Instant)",
  }, undefined],
  ["parenthetical GPT reference on an unbranded model", {
    id: "unrelated-model", name: "Unrelated Model (GPT-5.5 Instant)",
  }, undefined],
  ["concrete GPT alias over conflicting logical and display versions", {
    id: "openai/gpt-5.2-codex", identity: { logicalId: "gpt-5.5" }, name: "GPT-6.2 Sol",
  }, "gpt-5.2"],
  ["concrete Kimi alias over a newer display version", {
    id: "kimi-k3-fast", name: "Kimi K3.1 Pro",
  }, "kimi-k3"],
  ["known other-family ID over a GPT-like label", {
    id: "grok-4.7", name: "GPT-5.6 Luna",
  }, "grok-4.7"],
  ["concrete unsupported GPT version despite both metadata sources", {
    id: "gpt-5.60", identity: { logicalId: "gpt-5.6" }, name: "GPT-5.6 Luna",
  }, undefined],
  ["legacy GPT-5.1 despite a newer display version", {
    id: "gpt-5.1-codex", name: "GPT-5.2 Codex",
  }, undefined],
  ["concrete unsupported Kimi version despite a supported display name", {
    id: "kimi-k3.10", name: "Kimi K3.1 Pro",
  }, undefined],
  ["GPT logical ID over a conflicting display version", {
    id: "deployment-42", identity: { class: "openai", logicalId: "openai/gpt-5.5" }, name: "GPT-5.6 Sol",
  }, "gpt-5.5"],
  ["unsupported GPT logical ID over a supported label", {
    id: "deployment-42", identity: { class: "openai", logicalId: "gpt-5.20" }, name: "GPT-5.2",
  }, undefined],
  ["unsupported unrelated logical ID over a GPT-like label", {
    id: "deployment-42", identity: { logicalId: "meta/llama-4" }, name: "GPT-5.5",
  }, undefined],
  ["distilled logical ID over a GPT-like label", {
    id: "deployment-42", identity: { logicalId: "deepseek-r1-distill-gpt-5.5" }, name: "GPT-5.5",
  }, undefined],
  ["distilled concrete ID despite canonical-looking metadata", {
    id: "deepseek-r1-distill-gpt-5.5", identity: { logicalId: "gpt-5.5" }, name: "GPT-5.5",
  }, undefined],
  ["known unrelated lineage with a GPT-like label", {
    id: "deployment-42", identity: { class: "meta" }, name: "GPT-5.6 Luna",
  }, undefined],
] satisfies readonly (readonly [string, ModelReference, string | undefined])[])("resolves precedence for %s", (_case, model, preset) => {
  expect(resolvePresetName(model)).toBe(preset);
});
