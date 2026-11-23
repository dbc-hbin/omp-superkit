interface ModelReference {
  readonly id: string;
  readonly name?: string;
  readonly provider?: string;
  readonly identity?: { readonly logicalId?: string; readonly class?: string };
}
interface TemplateOptions {
  readonly surface: "terminal" | "app";
  readonly selectedTools: readonly string[];
  readonly subagent?: boolean;
}
export function resolvePresetName(model: ModelReference): string | undefined;
export function buildPreset(name: string, options: TemplateOptions): { name: string; prompt: string } | undefined;
export const presetNames: readonly string[];
