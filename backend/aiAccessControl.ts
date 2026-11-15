import { getSettingsDomain, patchSettingsDomain } from "./businessSettingsRepository.js";
import type { StaffAuthorizationContext } from "./staffAuthorization.js";

export type AdminAiDenialReason = "ENVIRONMENT_DISABLED" | "GLOBAL_DISABLED" | "PERMISSION_DENIED";
export interface AdminAiAccess {
  environmentEnabled: boolean;
  globalEnabled: boolean;
  hasPermission: boolean;
  effective: boolean;
  denialReason?: AdminAiDenialReason;
}

const enabled = (value: unknown) => String(value).toLowerCase() === "true";
const envEnabled = (value: string | undefined) => value === "true";

export function evaluateAdminAiAccess(input: { environmentEnabled: boolean; globalEnabled: boolean; hasPermission: boolean }): AdminAiAccess {
  const denialReason: AdminAiDenialReason | undefined = !input.environmentEnabled ? "ENVIRONMENT_DISABLED" : !input.globalEnabled ? "GLOBAL_DISABLED" : !input.hasPermission ? "PERMISSION_DENIED" : undefined;
  return { ...input, effective: !denialReason, denialReason };
}

export async function getAiMasterSwitches() {
  const domain = await getSettingsDomain("ai-assistant");
  const value = (key: string) => domain.settings.find((setting) => setting.key === key)?.effectiveValue;
  return { domain, zeusEnabled: enabled(value("zeusEnabled")), adminAiEnabled: enabled(value("adminAiEnabled")) };
}

export async function getAdminAiAccess(context: Pick<StaffAuthorizationContext, "permissions">, environment = process.env) {
  const switches = await getAiMasterSwitches();
  return evaluateAdminAiAccess({ environmentEnabled: envEnabled(environment.ADMIN_AI_ENABLED), globalEnabled: switches.adminAiEnabled, hasPermission: context.permissions.has("admin_ai.use") });
}

export async function getAiAssistantSettingsView(context: Pick<StaffAuthorizationContext, "permissions">, environment = process.env) {
  const switches = await getAiMasterSwitches();
  const adminAi = evaluateAdminAiAccess({ environmentEnabled: envEnabled(environment.ADMIN_AI_ENABLED), globalEnabled: switches.adminAiEnabled, hasPermission: context.permissions.has("admin_ai.use") });
  const zeusEnvironmentEnabled = environment.ZEUS_ENABLED !== "false";
  return { domain: switches.domain.domain, revision: switches.domain.revision, updatedAt: switches.domain.updatedAt, updatedBy: switches.domain.updatedBy, zeus: { environmentEnabled: zeusEnvironmentEnabled, globalEnabled: switches.zeusEnabled, effective: zeusEnvironmentEnabled && switches.zeusEnabled }, adminAi };
}

export async function updateAiAssistantSettings(input: { revision: number; zeusEnabled: boolean; adminAiEnabled: boolean; confirmHighRisk?: boolean }, actor: string) {
  await patchSettingsDomain("ai-assistant", { revision: input.revision, changes: { zeusEnabled: String(input.zeusEnabled), adminAiEnabled: String(input.adminAiEnabled) }, confirmHighRisk: input.confirmHighRisk }, actor);
}

export async function assertAdminAiAccess<T>(context: Pick<StaffAuthorizationContext, "permissions">, invoke: () => Promise<T>, environment = process.env, resolveAccess = getAdminAiAccess): Promise<T> {
  const access = await resolveAccess(context, environment);
  if (!access.effective) throw Object.assign(new Error("Admin AI is not available."), { code: access.denialReason, status: access.denialReason === "PERMISSION_DENIED" ? 403 : 503 });
  return invoke();
}
