import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  BookOpen,
  Check,
  Copy,
  History,
  Key,
  Loader2,
  Pencil,
  Plus,
  Power,
  Shield,
  Trash2,
  X,
  Clock,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/contexts/auth";
import { api, type ApiKeyListItem, type ApiKeyUsageItem } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { fmtMsk, fmtMskDate } from "@/lib/datetime";

// --- Helpers ---

function parseAllowedIps(json: string | null): string[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.filter((s: unknown): s is string => typeof s === "string") : [];
  } catch {
    return [];
  }
}

function isExpired(iso: string | null | undefined): boolean {
  if (!iso) return false;
  return new Date(iso).getTime() < Date.now();
}

function formatExpiry(iso: string | null): { label: string; tone: "ok" | "warn" | "bad" | "none" } {
  if (!iso) return { label: "Без срока", tone: "none" };
  const d = new Date(iso);
  const ms = d.getTime() - Date.now();
  if (ms < 0) return { label: `Истёк ${fmtMskDate(d)}`, tone: "bad" };
  const days = Math.floor(ms / 86_400_000);
  if (days < 7) return { label: `Истекает через ${days} дн.`, tone: "warn" };
  return { label: `Истекает ${fmtMskDate(d)}`, tone: "ok" };
}

function presetExpiry(preset: "30d" | "90d" | "180d" | "365d" | "never"): string | null {
  if (preset === "never") return null;
  const d = new Date();
  const days = preset === "30d" ? 30 : preset === "90d" ? 90 : preset === "180d" ? 180 : 365;
  d.setUTCDate(d.getUTCDate() + days);
  // Округляем до начала суток UTC
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

// --- Component ---

export function ApiKeysPage() {
  const token = useAuth().state.accessToken!;
  const [items, setItems] = useState<ApiKeyListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [expiryPreset, setExpiryPreset] = useState<"30d" | "90d" | "180d" | "365d" | "never">("never");
  const [allowedIpsRaw, setAllowedIpsRaw] = useState("");
  const [creating, setCreating] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [usageId, setUsageId] = useState<string | null>(null);
  const [usageItems, setUsageItems] = useState<ApiKeyUsageItem[]>([]);
  const [usageLoading, setUsageLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.getApiKeys(token);
      setItems(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка загрузки ключей");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const parseIpList = (raw: string): string[] => {
    return raw
      .split(/[\n,;]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  };

  const createKey = async () => {
    if (!name.trim()) return;
    try {
      setCreating(true);
      setError(null);
      const ips = parseIpList(allowedIpsRaw);
      const data = await api.createApiKey(token, {
        name: name.trim(),
        description: description.trim() || undefined,
        expiresAt: presetExpiry(expiryPreset),
        allowedIps: ips.length > 0 ? ips : null,
      });
      setNewKey(data.rawKey);
      setName("");
      setDescription("");
      setAllowedIpsRaw("");
      setExpiryPreset("never");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка создания ключа");
    } finally {
      setCreating(false);
    }
  };

  const copyNewKey = async () => {
    if (!newKey) return;
    await navigator.clipboard.writeText(newKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const openUsage = async (id: string) => {
    setUsageId(id);
    setUsageLoading(true);
    try {
      const data = await api.getApiKeyUsage(token, id, 100);
      setUsageItems(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось загрузить лог");
    } finally {
      setUsageLoading(false);
    }
  };

  return (
    <div className="space-y-5 px-4 sm:px-6 md:px-8 pt-6 pb-10 relative">
      <div className="fixed -z-10 bg-primary/15 blur-[120px] top-[-50px] left-[-50px] w-[300px] h-[300px] rounded-full pointer-events-none" />
      <div className="fixed -z-10 bg-purple-500/10 blur-[100px] top-[20%] right-[-50px] w-[250px] h-[250px] rounded-full pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between bg-background/40 backdrop-blur-3xl border border-white/10 p-6 rounded-[2rem] shadow-2xl"
      >
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-primary/20 to-purple-500/20 flex items-center justify-center shadow-inner border border-white/10">
            <Key className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/60">
              API ключи
            </h1>
            <p className="text-sm text-muted-foreground mt-1">Управление ключами для внешней интеграции</p>
          </div>
        </div>
        <Link to="/admin/api-docs">
          <Button variant="outline" size="sm" className="gap-1.5 rounded-xl">
            <BookOpen className="h-4 w-4" />
            Документация
          </Button>
        </Link>
      </motion.div>

      {error && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-red-500/30 bg-red-500/10 backdrop-blur-md px-4 py-3 text-sm text-red-500 dark:text-red-400 flex items-center gap-2"
        >
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </motion.div>
      )}

      <Card className="bg-background/60 backdrop-blur-3xl border-white/10 rounded-[2rem] p-5 shadow-xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 border border-white/10 flex items-center justify-center shadow-inner shrink-0">
            <Plus className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-bold tracking-tight">Создать ключ</h3>
            <p className="text-xs text-muted-foreground">Имя — для идентификации интеграции; срок и IP-белый список — опциональны</p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            placeholder="Название (mobile-app)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded-xl bg-foreground/[0.03] dark:bg-white/[0.02] border-white/10 focus-visible:ring-primary/50"
          />
          <Input
            placeholder="Описание (опционально)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="rounded-xl bg-foreground/[0.03] dark:bg-white/[0.02] border-white/10 focus-visible:ring-primary/50"
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 mt-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              Срок действия
            </label>
            <div className="flex gap-1 flex-wrap">
              {(["30d", "90d", "180d", "365d", "never"] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setExpiryPreset(p)}
                  className={cn(
                    "rounded-xl border px-3 py-1.5 text-xs transition-all",
                    expiryPreset === p
                      ? "bg-primary/15 border-primary/40 text-primary"
                      : "bg-foreground/[0.03] dark:bg-white/[0.02] border-white/10 text-muted-foreground hover:border-white/20"
                  )}
                >
                  {p === "30d" && "30 дней"}
                  {p === "90d" && "3 месяца"}
                  {p === "180d" && "6 месяцев"}
                  {p === "365d" && "1 год"}
                  {p === "never" && "Без срока"}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1.5">
              <Shield className="h-3.5 w-3.5" />
              IP-белый список (через запятую или с новой строки, поддержка CIDR)
            </label>
            <Input
              placeholder="например: 203.0.113.5, 192.0.2.0/24"
              value={allowedIpsRaw}
              onChange={(e) => setAllowedIpsRaw(e.target.value)}
              className="rounded-xl bg-foreground/[0.03] dark:bg-white/[0.02] border-white/10 focus-visible:ring-primary/50"
            />
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <Button onClick={createKey} disabled={creating || !name.trim()} className="gap-2 min-w-[160px]">
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Создать
          </Button>
        </div>
      </Card>

      {newKey && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="bg-emerald-500/[0.04] backdrop-blur-3xl border border-emerald-500/30 rounded-[2rem] p-5 shadow-xl">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-emerald-500/25 to-emerald-500/5 border border-white/10 flex items-center justify-center shadow-inner shrink-0">
                <Check className="h-5 w-5 text-emerald-500 dark:text-emerald-400" />
              </div>
              <div>
                <h3 className="text-sm font-bold tracking-tight">Новый ключ создан</h3>
                <p className="text-xs text-muted-foreground">Показывается один раз — скопируйте сейчас</p>
              </div>
            </div>
            <code className="block rounded-xl border border-white/10 bg-foreground/[0.05] dark:bg-black/40 px-4 py-3 break-all font-mono text-xs">
              {newKey}
            </code>
            <Button variant="outline" size="sm" onClick={copyNewKey} className="mt-3 gap-1.5 rounded-xl">
              {copied ? <Check className="h-4 w-4 text-emerald-500 dark:text-emerald-400" /> : <Copy className="h-4 w-4" />}
              {copied ? "Скопировано" : "Скопировать"}
            </Button>
          </Card>
        </motion.div>
      )}

      {loading ? (
        <Card className="bg-background/60 backdrop-blur-3xl border-white/10 rounded-[2rem] py-12 shadow-xl flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </Card>
      ) : !items.length ? (
        <Card className="bg-background/60 backdrop-blur-3xl border-white/10 rounded-[2rem] py-12 shadow-xl flex flex-col items-center text-center">
          <div className="h-16 w-16 rounded-full bg-white/5 flex items-center justify-center mb-3 border border-white/10">
            <Key className="h-8 w-8 text-muted-foreground" />
          </div>
          <p className="text-muted-foreground">Пока нет ключей</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {items.map((k, i) => (
            <ApiKeyRow
              key={k.id}
              k={k}
              i={i}
              isEditing={editingId === k.id}
              onEdit={() => setEditingId(k.id)}
              onCancelEdit={() => setEditingId(null)}
              onSaved={async () => {
                setEditingId(null);
                await load();
              }}
              onToggle={async () => {
                await api.toggleApiKey(token, k.id, !k.isActive);
                await load();
              }}
              onDelete={async () => {
                if (!confirm(`Удалить ключ "${k.name}"? Действие необратимо.`)) return;
                await api.deleteApiKey(token, k.id);
                await load();
              }}
              onUsage={() => openUsage(k.id)}
              token={token}
            />
          ))}
        </div>
      )}

      <AnimatePresence>
        {usageId && (
          <UsageModal
            keyName={items.find((k) => k.id === usageId)?.name ?? ""}
            items={usageItems}
            loading={usageLoading}
            onClose={() => setUsageId(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// --- Row ---

function ApiKeyRow({
  k,
  i,
  isEditing,
  onEdit,
  onCancelEdit,
  onSaved,
  onToggle,
  onDelete,
  onUsage,
  token,
}: {
  k: ApiKeyListItem;
  i: number;
  isEditing: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSaved: () => void;
  onToggle: () => void;
  onDelete: () => void;
  onUsage: () => void;
  token: string;
}) {
  const allowedIps = useMemo(() => parseAllowedIps(k.allowedIps), [k.allowedIps]);
  const expiry = useMemo(() => formatExpiry(k.expiresAt), [k.expiresAt]);
  const expired = isExpired(k.expiresAt);

  if (isEditing) {
    return <EditRow k={k} token={token} onCancel={onCancelEdit} onSaved={onSaved} />;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: i * 0.03 }}
      whileHover={{ y: -1 }}
    >
      <Card className="relative overflow-hidden bg-background/60 backdrop-blur-3xl border-white/10 rounded-2xl p-4 shadow-lg hover:shadow-xl hover:border-white/20 transition-all duration-300">
        <div
          className={cn(
            "absolute left-0 top-0 bottom-0 w-1 rounded-r-full bg-gradient-to-b",
            expired
              ? "from-red-500 to-red-500/30"
              : k.isActive
              ? "from-emerald-500 to-emerald-500/30"
              : "from-muted-foreground/40 to-transparent"
          )}
        />
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div
              className={cn(
                "h-9 w-9 rounded-xl border flex items-center justify-center shrink-0",
                expired
                  ? "bg-red-500/10 text-red-500 border-red-500/20"
                  : k.isActive
                  ? "bg-emerald-500/10 text-emerald-500 dark:text-emerald-400 border-emerald-500/20"
                  : "bg-foreground/[0.05] dark:bg-white/[0.05] text-muted-foreground border-white/10"
              )}
            >
              <Key className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="font-semibold truncate">{k.name}</div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5 flex-wrap">
                <span className="font-mono">{k.prefix}…</span>
                <span>·</span>
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium",
                    expired
                      ? "bg-red-500/10 text-red-500 border-red-500/20"
                      : k.isActive
                      ? "bg-emerald-500/10 text-emerald-500 dark:text-emerald-400 border-emerald-500/20"
                      : "bg-foreground/[0.05] dark:bg-white/[0.05] text-muted-foreground border-white/10"
                  )}
                >
                  {expired ? "Истёк" : k.isActive ? "Активен" : "Отключён"}
                </span>
                <span>·</span>
                <span
                  className={cn(
                    "inline-flex items-center gap-1",
                    expiry.tone === "bad" && "text-red-500 dark:text-red-400",
                    expiry.tone === "warn" && "text-amber-500 dark:text-amber-400"
                  )}
                >
                  <Clock className="h-3 w-3" />
                  {expiry.label}
                </span>
                {allowedIps.length > 0 && (
                  <>
                    <span>·</span>
                    <span className="inline-flex items-center gap-1">
                      <Shield className="h-3 w-3" />
                      {allowedIps.length} IP
                    </span>
                  </>
                )}
              </div>
              {k.description && <div className="text-xs text-muted-foreground mt-0.5">{k.description}</div>}
              {k.lastUsedAt && (
                <div className="text-[10px] text-muted-foreground/80 mt-0.5">
                  Последний запрос: {fmtMsk(k.lastUsedAt)}
                  {k.lastUsedIp && ` · ${k.lastUsedIp}`}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="outline" size="sm" className="gap-1.5 rounded-xl" onClick={onUsage}>
              <History className="h-3.5 w-3.5" />
              Лог
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5 rounded-xl" onClick={onEdit}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5 rounded-xl" onClick={onToggle}>
              <Power className="h-3.5 w-3.5" />
              {k.isActive ? "Откл." : "Вкл."}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 rounded-xl border-red-500/30 text-red-500 dark:text-red-400 hover:bg-red-500/10 hover:border-red-500/50"
              onClick={onDelete}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </Card>
    </motion.div>
  );
}

// --- Edit Row ---

function EditRow({
  k,
  token,
  onCancel,
  onSaved,
}: {
  k: ApiKeyListItem;
  token: string;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(k.name);
  const [description, setDescription] = useState(k.description ?? "");
  const [expiresAtRaw, setExpiresAtRaw] = useState(
    k.expiresAt ? new Date(k.expiresAt).toISOString().slice(0, 10) : ""
  );
  const [allowedIpsRaw, setAllowedIpsRaw] = useState(parseAllowedIps(k.allowedIps).join(", "));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setErr(null);
    try {
      const ips = allowedIpsRaw
        .split(/[\n,;]+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      let expiresAt: string | null = null;
      if (expiresAtRaw) {
        // YYYY-MM-DD → end of day UTC
        const d = new Date(expiresAtRaw + "T23:59:59.000Z");
        if (!isNaN(d.getTime())) expiresAt = d.toISOString();
      }
      await api.updateApiKey(token, k.id, {
        name: name.trim() || k.name,
        description: description.trim() || null,
        expiresAt,
        allowedIps: ips.length > 0 ? ips : null,
      });
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="bg-background/60 backdrop-blur-3xl border-primary/30 rounded-2xl p-4 shadow-lg">
      <div className="flex items-center gap-3 mb-3">
        <Pencil className="h-4 w-4 text-primary" />
        <h4 className="font-semibold text-sm">Редактирование ключа</h4>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          placeholder="Название"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="rounded-xl bg-foreground/[0.03] dark:bg-white/[0.02] border-white/10"
        />
        <Input
          placeholder="Описание"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="rounded-xl bg-foreground/[0.03] dark:bg-white/[0.02] border-white/10"
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 mt-3">
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" />
            Срок действия (пусто = без срока)
          </label>
          <Input
            type="date"
            value={expiresAtRaw}
            onChange={(e) => setExpiresAtRaw(e.target.value)}
            className="rounded-xl bg-foreground/[0.03] dark:bg-white/[0.02] border-white/10"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1.5">
            <Shield className="h-3.5 w-3.5" />
            IP-белый список
          </label>
          <Input
            placeholder="203.0.113.5, 192.0.2.0/24"
            value={allowedIpsRaw}
            onChange={(e) => setAllowedIpsRaw(e.target.value)}
            className="rounded-xl bg-foreground/[0.03] dark:bg-white/[0.02] border-white/10"
          />
        </div>
      </div>
      {err && (
        <div className="mt-3 text-xs text-red-500 flex items-center gap-1.5">
          <AlertTriangle className="h-3.5 w-3.5" />
          {err}
        </div>
      )}
      <div className="flex gap-2 justify-end mt-4">
        <Button variant="outline" size="sm" onClick={onCancel} disabled={saving}>
          <X className="h-3.5 w-3.5 mr-1.5" />
          Отмена
        </Button>
        <Button size="sm" onClick={save} disabled={saving}>
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Check className="h-3.5 w-3.5 mr-1.5" />}
          Сохранить
        </Button>
      </div>
    </Card>
  );
}

// --- Usage Modal ---

function UsageModal({
  keyName,
  items,
  loading,
  onClose,
}: {
  keyName: string;
  items: ApiKeyUsageItem[];
  loading: boolean;
  onClose: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-2 sm:p-6"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 30, opacity: 0 }}
        className="w-full max-w-3xl bg-background/95 backdrop-blur-3xl border border-white/10 rounded-3xl shadow-2xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-white/10">
          <div className="flex items-center gap-3">
            <History className="h-5 w-5 text-primary" />
            <div>
              <h3 className="font-bold tracking-tight">Журнал использования</h3>
              <p className="text-xs text-muted-foreground">{keyName} · последние 100 запросов</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={onClose} className="rounded-xl">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="overflow-y-auto p-3">
          {loading ? (
            <div className="py-12 flex justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : items.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground text-sm">Пока нет запросов</div>
          ) : (
            <div className="space-y-1.5">
              {items.map((u) => (
                <div
                  key={u.id}
                  className="flex items-center gap-3 text-xs px-3 py-2 rounded-xl bg-foreground/[0.02] dark:bg-white/[0.02] border border-white/5 hover:border-white/10 transition-colors"
                >
                  <span
                    className={cn(
                      "inline-flex items-center justify-center min-w-[42px] rounded-md px-1.5 py-0.5 font-mono text-[10px] font-bold",
                      u.statusCode >= 500
                        ? "bg-red-500/10 text-red-500 border border-red-500/20"
                        : u.statusCode >= 400
                        ? "bg-amber-500/10 text-amber-500 border border-amber-500/20"
                        : "bg-emerald-500/10 text-emerald-500 dark:text-emerald-400 border border-emerald-500/20"
                    )}
                  >
                    {u.statusCode}
                  </span>
                  <span className="font-mono font-semibold text-primary min-w-[48px]">{u.method}</span>
                  <span className="font-mono truncate flex-1" title={u.path}>
                    {u.path}
                  </span>
                  <span className="text-muted-foreground tabular-nums whitespace-nowrap">
                    {fmtMsk(u.ts)}
                  </span>
                  {u.ip && (
                    <span className="font-mono text-muted-foreground hidden md:inline">{u.ip}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
