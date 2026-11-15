import type { SafeCustomer } from "../customerAuth.js";
import { getStorePolicyKnowledge, type StorePolicyKnowledge, type StorePolicyTopic } from "../../src/lib/store-policy-knowledge.js";
import { zeusAction, type ZeusAction } from "../../src/lib/zeus-actions.js";
import { publicBusiness } from "../../src/lib/public-business.js";
import { zeusConfigurationAnswer, zeusCreatorAnswer, zeusIdentityAnswer, zeusImplementationAnswer } from "./instructions/identity.js";

export type ZeusDeterministicAnswerType = "identity_answer" | "business_knowledge_answer" | "provider_confidentiality_answer" | "human_escalation" | "secure_routing" | "policy_answer";
export interface ZeusDeterministicRoute { message: string; actions: ZeusAction[]; policy?: StorePolicyKnowledge; answerType?: ZeusDeterministicAnswerType }

const personal = (value: string) => /\b(my|mine|our)\b/.test(value);
const personalOrder = (value: string) => personal(value) && /\b(orders?|tracking|delivery|parcel|shipment|returns?|refunds?|cancel|payment)\b/.test(value);
const policyTopic = (value: string): StorePolicyTopic | undefined => {
  if (/privacy|personal information|my data/.test(value)) return "PRIVACY";
  if (/warrant/.test(value)) return "WARRANTY";
  if (/cancel/.test(value)) return "CANCELLATIONS";
  if (/refund/.test(value)) return "REFUNDS";
  if (/return|opened item/.test(value)) return "RETURNS";
  if (/payment|payfast|card/.test(value)) return "PAYMENTS";
  if (/shipping/.test(value)) return "SHIPPING";
  if (/delivery|deliver|dispatch|shipped|tracking/.test(value)) return "DELIVERY";
  if (/account|sign in|login/.test(value)) return "ACCOUNTS";
  return undefined;
};
const policyAction = (topic: StorePolicyTopic): ZeusAction => topic === "REFUNDS" ? zeusAction("VIEW_REFUND_POLICY", "View refund policy") : topic === "RETURNS" ? zeusAction("VIEW_RETURN_POLICY", "View return policy") : topic === "CANCELLATIONS" ? zeusAction("VIEW_CANCELLATION_POLICY", "View cancellation policy") : topic === "SHIPPING" || topic === "DELIVERY" ? zeusAction("VIEW_SHIPPING_POLICY", "View shipping policy") : topic === "PRIVACY" ? zeusAction("VIEW_PRIVACY_POLICY", "View privacy policy") : zeusAction("CONTACT_SUPPORT", "Contact support", { contactCategory: topic === "PAYMENTS" ? "PAYMENT_BILLING" : "GENERAL_ENQUIRY" });

export function policyAnswer(policy: StorePolicyKnowledge): ZeusDeterministicRoute { return { policy, answerType: "policy_answer", message: `${policy.summary} ${policy.keyConditions.join(" ")} ${policy.nextStep}`, actions: [policyAction(policy.topic), ...(policy.escalation === "ACCOUNTS" ? [zeusAction("CONTACT_ACCOUNTS", "Contact Accounts", { contactCategory: "PAYMENT_BILLING" })] : [])] }; }

