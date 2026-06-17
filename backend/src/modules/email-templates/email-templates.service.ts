/**
 * Email-шаблоны: единый источник для редактора (routes) И реальных отправителей.
 *
 * Хранение: каждый шаблон = пара ключей в system_settings:
 *   email_template_<key>_subject — тема
 *   email_template_<key>_body    — HTML тело (поддерживает {{переменные}})
 *
 * до выноса в сервис ключи email_template_* читал только сам
 * редактор (list/preview/send-test), а боевые письма слались с захардкоженным HTML
 * из mail.service.ts — правки админа «не сохранялись» (сохранялись, но не применялись).
 * Теперь отправители рендерят шаблон через renderEmailTemplate().
 *
 * wired=true — шаблон реально используется отправителем. wired=false — пока
 * редактируется «впрок» (отправитель ещё не реализован); UI честно показывает бейдж.
 */

import { prisma } from "../../db.js";

export interface TemplateDef {
  key: string;
  label: string;
  description: string;
  variables: { name: string; example: string; required?: boolean }[];
  defaultSubject: string;
  defaultBody: string;
  /** Подключён ли шаблон к реальному отправителю писем. */
  wired: boolean;
}

export const TEMPLATES: TemplateDef[] = [
  {
    key: "welcome",
    label: "Приветственное письмо",
    description: "Отправляется после регистрации нового клиента (если включён email-канал)",
    variables: [
      { name: "email", example: "user@example.com", required: true },
      { name: "loginUrl", example: "https://stealthnet.app/login", required: true },
    ],
    defaultSubject: "Добро пожаловать в STEALTHNET!",
    defaultBody: `<h2>Добро пожаловать!</h2>
<p>Спасибо, что зарегистрировались в STEALTHNET. Ваш email: <b>{{email}}</b>.</p>
<p>Войти в личный кабинет: <a href="{{loginUrl}}">{{loginUrl}}</a></p>
<p>Если у вас есть вопросы — пишите в Telegram-бот.</p>`,
    wired: false,
  },
  {
    key: "email_verification",
    label: "Верификация email",
    description: "Письмо со ссылкой подтверждения при регистрации по email",
    variables: [
      { name: "verifyUrl", example: "https://stealthnet.app/cabinet/verify-email?token=...", required: true },
      { name: "hours", example: "24", required: true },
      { name: "serviceName", example: "STEALTHNET" },
    ],
    defaultSubject: "Подтверждение регистрации — {{serviceName}}",
    defaultBody: `<p>Здравствуйте!</p>
<p>Для завершения регистрации в {{serviceName}} перейдите по ссылке:</p>
<p><a href="{{verifyUrl}}">{{verifyUrl}}</a></p>
<p>Ссылка действительна {{hours}} часа.</p>
<p>Если вы не регистрировались, проигнорируйте это письмо.</p>`,
    wired: true,
  },
  {
    key: "link_email",
    label: "Привязка почты",
    description: "Письмо со ссылкой подтверждения при привязке почты к существующему аккаунту",
    variables: [
      { name: "verifyUrl", example: "https://stealthnet.app/cabinet/verify-link-email?token=...", required: true },
      { name: "hours", example: "24", required: true },
      { name: "serviceName", example: "STEALTHNET" },
    ],
    defaultSubject: "Привязка почты к аккаунту — {{serviceName}}",
    defaultBody: `<p>Здравствуйте!</p>
<p>Для привязки этой почты к вашему аккаунту в {{serviceName}} перейдите по ссылке:</p>
<p><a href="{{verifyUrl}}">{{verifyUrl}}</a></p>
<p>Ссылка действительна {{hours}} часа.</p>
<p>Если вы не запрашивали привязку, проигнорируйте это письмо.</p>`,
    wired: true,
  },
  {
    key: "password_reset",
    label: "Сброс пароля",
    description: "Ссылка для сброса пароля",
    variables: [
      { name: "resetUrl", example: "https://stealthnet.app/reset?token=...", required: true },
      { name: "minutes", example: "60", required: true },
      { name: "serviceName", example: "STEALTHNET" },
    ],
    defaultSubject: "Сброс пароля — {{serviceName}}",
    defaultBody: `<p>Здравствуйте!</p>
<p>Вы запросили сброс пароля в {{serviceName}}. Чтобы задать новый пароль, перейдите по ссылке:</p>
<p><a href="{{resetUrl}}">{{resetUrl}}</a></p>
<p>Ссылка действительна {{minutes}} минут. Если вы не запрашивали сброс — просто проигнорируйте это письмо, пароль останется прежним.</p>`,
    wired: true,
  },
  {
    key: "payment_confirmed",
    label: "Успешная оплата",
    description: "После PAID платежа",
    variables: [
      { name: "amount", example: "9.99", required: true },
      { name: "currency", example: "USD", required: true },
      { name: "tariffName", example: "1 месяц", required: true },
      { name: "expiresAt", example: "2026-06-05", required: true },
    ],
    defaultSubject: "Оплата подтверждена",
    defaultBody: `<h2>Спасибо за оплату!</h2>
<p>Тариф: <b>{{tariffName}}</b></p>
<p>Сумма: <b>{{amount}} {{currency}}</b></p>
<p>Подписка активна до: <b>{{expiresAt}}</b></p>`,
    wired: false,
  },
  {
    key: "subscription_expiring",
    label: "Скоро истекает подписка",
    description: "За N дней до истечения",
    variables: [
      { name: "tariffName", example: "1 месяц", required: true },
      { name: "daysLeft", example: "3", required: true },
      { name: "renewUrl", example: "https://stealthnet.app/renew", required: true },
    ],
    defaultSubject: "Подписка истекает через {{daysLeft}} дн.",
    defaultBody: `<h2>Подписка скоро закончится</h2>
<p>Ваша подписка <b>{{tariffName}}</b> истекает через <b>{{daysLeft}}</b> дн.</p>
<p>Продлить: <a href="{{renewUrl}}">{{renewUrl}}</a></p>`,
    wired: false,
  },
  {
    key: "subscription_expired",
    label: "Подписка истекла",
    description: "В день истечения",
    variables: [
      { name: "tariffName", example: "1 месяц", required: true },
    ],
    defaultSubject: "Подписка истекла",
    defaultBody: `<h2>Подписка закончилась</h2>
<p>Ваша подписка <b>{{tariffName}}</b> истекла. Продлите её, чтобы продолжить пользоваться сервисом.</p>`,
    wired: false,
  },
];

