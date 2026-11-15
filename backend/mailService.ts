import { connect as connectNet, type Socket } from "node:net";
import { connect as connectTls, type TLSSocket } from "node:tls";

export interface MailAttachment { filename: string; contentType: "application/pdf"; bytes: Uint8Array }
export interface MailMessage { to: string; subject: string; text: string; html?: string; replyTo?: string; fromEmail?: string; fromName?: string; inReplyTo?: string; references?: string[]; attachments?: MailAttachment[] }
export interface MailTransport { send(message: MailMessage): Promise<void> }
export class MailConfigurationError extends Error { constructor() { super("CONFIGURATION_MISSING"); } }

function smtpConfig() {
  const port = Number(process.env.SMTP_PORT);
  const config = {
    host: process.env.SMTP_HOST?.trim(), port,
    secure: process.env.SMTP_SECURE === "true",
    user: process.env.SMTP_USER?.trim(), password: process.env.SMTP_PASSWORD,
    fromEmail: process.env.SMTP_FROM_EMAIL?.trim(), fromName: process.env.SMTP_FROM_NAME?.trim() || "TekCentral Operations",
  };
  if (!config.host || !Number.isInteger(port) || port < 1 || !config.fromEmail) throw new MailConfigurationError();
  return config;
}

export function getSmtpConfigurationStatus() {
  const host = process.env.SMTP_HOST?.trim(); const port = Number(process.env.SMTP_PORT);
  return {
    configured: Boolean(host && Number.isInteger(port) && port > 0 && process.env.SMTP_FROM_EMAIL?.trim()),
    credentialConfigured: Boolean(process.env.SMTP_PASSWORD),
    host, port: Number.isInteger(port) && port > 0 ? port : undefined,
    secure: process.env.SMTP_SECURE === "true",
    username: process.env.SMTP_USER?.trim(),
    fromEmail: process.env.SMTP_FROM_EMAIL?.trim(),
    fromName: process.env.SMTP_FROM_NAME?.trim() || "TekCentral Operations",
  };
}

function encodeHeader(value: string) { return /[^\x20-\x7E]/.test(value) ? `=?UTF-8?B?${Buffer.from(value).toString("base64")}?=` : value; }
function dotStuff(value: string) { return value.replace(/\r?\n/g, "\r\n").replace(/^\./gm, ".."); }
function base64Lines(bytes: Uint8Array) { return Buffer.from(bytes).toString("base64").match(/.{1,76}/g)?.join("\r\n") ?? ""; }

export function validateMailAttachments(attachments: MailAttachment[] = []) {
  if (attachments.length > 1) throw new Error("MAIL_ATTACHMENT_LIMIT_EXCEEDED");
  for (const attachment of attachments) {
    if (!/^INV-\d{4}-\d{6}\.pdf$/.test(attachment.filename) || attachment.contentType !== "application/pdf") throw new Error("MAIL_ATTACHMENT_INVALID");
    if (attachment.bytes.length < 5 || attachment.bytes.length > 2 * 1024 * 1024 || Buffer.from(attachment.bytes.subarray(0, 5)).toString("ascii") !== "%PDF-") throw new Error("MAIL_ATTACHMENT_INVALID");
  }
}

export function buildMailMime(message: MailMessage, boundarySeed = "tekcentral") {
  validateMailAttachments(message.attachments);
  const attachments = message.attachments ?? [];
  const alternativeBoundary = `${boundarySeed}-alternative`;
  const content = message.html
    ? `--${alternativeBoundary}\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n${message.text}\r\n--${alternativeBoundary}\r\nContent-Type: text/html; charset=UTF-8\r\n\r\n${message.html}\r\n--${alternativeBoundary}--`
    : message.text;
  if (!attachments.length) return { contentType: message.html ? `multipart/alternative; boundary="${alternativeBoundary}"` : "text/plain; charset=UTF-8", body: content };
  const mixedBoundary = `${boundarySeed}-mixed`;
  const attachment = attachments[0];
  const firstPart = message.html
    ? `Content-Type: multipart/alternative; boundary="${alternativeBoundary}"\r\n\r\n${content}`
    : `Content-Type: text/plain; charset=UTF-8\r\n\r\n${content}`;
  const body = `--${mixedBoundary}\r\n${firstPart}\r\n--${mixedBoundary}\r\nContent-Type: application/pdf; name="${attachment.filename}"\r\nContent-Disposition: attachment; filename="${attachment.filename}"\r\nContent-Transfer-Encoding: base64\r\n\r\n${base64Lines(attachment.bytes)}\r\n--${mixedBoundary}--`;
  return { contentType: `multipart/mixed; boundary="${mixedBoundary}"`, body };
}

