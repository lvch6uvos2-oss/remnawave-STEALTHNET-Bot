/**
 * админ-страница «Заявки на вывод» (USDT TRC20).
 *
 * Список заявок с фильтром по статусу. Действия: одобрить / отклонить.
 * - При approve клиенту автоматически уходит TG-уведомление.
 * - При reject баланс возвращается клиенту атомарно (см. backend).
 */

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/auth";
import { api } from "@/lib/api";
import type { WithdrawalRequestRecord } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Check, X, RefreshCw, Copy } from "lucide-react";
import { fmtMsk } from "@/lib/datetime";

type StatusFilter = "ALL" | "PENDING" | "APPROVED" | "REJECTED";

const STATUS_LABEL: Record<WithdrawalRequestRecord["status"], string> = {
  PENDING: "⏳ Ожидает",
  APPROVED: "✅ Одобрено",
  REJECTED: "❌ Отклонено",
};

const STATUS_COLOR: Record<WithdrawalRequestRecord["status"], string> = {
  PENDING: "bg-amber-500/20 text-amber-300 border-amber-500/30",
  APPROVED: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  REJECTED: "bg-rose-500/20 text-rose-300 border-rose-500/30",
};

export function WithdrawalsPage() {
  const { state } = useAuth();
  const token = state.accessToken ?? null;

  const [items, setItems] = useState<WithdrawalRequestRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<StatusFilter>("PENDING");
  const [processing, setProcessing] = useState<string | null>(null);

  const load = async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.getWithdrawals(token, filter === "ALL" ? undefined : filter);
      setItems(res.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, filter]);

  const handleApprove = async (id: string) => {
    if (!token) return;
    if (!confirm("Одобрить заявку? Клиенту придёт уведомление в Telegram.\n\nДеньги переводи на USDT TRC20 кошелёк вручную после нажатия.")) return;
    setProcessing(id);
    try {
      await api.approveWithdrawal(token, id);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Ошибка одобрения");
    } finally {
      setProcessing(null);
    }
  };

  const handleReject = async (id: string) => {
    if (!token) return;
    const comment = prompt("Причина отклонения (необязательно):");
    if (comment === null) return;
    if (!confirm("Отклонить заявку? Баланс автоматически вернётся клиенту.")) return;
    setProcessing(id);
    try {
      await api.rejectWithdrawal(token, id, comment.trim() || undefined);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Ошибка отклонения");
    } finally {
      setProcessing(null);
    }
  };

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // ignore
    }
  };

  const clientLabel = (c: WithdrawalRequestRecord["client"]) => {
    if (c.telegramUsername) return `@${c.telegramUsername}`;
    if (c.email) return c.email;
    if (c.telegramId) return `TG:${c.telegramId}`;
    return c.id.slice(0, 8);
  };

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">💰 Заявки на вывод</h1>
          <p className="text-sm text-muted-foreground mt-1">USDT TRC20 · Минимальная сумма заявки 3000₽</p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Обновить
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {(["PENDING", "APPROVED", "REJECTED", "ALL"] as StatusFilter[]).map((s) => (
          <Button
            key={s}
            variant={filter === s ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter(s)}
          >
            {s === "ALL" ? "Все" : STATUS_LABEL[s as WithdrawalRequestRecord["status"]]}
          </Button>
        ))}
      </div>

      {error && (
        <Card className="border-rose-500/30 bg-rose-500/10">
          <CardContent className="p-4">
            <p className="text-rose-300 text-sm">❌ {error}</p>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : items.length === 0 ? (
        <Card className="border-white/10">
          <CardContent className="p-8 text-center text-muted-foreground">
            Нет заявок {filter !== "ALL" ? `(статус: ${STATUS_LABEL[filter as WithdrawalRequestRecord["status"]]})` : ""}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <Card key={item.id} className="border-white/10 overflow-hidden">
              <CardContent className="p-4 sm:p-5 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`${STATUS_COLOR[item.status]} border rounded-full px-2.5 py-0.5 text-xs font-semibold`}>
                        {STATUS_LABEL[item.status]}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {fmtMsk(item.createdAt)}
                      </span>
                    </div>
                    <p className="text-2xl font-bold">{item.amount.toFixed(2)} ₽</p>
                  </div>
                  {item.status === "PENDING" && (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="default"
                        className="bg-emerald-600 hover:bg-emerald-700 text-white"
                        onClick={() => handleApprove(item.id)}
                        disabled={processing === item.id}
                      >
                        {processing === item.id ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />}
                        Одобрить
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleReject(item.id)}
                        disabled={processing === item.id}
                      >
                        <X className="h-4 w-4 mr-2" />
                        Отклонить
                      </Button>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  <div className="space-y-1">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Клиент</p>
                    <p className="font-medium">{clientLabel(item.client)}</p>
                    {item.client.telegramId && (
                      <p className="text-xs text-muted-foreground">TG ID: <code>{item.client.telegramId}</code></p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Кошелёк TRC20</p>
                    <div className="flex items-center gap-2">
                      <code className="text-xs bg-muted/40 px-2 py-1 rounded break-all">{item.walletTrc20}</code>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 shrink-0"
                        onClick={() => copyText(item.walletTrc20)}
                        title="Скопировать кошелёк"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>

                {item.adminComment && (
                  <div className="text-sm pt-2 border-t border-white/10">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Комментарий админа</p>
                    <p className="text-muted-foreground">{item.adminComment}</p>
                  </div>
                )}

                {item.processedAt && (
                  <p className="text-xs text-muted-foreground">
                    Обработано: {fmtMsk(item.processedAt)}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export default WithdrawalsPage;
