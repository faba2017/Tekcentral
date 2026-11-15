import type { ContactCategory } from "./contact";
export type ContactDepartment="GENERAL"|"SALES"|"ACCOUNTS"|"SUPPORT";
export interface ContactConversationRow{id:string;reference:string;origin:"PUBLIC_CONTACT"|"ADMIN_OUTBOUND";department:ContactDepartment;category:ContactCategory;contactName:string;contactEmail:string;subject:string;customerAccountId?:string;orderNumber?:string;status:"OPEN"|"REPLIED"|"CLOSED";createdAt:string;lastActivityAt:string;viewedAt?:string;deliveryState:"PENDING"|"SENT"|"EMAIL_FAILED"}
export interface ContactMessage{id:string;direction:"INBOUND"|"OUTBOUND";department:ContactDepartment;fromAddress:string;fromName:string;toAddress:string;subject:string;body:string;createdAt:string;sentAt?:string;deliveryState:"PENDING"|"SENT"|"EMAIL_FAILED";failureCategory?:string;attemptCount:number;lastAttemptAt?:string}
export interface ContactConversation extends ContactConversationRow{phone?:string;enquiryId?:string;messages:ContactMessage[]}
export interface ContactInboxResponse{conversations:ContactConversationRow[];page:number;pageSize:number;totalItems:number;totalPages:number}
export interface ContactCustomerChoice{id:string;firstName:string;lastName:string;email:string;phone?:string}
export const departmentLabels:Record<ContactDepartment,string>={GENERAL:"General",SALES:"Sales",ACCOUNTS:"Accounts",SUPPORT:"Support"};
export const departmentForCategory=(category:ContactCategory):ContactDepartment=>category==="PAYMENT_BILLING"?"ACCOUNTS":["PRODUCT_QUESTION","SALES_QUOTE","BUSINESS_BULK_ORDERS"].includes(category)?"SALES":["GENERAL_ENQUIRY","OTHER"].includes(category)?"GENERAL":"SUPPORT";
export const newSendKey=()=>crypto.randomUUID().replace(/-/g,"");