async function smtpSession(socket: Socket | TLSSocket, config: ReturnType<typeof smtpConfig>, message?: MailMessage) {
  let buffer = "";
  const waiters: ((line: string) => void)[] = [];
  const pendingLines: string[] = [];
  socket.setEncoding("utf8");
  socket.on("data", (chunk: string) => {
    buffer += chunk;
    let index: number;
    while ((index = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, index + 1); buffer = buffer.slice(index + 1);
      const waiter = waiters.shift();
      if (waiter) waiter(line);
      else pendingLines.push(line);
    }
  });
  const response = async () => {
    const lines: string[] = [];
    while (true) {
      const line = await new Promise<string>((resolve, reject) => {
        const pending = pendingLines.shift();
        if (pending) { resolve(pending); return; }
        const timeout = setTimeout(() => reject(new Error("SMTP_TIMEOUT")), 15_000);
        waiters.push((value) => { clearTimeout(timeout); resolve(value); });
      });
      lines.push(line.trimEnd());
      if (/^\d{3} /.test(line)) break;
    }
    const code = Number(lines.at(-1)?.slice(0, 3));
    if (code >= 400 || !Number.isFinite(code)) throw new Error(`SMTP_${code || "INVALID_RESPONSE"}`);
    return { code, lines };
  };
  const command = async (value: string, expected?: number[]) => {
    socket.write(`${value}\r\n`); const result = await response();
    if (expected && !expected.includes(result.code)) throw new Error(`SMTP_${result.code}`);
    return result;
  };
  await response();
  await command(`EHLO ${config.host}`, [250]);
  if (config.user && config.password) {
    await command("AUTH LOGIN", [334]);
    await command(Buffer.from(config.user).toString("base64"), [334]);
    await command(Buffer.from(config.password).toString("base64"), [235]);
  }
  if (!message) {
    await command("QUIT", [221]);
    return;
  }
  const senderEmail = message.fromEmail ?? config.fromEmail;
  const senderName = message.fromName ?? config.fromName;
  await command(`MAIL FROM:<${senderEmail}>`, [250]);
  await command(`RCPT TO:<${message.to}>`, [250, 251]);
  await command("DATA", [354]);
  const boundary = `tekcentral-${Date.now().toString(36)}`;
  const mime = message ? buildMailMime(message, boundary) : undefined;
  const headers = [
    `From: ${encodeHeader(senderName)} <${senderEmail}>`, `To: <${message.to}>`,
    ...(message.replyTo ? [`Reply-To: <${message.replyTo}>`] : []),
    ...(message.inReplyTo ? [`In-Reply-To: ${message.inReplyTo}`] : []),
    ...(message.references?.length ? [`References: ${message.references.join(" ")}`] : []),
    `Subject: ${encodeHeader(message.subject)}`, "MIME-Version: 1.0",
    mime ? `Content-Type: ${mime.contentType}` : "Content-Type: text/plain; charset=UTF-8",
  ];
  const body = mime?.body ?? message.text;
  socket.write(`${headers.join("\r\n")}\r\n\r\n${dotStuff(body)}\r\n.\r\n`);
  const accepted = await response();
  if (accepted.code !== 250) throw new Error(`SMTP_${accepted.code}`);
  await command("QUIT", [221]);
}

async function openSmtpSession(message?: MailMessage) {
    const config = smtpConfig();
    const socket = await new Promise<Socket | TLSSocket>((resolve, reject) => {
      const connection = config.secure
        ? connectTls({ host: config.host, port: config.port, servername: config.host }, () => resolve(connection))
        : connectNet({ host: config.host, port: config.port }, () => resolve(connection));
      connection.once("error", reject);
      connection.setTimeout(20_000, () => connection.destroy(new Error("SMTP_TIMEOUT")));
    });
    try { await smtpSession(socket, config, message); } finally { socket.destroy(); }
}

export async function verifySmtpConnection() {
  await openSmtpSession();
}

export const smtpMailTransport: MailTransport = {
  async send(message) {
    await openSmtpSession(message);
  },
};
