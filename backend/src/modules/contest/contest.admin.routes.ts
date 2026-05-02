/**
 * Админские эндпоинты конкурсов: CRUD, проведение розыгрыша, превью участников.
 */

import express, { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db.js";
import { requireAuth, requireAdminSection } from "../auth/middleware.js";
import { getEligibleParticipants, runDraw, parseConditions } from "./contest.service.js";
import { sendContestStartNotification, sendContestDrawResults } from "./contest-daily-reminder.service.js";

function asyncRoute(fn: (req: express.Request, res: express.Response) => Promise<void | express.Response>) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    Promise.resolve(fn(req, res)).catch(next);
  };
}

const createContestSchema = z.object({
  name: z.string().min(1).max(200),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  prize1Type: z.enum(["custom", "balance", "vpn_days"]),
  prize1Value: z.string().max(2000),
  prize2Type: z.enum(["custom", "balance", "vpn_days"]),
  prize2Value: z.string().max(2000),
  prize3Type: z.enum(["custom", "balance", "vpn_days"]),
  prize3Value: z.string().max(2000),
  conditionsJson: z.string().max(2000).nullable().optional(),
  drawType: z.enum(["random", "by_days_bought", "by_payments_count", "by_referrals_count"]),
  dailyMessage: z.string().max(2000).nullable().optional(),
  buttonText: z.string().max(200).nullable().optional(),
  buttonUrl: z.string().max(2000).nullable().optional(),
  // Конфиг напоминаний (issue #35)
  reminderEnabled: z.boolean().optional(),
  reminderIntervalHours: z.number().int().min(0).max(24 * 30).optional(),
  reminderDeadlineHoursBefore: z
    .string()
    .max(200)
    .regex(/^(\s*\d+\s*(,\s*\d+\s*)*)?$/, "Формат: '24,1' (часы через запятую)")
    .optional(),
});

const updateContestSchema = createContestSchema.partial();

export const contestAdminRouter = Router();
contestAdminRouter.use(requireAuth);
contestAdminRouter.use(requireAdminSection);

contestAdminRouter.get("/", asyncRoute(async (_req, res) => {
  const list = await prisma.contest.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      winners: {
        include: { client: { select: { id: true, email: true, telegramUsername: true } } },
        orderBy: { place: "asc" },
      },
    },
  });
  return res.json(list);
}));

contestAdminRouter.get("/:id", asyncRoute(async (req, res) => {
  const id = req.params.id;
  const contest = await prisma.contest.findUnique({
    where: { id },
    include: {
      winners: {
        include: { client: { select: { id: true, email: true, telegramId: true, telegramUsername: true } } },
        orderBy: { place: "asc" },
      },
    },
  });
  if (!contest) return res.status(404).json({ message: "Конкурс не найден" });
  return res.json(contest);
}));

contestAdminRouter.post("/", asyncRoute(async (req, res) => {
  const parsed = createContestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Неверные данные", errors: parsed.error.flatten() });
  }
  const data = parsed.data;
  const contest = await prisma.contest.create({
    data: {
      name: data.name,
      startAt: new Date(data.startAt),
      endAt: new Date(data.endAt),
      prize1Type: data.prize1Type,
      prize1Value: data.prize1Value,
      prize2Type: data.prize2Type,
      prize2Value: data.prize2Value,
      prize3Type: data.prize3Type,
      prize3Value: data.prize3Value,
      conditionsJson: data.conditionsJson ?? null,
      drawType: data.drawType,
      dailyMessage: data.dailyMessage ?? null,
      buttonText: data.buttonText ?? null,
      buttonUrl: data.buttonUrl ?? null,
      reminderEnabled: data.reminderEnabled ?? true,
      reminderIntervalHours: data.reminderIntervalHours ?? 24,
      reminderDeadlineHoursBefore: data.reminderDeadlineHoursBefore ?? "",
      status: "draft",
    },
  });
  return res.status(201).json(contest);
}));

