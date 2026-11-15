import { bestEffortAlert,bestEffortResolve } from "../operationalAlertService.js";
import type { AdminAiError } from "./errors.js";

const identity={type:"ADMIN_AI_PROVIDER_UNAVAILABLE",subsystem:"SYSTEM" as const,entityType:"ADMIN_AI_PROVIDER",entityId:"digitalocean",diagnosticCode:"ADMIN_AI_PROVIDER_UNAVAILABLE"};
const authIdentity={...identity,type:"ADMIN_AI_PROVIDER_AUTH_FAILURE",diagnosticCode:"ADMIN_AI_PROVIDER_AUTH_FAILURE"};
export const adminAiProviderObserver={
 async success(){await Promise.all([bestEffortResolve(identity),bestEffortResolve(authIdentity)]);},
 async failure(error:AdminAiError){
  const auth=error.code==="AUTHENTICATION_ERROR"||error.code==="CONFIGURATION_ERROR";
  const operational=auth||["RATE_LIMITED","TIMEOUT","PROVIDER_UNAVAILABLE","MODEL_UNAVAILABLE","INVALID_RESPONSE","UNKNOWN_PROVIDER_ERROR"].includes(error.code);
  if(!operational)return;
  await bestEffortAlert({...identity,...(auth?authIdentity:{}),severity:auth?"CRITICAL":"WARNING",title:auth?"Admin AI provider authentication requires attention":"Admin AI provider is unavailable",summary:`A terminal Admin AI provider request failed (${error.code}).`,targetRoute:"/admin/settings/ai-assistant/operations",recommendedAction:auth?"Review server-side provider configuration without exposing credentials.":"Review provider health and recent request telemetry before retrying.",diagnosticCode:auth?authIdentity.diagnosticCode:identity.diagnosticCode});
 }
};