export function subjectKey(k: string) { return `email_template_${k}_subject`; }
export function bodyKey(k: string) { return `email_template_${k}_body`; }

export interface StoredTemplate {
  key: string;
  label: string;
  description: string;
  variables: TemplateDef["variables"];
  subject: string;
  body: string;
  isDefault: boolean;
  wired: boolean;
}

/** Шаблон из БД с фоллбэком на дефолт. null — неизвестный ключ. */
export async function getStoredTemplate(key: string): Promise<StoredTemplate | null> {
  const def = TEMPLATES.find((t) => t.key === key);
  if (!def) return null;

  const [s, b] = await Promise.all([
    prisma.systemSetting.findUnique({ where: { key: subjectKey(key) } }),
    prisma.systemSetting.findUnique({ where: { key: bodyKey(key) } }),
  ]);
  return {
    key: def.key,
    label: def.label,
    description: def.description,
    variables: def.variables,
    subject: s?.value ?? def.defaultSubject,
    body: b?.value ?? def.defaultBody,
    isDefault: !s && !b,
    wired: def.wired,
  };
}

export function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_m, name) => vars[name] ?? `{{${name}}}`);
}

/**
 * Отрендерить шаблон для боевой отправки: stored-or-default + подстановка переменных.
 * null — неизвестный ключ (отправитель должен иметь свой fallback или не слать).
 */
export async function renderEmailTemplate(
  key: string,
  vars: Record<string, string>,
): Promise<{ subject: string; body: string } | null> {
  const item = await getStoredTemplate(key);
  if (!item) return null;
  return {
    subject: renderTemplate(item.subject, vars),
    body: renderTemplate(item.body, vars),
  };
}
