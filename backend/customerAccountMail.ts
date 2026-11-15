import type { MailTransport } from "./mailService.js";
import { publicBusiness } from "../src/lib/public-business.js";

export function customerPasswordResetUrl(token: string, configuredOrigin = process.env.PUBLIC_STOREFRONT_ORIGIN) {
  const origin = configuredOrigin?.trim() || "http://127.0.0.1:5173";
  return `${origin.replace(/\/$/, "")}/account?token=${encodeURIComponent(token)}`;
}

export async function sendCustomerPasswordResetEmail(input: { email: string; token: string; mail: MailTransport; origin?: string }) {
  const link = customerPasswordResetUrl(input.token, input.origin);
  await input.mail.send({
    to: input.email,
    fromEmail: publicBusiness.email.support,
    fromName: "TekCentral Support",
    replyTo: publicBusiness.email.support,
    subject: "Reset your TekCentral password",
    text: `Reset your TekCentral password using this link: ${link}\n\nThis link expires in one hour and can be used once. If you did not request this, you can ignore this email.`,
    html: `<h1>Reset your TekCentral password</h1><p><a href="${link}">Choose a new password</a></p><p>This link expires in one hour and can be used once. If you did not request this, you can ignore this email.</p>`,
  });
}
