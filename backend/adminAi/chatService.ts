import { assertAdminAiAccess, getAdminAiAccess, type AdminAiAccess } from "../aiAccessControl.js";
import type { StaffAuthorizationContext } from "../staffAuthorization.js";
import { AdminAiError } from "./errors.js";
import { buildAdminAiSafeContext, modelRoleForContext, type AdminAiContextType, type AdminAiSafeContext } from "./contextual.js";
import {
  appendAdminAiUserTurn,
  attachAdminAiContext,
  completeAdminAiAssistantTurn,
  createAdminAiConversation,
  failAdminAiAssistantTurn,
  getAdminAiConversation,
  getAdminAiTurn,
  listAdminAiContextAttachments,
  listRecentAdminAiMessages,
  retryAdminAiAssistantTurn,
  type AdminAiContextAttachment,
  type AdminAiMessage,
} from "./conversationRepository.js";
import type { AdminAiService } from "./service.js";
import type { AdminAiModelRole } from "./types.js";
import { availableAdminAiTools, prepareAdminAiAction } from "./controlledActions.js";
import { adminAiToolRegistryDto } from "./controlledActions.js";
import { enforceAdminAiRequestPolicy, evaluateAdminAiToolPolicy } from "./policy.js";

export type AdminAiPendingAttachment = { contextType: AdminAiContextType; resourceId: string };

type Dependencies = {
  access: typeof getAdminAiAccess;
  buildContext: typeof buildAdminAiSafeContext;
  requestPolicy?: typeof enforceAdminAiRequestPolicy;
};

const defaultDependencies: Dependencies = { access: getAdminAiAccess, buildContext: buildAdminAiSafeContext };

export class AdminAiChatError extends Error {
  constructor(public code: string, message: string, public status = 400) { super(message); }
}

const validMessageContent = (value: string) => {
  const content = value?.trim();
  if (!content || content.length > 8_000) throw new AdminAiChatError("INVALID_ADMIN_AI_MESSAGE", "Message must be between 1 and 8,000 characters.");
  return content;
};

const titleFrom = (content: string) => {
  const compact = content.trim().replace(/\s+/g, " ");
  return compact.length <= 72 ? compact : `${compact.slice(0, 69).trimEnd()}...`;
};

const validAttachments = (input: unknown): AdminAiPendingAttachment[] => {
  if (input === undefined) return [];
  if (!Array.isArray(input) || input.length > 3) throw new AdminAiChatError("INVALID_ADMIN_AI_CONTEXT", "Attach no more than three Admin contexts.");
  const supported: AdminAiContextType[] = ["PRODUCT", "SUPPLIER", "PRICING_PROPOSAL"];
  return input.map((item) => {
    if (!item || typeof item !== "object") throw new AdminAiChatError("INVALID_ADMIN_AI_CONTEXT", "Admin AI context is invalid.");
    const value = item as Record<string, unknown>;
    if (typeof value.contextType !== "string" || !supported.includes(value.contextType as AdminAiContextType) || typeof value.resourceId !== "string" || !value.resourceId.trim() || value.resourceId.length > 160) throw new AdminAiChatError("INVALID_ADMIN_AI_CONTEXT", "Admin AI context is invalid.");
    return { contextType: value.contextType as AdminAiContextType, resourceId: value.resourceId.trim() };
  });
};

const pricingDecisionReview = (attachments: readonly Pick<AdminAiContextAttachment, "contextType">[], content: string) =>
  attachments.some((item) => item.contextType === "PRICING_PROPOSAL") && /\b(review|decid(?:e|ed|ing|ion)?|risk|warning|blocker|margin|markup|commercial|assessment)\b/i.test(content);

const productDraftChangeRequest = (attachments: readonly Pick<AdminAiContextAttachment, "contextType">[], content: string) =>
  attachments.length === 1
  && attachments[0].contextType === "PRODUCT"
  && /\b(change|update|edit|rewrite|improve|revise|add)\b/i.test(content)
  && /\b(overview|description|content|copy)\b/i.test(content);

export const modelRoleForChat = (attachments: readonly Pick<AdminAiContextAttachment, "contextType">[], content: string): AdminAiModelRole => {
  if (attachments.length > 1) return "PRIMARY";
  if (productDraftChangeRequest(attachments, content)) return "PRIMARY";
  return pricingDecisionReview(attachments, content) ? modelRoleForContext("PRICING_PROPOSAL", "RISK_REVIEW") : "ROUTINE";
};

export const reasoningEffortForChat = (attachments: readonly Pick<AdminAiContextAttachment, "contextType">[], role: AdminAiModelRole) =>
  role === "PRIMARY" && attachments.length === 1 && (attachments[0].contextType === "PRICING_PROPOSAL" || attachments[0].contextType === "PRODUCT") ? "LOW" as const : undefined;

