import { publicBusiness } from "../../../src/lib/public-business.js";
import type { ZeusKnowledgeModule } from "./types.js";

export const supportGuidanceKnowledge: ZeusKnowledgeModule = {
  id: "SUPPORT_GUIDANCE",
  instructions: `Use TekCentral's Contact Us workflow for human help. Route general and product support to ${publicBusiness.email.support}, sales enquiries to ${publicBusiness.email.sales}, and billing issues to ${publicBusiness.email.accounts}. The public telephone is ${publicBusiness.phone.display}. Account-specific information requires the secure account or guest-order workflow; never claim a human has been contacted.`,
};
