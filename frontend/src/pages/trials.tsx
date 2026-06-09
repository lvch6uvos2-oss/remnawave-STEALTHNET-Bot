/**
 * админ-страница управления Trial-пресетами.
 *
 * Несколько триалов, каждый привязан к одному из тарифов (наследует squads/devices/traffic),
 * длительность задаётся отдельно. Один клиент = одна активация каждого триала.
 *
 * UI: таблица + модалка создания/редактирования. Сделано простой формой, без лишних украшений.
 */

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/auth";
import { api } from "@/lib/api";
import type { TrialRecord, CreateTrialPayload, TariffCategoryWithTariffs } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, Pencil, Loader2 } from "lucide-react";

type FlatTariff = { id: string; name: string; categoryName: string };

export function TrialsPage() {
  const { state } = useAuth();
  const token = state.accessToken ?? null;

  const [trials, setTrials] = useState<TrialRecord[]>([]);
  const [tariffsFlat, setTariffsFlat] = useState<FlatTariff[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<"add" | { edit: TrialRecord } | null>(null);

  const load = async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const [trialsRes, catsRes] = await Promise.all([
        api.getTrials(token),
        api.getTariffCategories(token),
      ]);
      setTrials(trialsRes.items);
      const flat: FlatTariff[] = [];
      for (const c of catsRes.items as TariffCategoryWithTariffs[]) {
        for (const t of c.tariffs) {
          flat.push({ id: t.id, name: t.name, categoryName: c.name });
        }
      }
      setTariffsFlat(flat);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const handleDelete = async (id: string) => {
    if (!token || !confirm("Удалить триал? Уже активированные клиентами подписки останутся живыми, но потеряют пометку.")) return;
    try {
      await api.deleteTrial(token, id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка удаления");
    }
  };

  const handleToggleEnabled = async (t: TrialRecord) => {
    if (!token) return;
    try {
      await api.updateTrial(token, t.id, { enabled: !t.enabled });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка обновления");
    }
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">🎁 Триалы (пробные подписки)</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Несколько триалов, каждый привязан к тарифу. Клиент может активировать каждый — один раз.
            Когда клиент использует все доступные триалы, кнопка «Получить пробную» в боте скроется.
          </p>
        </div>
        <Button onClick={() => setModal("add")} className="gap-2">
          <Plus className="h-4 w-4" />
          Добавить триал
        </Button>
      </div>

      {error && (
        <Card className="p-4 bg-red-500/10 border-red-500/40 text-sm text-red-200">
          ❌ {error}
        </Card>
      )}

      {loading && (
        <Card className="p-8 flex items-center justify-center text-muted-foreground gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          Загрузка триалов…
        </Card>
      )}

      {!loading && trials.length === 0 && (
        <Card className="p-8 text-center text-muted-foreground">
          Триалов нет. Создайте первый — он появится в боте кнопкой «Получить пробную подписку».
        </Card>
      )}

      {!loading && trials.length > 0 && (
        <Card className="p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-card/40">
              <tr className="text-left">
                <th className="px-4 py-3 font-medium">Порядок</th>
                <th className="px-4 py-3 font-medium">Название</th>
                <th className="px-4 py-3 font-medium">Тариф</th>
                <th className="px-4 py-3 font-medium">Дней</th>
                <th className="px-4 py-3 font-medium">Активен</th>
                <th className="px-4 py-3 font-medium text-right">Действия</th>
              </tr>
            </thead>
            <tbody>
              {trials.map((t) => (
                <tr key={t.id} className="border-t border-white/5 hover:bg-white/5">
                  <td className="px-4 py-3">{t.sortOrder}</td>
                  <td className="px-4 py-3 font-medium">{t.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{t.tariffName ?? "—"}</td>
                  <td className="px-4 py-3">{t.durationDays}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleToggleEnabled(t)}
                      className={`px-2 py-1 rounded text-xs ${t.enabled ? "bg-emerald-500/20 text-emerald-300" : "bg-zinc-500/20 text-zinc-400"}`}
                    >
                      {t.enabled ? "✅ Включен" : "⏸ Выключен"}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="ghost" onClick={() => setModal({ edit: t })} className="gap-1">
                        <Pencil className="h-3 w-3" /> Редактировать
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => handleDelete(t.id)} className="text-red-400 gap-1">
                        <Trash2 className="h-3 w-3" /> Удалить
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {modal && (
        <TrialFormDialog
          mode={modal === "add" ? "add" : "edit"}
          trial={modal !== "add" ? modal.edit : undefined}
          tariffs={tariffsFlat}
          onClose={() => setModal(null)}
          onSaved={async () => {
            setModal(null);
            await load();
          }}
        />
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Модалка создания/редактирования триала.

function TrialFormDialog({
  mode,
  trial,
  tariffs,
  onClose,
  onSaved,
}: {
  mode: "add" | "edit";
  trial?: TrialRecord;
  tariffs: FlatTariff[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { state } = useAuth();
  const token = state.accessToken ?? null;

  const [name, setName] = useState(trial?.name ?? "");
  const [tariffId, setTariffId] = useState(trial?.tariffId ?? tariffs[0]?.id ?? "");
  const [durationDays, setDurationDays] = useState<number>(trial?.durationDays ?? 3);
  // отдельный лимит трафика триала в ГБ (пусто = из тарифа).
  // BigInt в БД, в UI работаем в ГБ для удобства администратора.
  const initialTrialGb = trial?.trafficLimitBytes != null
    ? (Number(trial.trafficLimitBytes) / (1024 ** 3)).toFixed(2).replace(/\.?0+$/, "")
    : "";
  const [trialTrafficGb, setTrialTrafficGb] = useState<string>(initialTrialGb);
  const [enabled, setEnabled] = useState(trial?.enabled ?? true);
  const [sortOrder, setSortOrder] = useState<number>(trial?.sortOrder ?? 0);
  const [description, setDescription] = useState(trial?.description ?? "");

  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handleSave = async () => {
    if (!token) return;
    if (!name.trim() || !tariffId || durationDays < 1) {
      setErr("Заполните название, выберите тариф и укажите длительность ≥ 1.");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      // T16 (12.05.2026) — ГБ → байты (BigInt в БД).
      // Пустая строка / 0 / NaN → null (используется лимит тарифа).
      let trafficLimitBytes: number | null = null;
      if (trialTrafficGb.trim()) {
        const gb = parseFloat(trialTrafficGb.replace(",", "."));
        if (Number.isFinite(gb) && gb > 0) {
          trafficLimitBytes = Math.floor(gb * 1024 ** 3);
        }
      }
      const payload: CreateTrialPayload = {
        name: name.trim(),
        tariffId,
        durationDays,
        trafficLimitBytes,
        enabled,
        sortOrder,
        description: description.trim() || null,
      };
      if (mode === "edit" && trial) {
        await api.updateTrial(token, trial.id, payload);
      } else {
        await api.createTrial(token, payload);
      }
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <Card className="w-full max-w-lg p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold">
          {mode === "add" ? "🎁 Новый триал" : "✏️ Редактировать триал"}
        </h2>

        {err && (
          <div className="p-2 rounded bg-red-500/10 border border-red-500/40 text-xs text-red-200">
            ❌ {err}
          </div>
        )}

        <div className="grid gap-1">
          <Label htmlFor="trial-name" className="text-xs">Название (видно клиенту в боте)</Label>
          <Input
            id="trial-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="🎁 Пробная Стандартная"
          />
        </div>

        <div className="grid gap-1">
          <Label htmlFor="trial-tariff" className="text-xs">Тариф (наследует squads, устройства, трафик)</Label>
          <select
            id="trial-tariff"
            value={tariffId}
            onChange={(e) => setTariffId(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            {tariffs.length === 0 && <option value="">— Сначала создайте тариф —</option>}
            {tariffs.map((t) => (
              <option key={t.id} value={t.id}>
                {t.categoryName} — {t.name}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1">
            <Label htmlFor="trial-days" className="text-xs">Длительность (дней)</Label>
            <Input
              id="trial-days"
              type="number"
              min={1}
              max={365}
              value={durationDays}
              onChange={(e) => setDurationDays(Math.max(1, parseInt(e.target.value) || 1))}
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="trial-order" className="text-xs">Порядок (0 — сверху)</Label>
            <Input
              id="trial-order"
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(parseInt(e.target.value) || 0)}
            />
          </div>
        </div>

        {/* отдельный лимит трафика для триала. */}
        <div className="grid gap-1">
          <Label htmlFor="trial-traffic-gb" className="text-xs">
            Лимит трафика триала (ГБ) <span className="text-[10px] opacity-60">пусто = брать из тарифа</span>
          </Label>
          <Input
            id="trial-traffic-gb"
            type="text"
            inputMode="decimal"
            placeholder="например 5 (для 5 ГБ)"
            value={trialTrafficGb}
            onChange={(e) => setTrialTrafficGb(e.target.value)}
          />
          <p className="text-[10px] text-muted-foreground">
            Если задан — на время триала клиент получит именно столько ГБ. При конвертации в платную подписку выставляется полный лимит из тарифа.
          </p>
        </div>

        <div className="grid gap-1">
          <Label htmlFor="trial-desc" className="text-xs">Описание (опц., показывается клиенту)</Label>
          <textarea
            id="trial-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Бесплатная пробная подписка на стандартный тариф на 3 дня..."
            rows={3}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs"
          />
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="h-4 w-4"
          />
          Активен (виден в боте)
        </label>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Отмена
          </Button>
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {mode === "add" ? "Создать" : "Сохранить"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