export const PRICING_REVIEW_RESPONSE_CONTRACT = `Pricing decision review response contract:
Begin with a concise section titled "Canonical pricing facts" before any interpretation.
State every supplied canonical value explicitly: supplier cost, proposed selling price, gross profit, gross margin, markup, pricing band, target margin, minimum profit, proposal status, and every warning code.
Use the supplied canonical pricing values exactly. Do not recalculate, replace, infer, or round them differently.
Then provide only three short sections: what requires review, risks or warnings, and suggested next steps. Avoid generic pricing lessons and repetition.`;

const safeMetadata = (result: Awaited<ReturnType<AdminAiService["generate"]>>) => ({
  requestedModelRole: result.requestedModelRole,
  resolvedProvider: result.provider,
  resolvedModel: result.model,
  inputTokens: result.usage?.inputTokens,
  outputTokens: result.usage?.outputTokens,
  totalTokens: result.usage?.totalTokens,
  reasoningTokens: result.usage?.reasoningTokens,
  latencyMs: result.latencyMs,
  fallbackUsed: result.fallbackUsed,
  internalRequestId: result.requestId,
  providerRequestId: result.providerRequestId,
});

function generationMessages(messages: readonly AdminAiMessage[]) {
  const usable = messages.filter((message) => message.content && message.generationStatus === "COMPLETED").slice(-16);
  while (usable.reduce((sum, item) => sum + (item.content?.length ?? 0), 0) > 28_000) usable.shift();
  return usable.map((message) => ({ role: message.role === "USER" ? "user" as const : "assistant" as const, content: message.content! }));
}

async function contextBlocks(attachments: readonly AdminAiContextAttachment[], staff: StaffAuthorizationContext, dependencies: Dependencies, pricingReview: boolean) {
  const contexts: AdminAiSafeContext[] = [];
  for (const attachment of attachments) {
    try { contexts.push(await dependencies.buildContext({ ...attachment, intent: "EXPLAIN" }, staff)); }
    catch { throw new AdminAiChatError("ADMIN_AI_CONTEXT_UNAVAILABLE", "An attached Admin context is no longer available to this staff account. Detach it before continuing.", 403); }
  }
  const blocks = contexts.map((context) => ({ label: `${context.contextType}: ${context.title}`.slice(0, 80), content: JSON.stringify({ resourceId: context.resourceId, provenance: context.provenance, facts: context.facts }).slice(0, 4_000) }));
  if (pricingReview) blocks.push({ label: "Trusted pricing response requirements", content: PRICING_REVIEW_RESPONSE_CONTRACT });
  return blocks;
}

async function generateTurn(input: { ownerStaffId: string; conversationId: string; turnId: string; staff: StaffAuthorizationContext; service: AdminAiService; dependencies: Dependencies; environment: NodeJS.ProcessEnv }) {
  const turn = await getAdminAiTurn(input.ownerStaffId, input.conversationId, input.turnId);
  const attachments = await listAdminAiContextAttachments(input.ownerStaffId, input.conversationId);
  const history = await listRecentAdminAiMessages(input.ownerStaffId, input.conversationId, 20);
  try {
    const result = await assertAdminAiAccess(input.staff, async () => {
      const requestPolicy = await (input.dependencies.requestPolicy ?? enforceAdminAiRequestPolicy)(input.staff, adminAiToolRegistryDto());
      const role = modelRoleForChat(attachments, turn.userMessage.content ?? "");
      const safeContextBlocks = await contextBlocks(attachments, input.staff, input.dependencies, role === "PRIMARY" && attachments.some((item) => item.contextType === "PRICING_PROPOSAL"));
      const productPolicy = await evaluateAdminAiToolPolicy({ staff: input.staff, tool: adminAiToolRegistryDto()[0], requestedBehavior: "OBSERVE", environment: input.environment, preparedActionsLastHour: 0, executionsLastHour: 0 });
      safeContextBlocks.push({ label: "Admin AI Product-action policy", content: productPolicy.effectiveAutonomy === "PREPARE" ? "Product draft updates may be prepared only through the supplied controlled tool and always require explicit staff confirmation." : productPolicy.effectiveAutonomy === "SUGGEST" ? "You may recommend a Product draft improvement in text, but must not claim to have prepared or applied it." : "Explain canonical Product state only. Do not proactively recommend, prepare or claim a Product mutation." });
      const tools = await availableAdminAiTools({ staff: input.staff, attachments, environment: input.environment });
      const generated = await input.service.generate({
        callerFeature: "admin-ai-chat",
        modelRole: role,
        messages: generationMessages(history),
        contextBlocks: safeContextBlocks,
        temperature: 0.1,
        maxOutputTokens: Math.min(1_200, requestPolicy.maxTokensPerRequest),
        ...(reasoningEffortForChat(attachments, role) ? { reasoningEffort: reasoningEffortForChat(attachments, role) } : {}),
        metadata: { conversationId: input.conversationId, turnId: input.turnId },
        tools,
      });
      if (!generated.toolCalls?.length) return generated;
      if (generated.toolCalls.length !== 1) throw new AdminAiChatError("MULTIPLE_ADMIN_AI_ACTIONS", "Admin AI may prepare only one controlled action per turn.", 409);
      const prepared = await prepareAdminAiAction({ ownerStaffId: input.ownerStaffId, conversationId: input.conversationId, turnId: input.turnId, staff: input.staff, attachments, toolCall: generated.toolCalls[0], environment: input.environment });
      try {
        return await input.service.generate({
          callerFeature: "admin-ai-action-prepared",
          modelRole: role,
          messages: generationMessages(history),
          contextBlocks: [...safeContextBlocks, { label: "Controlled action status", content: JSON.stringify({ status: "AWAITING_CONFIRMATION", actionId: prepared.id, tool: prepared.toolId, target: prepared.targetLabel }) }],
          toolContinuation: { call: generated.toolCalls[0], result: { status: "AWAITING_CONFIRMATION", actionId: prepared.id, confirmationRequired: true } },
          temperature: 0,
          maxOutputTokens: 240,
          metadata: { conversationId: input.conversationId, turnId: input.turnId, actionId: prepared.id },
        });
      } catch {
        return { ...generated, text: prepared.toolId === "product_publish" ? "I prepared a HIGH-risk Product publication action. Canonical facts are shown below and authenticated human confirmation is required." : "I prepared a controlled Product draft update. Review the proposed changes below before applying them.", toolCalls: undefined };
      }
    }, input.environment, input.dependencies.access);
    return completeAdminAiAssistantTurn(input.ownerStaffId, input.conversationId, input.turnId, result.text, safeMetadata(result));
  } catch (error) {
    const diagnostics = error instanceof AdminAiError ? error.diagnostics : {};
    await failAdminAiAssistantTurn(input.ownerStaffId, input.conversationId, input.turnId, { internalRequestId: diagnostics.requestId, providerRequestId: diagnostics.providerRequestId }).catch(() => undefined);
    throw error;
  }
}