export function routeZeusRequest(message: string, customer?: SafeCustomer): ZeusDeterministicRoute | undefined {
  const value = message.trim().toLowerCase();
  if (!value) return undefined;
  if (/\b(what|which)\s+(?:ai\s+)?model\b|\bwho powers you\b|\b(?:ai|inference) provider\b|\bunderlying (?:model|provider|technology)\b|\b(?:openai|digitalocean|anthropic|gemini|gpt|llm)\b/.test(value)) return { message: zeusImplementationAnswer, actions: [], answerType: "provider_confidentiality_answer" };
  if (/\b(system prompt|hidden (?:prompt|rules|instructions|configuration|config)|internal (?:prompt|instructions|configuration)|tool schemas?|tool names?|show .*instructions|print .*rules|ignore (?:all |your )?(?:previous |hidden )?instructions)\b/.test(value)) return { message: zeusConfigurationAnswer, actions: [], answerType: "provider_confidentiality_answer" };
  if (/\bwho (?:built|made|created|developed) you\b|\bwho is your creator\b/.test(value)) return { message: zeusCreatorAnswer, actions: [], answerType: "identity_answer" };
  if (/^(?:hi[,! ]*)?(?:who are you|what are you|what can you do|what can (?:you|zeus) help (?:me )?with)\??$/.test(value)) return { message: zeusIdentityAnswer, actions: [], answerType: "identity_answer" };
  if (/\b(?:supplier|wholesale) (?:cost|price|identity|name)|\b(?:profit )?margin\b|\bprocurement source\b|\binternal mapping\b/.test(value)) return { message: "Supplier, cost, margin and internal procurement information is private. I can help with current TekCentral products, selling prices and customer-facing availability.", actions: [zeusAction("BROWSE_PRODUCTS", "Browse products")], answerType: "provider_confidentiality_answer" };
  if (/\b(?:place|create|submit) (?:my |an? )?order\b|\bbuy (?:it|this|that) for me\b|\b(?:pay|checkout) (?:for me|now)\b|\baccept (?:the )?terms\b|\benter (?:my )?(?:card|payment)\b/.test(value)) return { message: "I can help you prepare your cart, but I can’t submit checkout, accept terms or make a payment. Please use TekCentral’s secure checkout when you’re ready.", actions: [zeusAction("BROWSE_PRODUCTS", "Continue shopping")], answerType: "secure_routing" };
  if (/\b(?:what is|tell me about|about) tekcentral\b/.test(value)) return { message: `${publicBusiness.name} is a South African technology ecommerce business for home, work and business customers. We offer technology across computers, networking, printing and office equipment, security, power, smart technology and accessories.`, actions: [zeusAction("BROWSE_PRODUCTS", "Browse products"), zeusAction("CONTACT_SUPPORT", "Contact TekCentral", { contactCategory: "GENERAL_ENQUIRY" })], answerType: "business_knowledge_answer" };
  const topic = policyTopic(value);
  const generalPolicyForm = /\b(how|policy|eligible|do you|can i|what happens (?:if|after)|deliver across)\b/.test(value);
  const explicitPersonalCommand = /\b(cancel|track|check|show|where|when)\b.*\b(my|our)\b|\b(my|our)\b.*\b(status|order|refund|return|tracking|delivery)\b/.test(value) && !/what happens (?:if|after)/.test(value);
  if (topic && generalPolicyForm && !explicitPersonalCommand) return policyAnswer(getStorePolicyKnowledge(topic)!);
  if (!customer && personalOrder(value)) {
    const accountHistory = /previous orders|order history|all my orders/.test(value);
    return { message: accountHistory ? "Sign in to view account-owned order history. If you checked out as a guest, use the secure guest-order workflow instead." : "I need a secure order workflow to check personal order, delivery, return or refund information. Sign in for account-owned orders, or use your secure guest-order access for a guest order.", actions: [zeusAction("LOGIN", "Log in"), zeusAction("SIGNUP", "Create account"), zeusAction("TRACK_GUEST_ORDER", "Open guest orders"), zeusAction("CONTACT_SUPPORT", "Contact support", { contactCategory: /refund|return/.test(value) ? "RETURNS_REFUNDS" : /cancel/.test(value) ? "CANCELLATION_REQUEST" : /tracking|delivery/.test(value) ? "DELIVERY_TRACKING" : "ORDER_ASSISTANCE" })] };
  }
  if (/bulk|corporate|business procurement|quotation|quote|large order|sell to businesses|business customers/.test(value)) return { message: "TekCentral supports business and bulk technology enquiries. I can help identify suitable products, and our Sales team can assist with quotation requirements. No discount or commercial commitment is created here.", actions: [zeusAction("CONTACT_SALES", "Contact Sales", { contactCategory: "BUSINESS_BULK_ORDERS" }), zeusAction("CALL_TEKCENTRAL", "Call TekCentral")], answerType: "business_knowledge_answer" };
  if (/\b(?:contact|email|reach) (?:the )?sales\b|\bsales (?:team|email|contact)\b/.test(value)) return { message: `You can contact TekCentral Sales at ${publicBusiness.email.sales}, or use our Contact Us workflow.`, actions: [zeusAction("CONTACT_SALES", "Contact Sales", { contactCategory: "SALES_QUOTE" }), zeusAction("CALL_TEKCENTRAL", "Call TekCentral")], answerType: "business_knowledge_answer" };
  if (/billing|charged|payment issue|payment failed|help .*payment/.test(value) && !personalOrder(value)) return { message: "For a customer-specific payment or billing issue, TekCentral Accounts can review the details securely. Zeus cannot perform a payment or refund operation.", actions: [zeusAction("CONTACT_ACCOUNTS", "Contact Accounts", { contactCategory: "PAYMENT_BILLING" }), zeusAction("CALL_TEKCENTRAL", "Call TekCentral")] };
  if (/technical help|compatible|compatibility|does .* work with/.test(value) && !/\b(product|sku|model)\b/.test(value)) return { message: "I don't have enough verified product information to confirm compatibility. TekCentral Technical Support can help review the exact models and requirements.", actions: [zeusAction("CONTACT_TECHNICAL", "Contact technical support", { contactCategory: "TECHNICAL_SUPPORT" }), zeusAction("BROWSE_PRODUCTS", "Browse products")] };
  if (/speak to|talk to|human|phone number|call you|contact someone/.test(value)) return { message: "You can contact TekCentral through the Contact Us workflow or call the official public telephone number.", actions: [zeusAction("CALL_TEKCENTRAL", "Call TekCentral"), zeusAction("CONTACT_SUPPORT", "Contact support", { contactCategory: "GENERAL_ENQUIRY" })], answerType: "human_escalation" };
  return undefined;
}
