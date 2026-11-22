interface ModelReference { readonly id: string; readonly name?: string; readonly provider?: string }
interface TemplateOptions { readonly surface: "terminal" | "app"; readonly selectedTools: readonly string[] }
export function resolvePresetName(model: ModelReference): string | undefined;
export function buildPreset(name: string, options: TemplateOptions): { name: string; prompt: string } | undefined;
export const presetNames: readonly string[];
export const ASYNC_DEFAULT: string;
export const TURN_END_IS_WAIT: string;
export const MONITOR_CONDITIONS: string;
