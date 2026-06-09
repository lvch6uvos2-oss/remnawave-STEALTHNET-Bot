/**
 * отчёт продаж через баланс.
 * Минималистичная страница для менеджеров-девочек: видят только то, что было оплачено
 * через начисление баланса вручную (provider=balance), без всех остальных платёжек.
 * Доступ — через action `view_balance_sales`.
 */
import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/contexts/auth";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { motion } from "framer-motion";
import { DollarSign, ShoppingCart, Search, CalendarDays, RefreshCw, User, Package, X, Wallet } from "lucide-react";
import { fmtMskShort } from "@/lib/datetime";

function fmtDate(s: string | null) {
  if (!s) return "—";
  try { return fmtMskShort(s); } catch { return s; }
}

function fmtMoney(n: number) {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(n);
}

interface BalanceSaleItem {
  id: string;
  amount: number;
  currency: string;
  tariffName: string | null;
  clientId: string | null;
  clientEmail: string | null;
  clientTelegramId: string | null;
  clientTelegramUsername: string | null;
  paidAt: string | null;
}

export function BalanceSalesPage() {
  const { state } = useAuth();
  const token = state.accessToken;

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [limit] = useState(50);

  const [items, setItems] = useState<BalanceSaleItem[]>([]);
  const [total, setTotal] = useState(0);
  const [totalAmount, setTotalAmount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.getBalanceSales(token, {
        from: from || undefined,
        to: to || undefined,
        search: search || undefined,
        page,
        limit,
      });
      setItems(res.items);
      setTotal(res.total);
      setTotalAmount(res.totalAmount);
      setTotalCount(res.totalCount);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }, [token, from, to, search, page, limit]);

  useEffect(() => { load(); }, [load]);

  function resetFilters() {
    setFrom("");
    setTo("");
    setSearch("");
    setPage(1);
  }

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="space-y-5 px-4 sm:px-6 md:px-8 pt-6 pb-10 relative">
      <div className="fixed -z-10 bg-emerald-500/10 blur-[120px] top-[-50px] left-[-50px] w-[300px] h-[300px] rounded-full pointer-events-none" />

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between bg-background/40 backdrop-blur-3xl border border-white/10 p-6 rounded-[2rem] shadow-2xl"
      >
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-emerald-500/30 to-teal-500/20 flex items-center justify-center shadow-inner border border-white/10">
            <Wallet className="h-6 w-6 text-emerald-500" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/60">
              Продажи через баланс
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Только платежи, оплаченные с баланса клиентов
            </p>
          </div>
        </div>
        <Button onClick={() => load()} variant="outline" className="gap-2 rounded-xl">
          <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} /> Обновить
        </Button>
      </motion.div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card className="bg-background/60 backdrop-blur-3xl border-white/10 rounded-2xl p-5 shadow-xl">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-emerald-500/20 flex items-center justify-center">
              <DollarSign className="h-5 w-5 text-emerald-500" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Сумма продаж</p>
              <p className="text-2xl font-bold">{fmtMoney(totalAmount)}</p>
            </div>
          </div>
        </Card>
        <Card className="bg-background/60 backdrop-blur-3xl border-white/10 rounded-2xl p-5 shadow-xl">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-sky-500/20 flex items-center justify-center">
              <ShoppingCart className="h-5 w-5 text-sky-500" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Кол-во продаж</p>
              <p className="text-2xl font-bold">{totalCount}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Filters */}
      <Card className="bg-background/60 backdrop-blur-3xl border-white/10 rounded-2xl p-5 shadow-xl">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground flex items-center gap-1"><CalendarDays className="h-3 w-3" /> С даты</label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-xl bg-foreground/[0.03] border-white/10" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground flex items-center gap-1"><CalendarDays className="h-3 w-3" /> По дату</label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-xl bg-foreground/[0.03] border-white/10" />
          </div>
          <div className="sm:col-span-2 space-y-1.5">
            <label className="text-xs text-muted-foreground flex items-center gap-1"><Search className="h-3 w-3" /> Поиск (email/TG/тариф)</label>
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="например, manager@example.com" className="rounded-xl bg-foreground/[0.03] border-white/10" />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-3">
          <Button variant="ghost" size="sm" onClick={resetFilters} className="rounded-xl gap-1">
            <X className="h-3.5 w-3.5" /> Сбросить
          </Button>
        </div>
      </Card>

      {/* Table */}
      <Card className="bg-background/60 backdrop-blur-3xl border-white/10 rounded-[2rem] shadow-xl overflow-hidden">
        {error && (
          <div className="bg-rose-500/10 border-b border-rose-500/30 px-5 py-3 text-sm text-rose-500">{error}</div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-white/5">
              <tr className="text-left">
                <th className="px-4 py-3 font-medium text-muted-foreground">Дата</th>
                <th className="px-4 py-3 font-medium text-muted-foreground">Клиент</th>
                <th className="px-4 py-3 font-medium text-muted-foreground">Тариф</th>
                <th className="px-4 py-3 font-medium text-muted-foreground text-right">Сумма</th>
              </tr>
            </thead>
            <tbody>
              {!loading && items.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">Ничего не найдено</td>
                </tr>
              )}
              {items.map((it) => (
                <tr key={it.id} className="border-t border-white/5 hover:bg-white/[0.02] transition-colors">
                  <td className="px-4 py-3 whitespace-nowrap text-xs text-muted-foreground">{fmtDate(it.paidAt)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="h-7 w-7 rounded-lg bg-sky-500/15 flex items-center justify-center shrink-0">
                        <User className="h-3.5 w-3.5 text-sky-500" />
                      </div>
                      <div className="min-w-0">
                        {it.clientEmail && <div className="text-xs font-medium truncate">{it.clientEmail}</div>}
                        {it.clientTelegramUsername && <div className="text-xs text-muted-foreground truncate">@{it.clientTelegramUsername}</div>}
                        {!it.clientEmail && !it.clientTelegramUsername && it.clientTelegramId && <div className="text-xs text-muted-foreground">TG: {it.clientTelegramId}</div>}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5 text-xs">
                      <Package className="h-3 w-3 text-violet-500 shrink-0" />
                      <span className="truncate">{it.tariffName ?? "—"}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <span className="font-bold text-emerald-500">{fmtMoney(it.amount)}</span>
                    <span className="text-[10px] text-muted-foreground ml-1">{it.currency}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-white/5 flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Страница {page} из {totalPages} · всего {total}</span>
            <div className="flex gap-1.5">
              <Button size="sm" variant="outline" className="rounded-lg h-8" disabled={page <= 1} onClick={() => setPage(page - 1)}>Назад</Button>
              <Button size="sm" variant="outline" className="rounded-lg h-8" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Вперёд</Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
