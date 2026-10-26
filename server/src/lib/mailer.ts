import nodemailer, { type Transporter } from "nodemailer";
import { config } from "../config.js";

let transport: Transporter | null = null;

function getTransport() {
  if (!transport) {
    const { host, port, secure, user, pass } = config.email;
    transport = nodemailer.createTransport({ host, port, secure, auth: user ? { user, pass } : undefined });
  }
  return transport;
}

export interface Mail {
  to: string;
  subject: string;
  text: string;
}

/**
 * Send an email, or log it when EMAIL_ENABLED is not "true".
 * Returns whether it was actually handed to the mail server, so callers can decide
 * whether to show development shortcuts (links, codes) on screen.
 */
export async function sendMail(mail: Mail): Promise<boolean> {
  if (!config.email.enabled) {
    console.log(`[mail disabled] To: ${mail.to} | ${mail.subject}\n${mail.text}\n`);
    return false;
  }
  await getTransport().sendMail({ from: config.email.from, ...mail });
  return true;
}

export function mailStatus() {
  if (!config.email.enabled) return "disabled (messages are written to the log)";
  return config.email.host ? `SMTP ${config.email.host}:${config.email.port}` : "enabled but SMTP_HOST is missing";
}