contestAdminRouter.patch("/:id", asyncRoute(async (req, res) => {
  const id = req.params.id;
  const parsed = updateContestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Неверные данные", errors: parsed.error.flatten() });
  }
  const data = parsed.data;
  const update: Record<string, unknown> = {};
  if (data.name != null) update.name = data.name;
  if (data.startAt != null) update.startAt = new Date(data.startAt);
  if (data.endAt != null) update.endAt = new Date(data.endAt);
  if (data.prize1Type != null) update.prize1Type = data.prize1Type;
  if (data.prize1Value != null) update.prize1Value = data.prize1Value;
  if (data.prize2Type != null) update.prize2Type = data.prize2Type;
  if (data.prize2Value != null) update.prize2Value = data.prize2Value;
  if (data.prize3Type != null) update.prize3Type = data.prize3Type;
  if (data.prize3Value != null) update.prize3Value = data.prize3Value;
  if (data.conditionsJson !== undefined) update.conditionsJson = data.conditionsJson;
  if (data.drawType != null) update.drawType = data.drawType;
  if (data.dailyMessage !== undefined) update.dailyMessage = data.dailyMessage;
  if (data.buttonText !== undefined) update.buttonText = data.buttonText;
  if (data.buttonUrl !== undefined) update.buttonUrl = data.buttonUrl;
  if (data.reminderEnabled !== undefined) update.reminderEnabled = data.reminderEnabled;
  if (data.reminderIntervalHours !== undefined) update.reminderIntervalHours = data.reminderIntervalHours;
  if (data.reminderDeadlineHoursBefore !== undefined) update.reminderDeadlineHoursBefore = data.reminderDeadlineHoursBefore;

  const contest = await prisma.contest.update({
    where: { id },
    data: update as Parameters<typeof prisma.contest.update>[0]["data"],
  });
  return res.json(contest);
}));

contestAdminRouter.patch("/:id/status", asyncRoute(async (req, res) => {
  const id = req.params.id;
  const body = z.object({ status: z.enum(["draft", "active", "ended"]) }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ message: "Укажите status" });
  const contest = await prisma.contest.findUnique({ where: { id } });
  if (!contest) return res.status(404).json({ message: "Конкурс не найден" });
  const now = new Date();
  let newStatus = body.data.status;
  if (newStatus === "active" && contest.startAt <= now && contest.endAt >= now) {
    // ок
  } else if (newStatus === "active") {
    if (contest.startAt > now) newStatus = "draft";
    else if (contest.endAt < now) newStatus = "ended";
  }
  const updated = await prisma.contest.update({
    where: { id },
    data: { status: newStatus },
  });
  return res.json(updated);
}));

/** Превью: сколько участников подходят под условия (без сохранения). */
contestAdminRouter.get("/:id/participants-preview", asyncRoute(async (req, res) => {
  const id = req.params.id;
  const contest = await prisma.contest.findUnique({ where: { id } });
  if (!contest) return res.status(404).json({ message: "Конкурс не найден" });
  const conditions = parseConditions(contest.conditionsJson);
  const participants = await getEligibleParticipants(contest.startAt, contest.endAt, conditions);
  return res.json({
    total: participants.length,
    participants: participants.slice(0, 50).map((p) => ({
      clientId: p.clientId,
      totalDaysBought: p.totalDaysBought,
      paymentsCount: p.paymentsCount,
      ...(p.referralsCount != null && { referralsCount: p.referralsCount }),
    })),
  });
}));

/** Запустить конкурс: отправить уведомление «Конкурс запущен!» всем и выставить status = active. */
contestAdminRouter.post("/:id/launch", asyncRoute(async (req, res) => {
  const id = req.params.id;
  const result = await sendContestStartNotification(id);
  if (!result.ok) return res.status(400).json({ message: result.error });
  return res.json({ message: "Конкурс запущен, уведомление отправлено", sent: result.sent, errors: result.errors });
}));

/** Провести розыгрыш (выбрать победителей и применить призы balance). */
contestAdminRouter.post("/:id/draw", asyncRoute(async (req, res) => {
  const id = req.params.id;
  const result = await runDraw(id);
  if (!result.ok) return res.status(400).json({ message: result.error });
  sendContestDrawResults(id).catch((e) => console.error("[contest] sendContestDrawResults error:", e));
  return res.json({ message: "Розыгрыш проведён", winners: result.winners });
}));

contestAdminRouter.delete("/:id", asyncRoute(async (req, res) => {
  const id = req.params.id;
  await prisma.contest.delete({ where: { id } });
  return res.status(204).send();
}));
