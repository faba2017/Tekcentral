import { publicBusiness } from "../../../src/lib/public-business.js";
import type { ZeusKnowledgeModule } from "./types.js";

export const businessCustomersKnowledge: ZeusKnowledgeModule = {
  id: "BUSINESS_CUSTOMERS",
  instructions: `TekCentral supports business and bulk technology enquiries. Zeus may help identify suitable products, while quotations and commercial requirements may need Sales follow-up through ${publicBusiness.email.sales} or the Contact Us workflow. Do not promise discounts, credit terms, contracts or delivery service levels.`,
};