export async function sendAdminAiChat(input: { ownerStaffId: string; conversationId?: string; content: string; idempotencyKey: string; attachments?: unknown; staff: StaffAuthorizationContext; service: AdminAiService; environment?: NodeJS.ProcessEnv; dependencies?: Dependencies }) {
  const content = validMessageContent(input.content);
  const attachments = validAttachments(input.attachments);
  await assertAdminAiAccess(input.staff, async () => undefined, input.environment ?? process.env, input.dependencies?.access ?? getAdminAiAccess);
  const conversation = input.conversationId ? await getAdminAiConversation(input.ownerStaffId, input.conversationId) : await createAdminAiConversation(input.ownerStaffId, titleFrom(content));
  if (!conversation) throw new AdminAiChatError("ADMIN_AI_CONVERSATION_NOT_FOUND", "Admin AI conversation is not available.", 404);
  if (conversation.status !== "ACTIVE") throw new AdminAiChatError("ADMIN_AI_CONVERSATION_ARCHIVED", "Unarchive this conversation before sending a message.", 409);
  for (const attachment of attachments) {
    await (input.dependencies?.buildContext ?? buildAdminAiSafeContext)({ ...attachment, intent: "EXPLAIN" }, input.staff);
    await attachAdminAiContext(input.ownerStaffId, conversation.id, attachment.contextType, attachment.resourceId);
  }
  const turn = await appendAdminAiUserTurn(input.ownerStaffId, conversation.id, { content, idempotencyKey: input.idempotencyKey });
  if (!turn.created) return { conversation, ...turn, processing: turn.assistantMessage.generationStatus === "PENDING" };
  const assistantMessage = await generateTurn({ ownerStaffId: input.ownerStaffId, conversationId: conversation.id, turnId: turn.userMessage.turnId, staff: input.staff, service: input.service, dependencies: input.dependencies ?? defaultDependencies, environment: input.environment ?? process.env });
  return { conversation: (await getAdminAiConversation(input.ownerStaffId, conversation.id))!, userMessage: turn.userMessage, assistantMessage, processing: false };
}

export async function createAdminAiChatConversation(input: { ownerStaffId: string; titleSeed: string; staff: StaffAuthorizationContext; environment?: NodeJS.ProcessEnv; dependencies?: Dependencies }) {
  const content = validMessageContent(input.titleSeed);
  await assertAdminAiAccess(input.staff, async () => undefined, input.environment ?? process.env, input.dependencies?.access ?? getAdminAiAccess);
  return createAdminAiConversation(input.ownerStaffId, titleFrom(content));
}

export async function retryAdminAiChat(input: { ownerStaffId: string; conversationId: string; turnId: string; staff: StaffAuthorizationContext; service: AdminAiService; environment?: NodeJS.ProcessEnv; dependencies?: Dependencies }) {
  await assertAdminAiAccess(input.staff, async () => undefined, input.environment ?? process.env, input.dependencies?.access ?? getAdminAiAccess);
  await retryAdminAiAssistantTurn(input.ownerStaffId, input.conversationId, input.turnId);
  return generateTurn({ ...input, dependencies: input.dependencies ?? defaultDependencies, environment: input.environment ?? process.env });
}

export async function adminAiChatAccess(staff: StaffAuthorizationContext, environment = process.env): Promise<AdminAiAccess> { return getAdminAiAccess(staff, environment); }
