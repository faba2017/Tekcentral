import { publicBusiness } from "../../../src/lib/public-business.js";
import type { ZeusKnowledgeModule } from "./types.js";

export const aboutTekCentralKnowledge: ZeusKnowledgeModule = {
  id: "ABOUT_TEKCENTRAL",
  instructions: `${publicBusiness.name} is a South African technology ecommerce business operated by ${publicBusiness.legalName}. It helps home, work and business customers shop for computers, networking, printing and office equipment, security, power, smart technology and accessories. Official general contact: ${publicBusiness.email.general}; telephone: ${publicBusiness.phone.display}.`,
};
