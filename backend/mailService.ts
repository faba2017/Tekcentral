import { connect as connectNet, type Socket } from "node:net";
import { connect as connectTls, type TLSSocket } from "node:tls";

export interface MailMessage { to: string; subject: string; text: string; html?: string }
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

function encodeHeader(value: string) { return /[^\x20-\x7E]/.test(value) ? `=?UTF-8?B?${Buffer.from(value).toString("base64")}?=` : value; }
function dotStuff(value: string) { return value.replace(/\r?\n/g, "\r\n").replace(/^\./gm, ".."); }

async function smtpSession(socket: Socket | TLSSocket, config: ReturnType<typeof smtpConfig>, message: MailMessage) {
  let buffer = "";
  const waiters: ((line: string) => void)[] = [];
  socket.setEncoding("utf8");
  socket.on("data", (chunk: string) => {
    buffer += chunk;
    let index: number;
    while ((index = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, index + 1); buffer = buffer.slice(index + 1);
      waiters.shift()?.(line);
    }
  });
  const response = async () => {
    const lines: string[] = [];
    while (true) {
      const line = await new Promise<string>((resolve, reject) => {
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
  await command(`MAIL FROM:<${config.fromEmail}>`, [250]);
  await command(`RCPT TO:<${message.to}>`, [250, 251]);
  await command("DATA", [354]);
  const boundary = `tekcentral-${Date.now().toString(36)}`;
  const headers = [
    `From: ${encodeHeader(config.fromName)} <${config.fromEmail}>`, `To: <${message.to}>`,
    `Subject: ${encodeHeader(message.subject)}`, "MIME-Version: 1.0",
    message.html ? `Content-Type: multipart/alternative; boundary="${boundary}"` : "Content-Type: text/plain; charset=UTF-8",
  ];
  const body = message.html
    ? `--${boundary}\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n${message.text}\r\n--${boundary}\r\nContent-Type: text/html; charset=UTF-8\r\n\r\n${message.html}\r\n--${boundary}--`
    : message.text;
  socket.write(`${headers.join("\r\n")}\r\n\r\n${dotStuff(body)}\r\n.\r\n`);
  const accepted = await response();
  if (accepted.code !== 250) throw new Error(`SMTP_${accepted.code}`);
  await command("QUIT", [221]);
}

export const smtpMailTransport: MailTransport = {
  async send(message) {
    const config = smtpConfig();
    const socket = await new Promise<Socket | TLSSocket>((resolve, reject) => {
      const connection = config.secure
        ? connectTls({ host: config.host, port: config.port, servername: config.host }, () => resolve(connection))
        : connectNet({ host: config.host, port: config.port }, () => resolve(connection));
      connection.once("error", reject);
      connection.setTimeout(20_000, () => connection.destroy(new Error("SMTP_TIMEOUT")));
    });
    try { await smtpSession(socket, config, message); } finally { socket.destroy(); }
  },
};
