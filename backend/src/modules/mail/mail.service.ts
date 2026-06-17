/**
 * Отправка писем через SMTP.
 *
 * Здесь только транспорт (sendEmail). Контент системных писем
 * (верификация, привязка почты, сброс пароля и т.п.) больше не хардкодится в этом
 * файле — он рендерится из редактируемых шаблонов админки:
 * email-templates.service.ts → renderEmailTemplate(key, vars).
 */

import nodemailer from "nodemailer";

export type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string | null;
  password: string | null;
  fromEmail: string | null;
  fromName: string | null;
};

export function isSmtpConfigured(config: SmtpConfig): boolean {
  return Boolean(
    config.host &&
    config.port &&
    config.fromEmail
  );
}

export type EmailAttachment = { filename: string; content: Buffer };

/**
 * Отправить произвольное письмо. Опционально — вложения.
 */
export async function sendEmail(
  config: SmtpConfig,
  to: string,
  subject: string,
  html: string,
  attachments?: EmailAttachment[]
): Promise<{ ok: boolean; error?: string }> {
  if (!isSmtpConfigured(config)) {
    return { ok: false, error: "SMTP not configured" };
  }

  const auth = config.user && config.password ? { user: config.user, pass: config.password } : undefined;
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 10000,
  });

  const from = config.fromName
    ? `"${config.fromName}" <${config.fromEmail}>`
    : config.fromEmail!;

  try {
    await transporter.sendMail({
      from,
      to,
      subject,
      html,
      ...(attachments?.length ? { attachments: attachments.map((a) => ({ filename: a.filename, content: a.content })) } : {}),
    });
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}
