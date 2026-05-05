#!/bin/sh
# Старт API: migrate deploy → node.
#
# Сценарии:
# 1) Обычный апгрейд: migrate deploy проходит — сразу node.
# 2) P3009 (зависшая failed-запись): resolve --rolled-back → снова deploy (без resolve --applied).
# 3) P3005: БД с данными, но без истории Prisma — clone_bots при необходимости, drift → schema,
#    baseline всех миграций, deploy.
# 4) Greenfield (только чистая установка): lexsort имён миграций ломает deploy на пустой БД
#    (раньше применяются инкременты без базовых таблиц). Тогда допустим ТОЛЬКО если в public
#    нет «настоящих» таблиц — только _prisma_migrations и/или pending_* — иначе это прод с
#    рассинхроном: автоматический DROP SCHEMA запрещён, нужен бэкап и ручной ремонт.
#
# Важно: шаг diff (P3005 / greenfield) может быть деструктивным — бэкап перед первым прод-запуском.

set -eu
cd /app

log() {
  printf '%s\n' "[docker-entrypoint] $*"
}

# Помечает все папки prisma/migrations как применённые (после ручного приведения схемы к schema.prisma).
apply_baseline_all() {
  log "baseline: migrate resolve --applied для всех миграций"
  for dir in $(ls -1d prisma/migrations/*/ 2>/dev/null | LC_ALL=C sort); do
    [ -d "$dir" ] || continue
    name=$(basename "$dir")
    case $name in migration_lock.toml) continue ;; esac
    [ -f "$dir/migration.sql" ] || continue
    log "  resolve --applied $name"
    code=0
    out=$(npx prisma migrate resolve --applied "$name" 2>&1) || code=$?
    printf '%s\n' "$out"
    if [ "$code" -ne 0 ]; then
      case "$out" in *P3008*|*"already recorded"*) ;; *)
        log "migrate resolve --applied $name завершился с ошибкой (см. выше)"
        return 1
      ;; esac
    fi
  done
  return 0
}

if [ -z "${DATABASE_URL:-}" ]; then
  log "ERROR: DATABASE_URL is not set"
  exit 1
fi

MIGRATE_LOG=$(mktemp)
DRIFT_SQL=""
GF_SQL=""
cleanup() {
  rm -f "$MIGRATE_LOG"
  [ -n "$DRIFT_SQL" ] && rm -f "$DRIFT_SQL"
  [ -n "$GF_SQL" ] && rm -f "$GF_SQL"
}
trap cleanup EXIT INT TERM

# reconcile_schema_drift — после успешного migrate deploy сверяет фактическую схему
# БД с schema.prisma через `prisma migrate diff`. Если diff непустой (например
# миграции помечены applied, но их SQL по факту не выполнился — частый случай при
# восстановлении БД из старого бэкапа, прерванной миграции, ручном DROP, или
# полной переустановке поверх существующего volume) — генерируем недостающий DDL
# и применяем через `db execute`. Никогда не пытается выполнить full migration.sql
# повторно, поэтому работает даже при ЧАСТИЧНОМ drift'е (одна таблица создалась,
# другая — нет).
#
# Безопасно для случая «всё ок»: diff будет пустым, ничего не применится.
# Безопасно для всех destruktive-операций: diff может включать DROP только если
# в schema.prisma убрали модель — но в нашем релиз-цикле новые версии добавляют
# поля и таблицы, не удаляют, поэтому DROP не появится.
reconcile_schema_drift() {
  if ! command -v psql >/dev/null 2>&1; then return 0; fi
  POST_DRIFT_SQL=$(mktemp)
  if ! npx prisma migrate diff \
      --from-url "$DATABASE_URL" \
      --to-schema-datamodel prisma/schema.prisma \
      --script >"$POST_DRIFT_SQL" 2>/dev/null; then
    rm -f "$POST_DRIFT_SQL"
    return 0
  fi
  # Пустой результат или только пробелы = схема уже в синке
  if ! [ -s "$POST_DRIFT_SQL" ] || ! grep -q '[^[:space:]]' "$POST_DRIFT_SQL"; then
    rm -f "$POST_DRIFT_SQL"
    return 0
  fi
  log "schema drift detected post-deploy: применяю недостающий DDL ($(wc -c <"$POST_DRIFT_SQL" | tr -d " ") байт)"
  if npx prisma db execute --url "$DATABASE_URL" --file "$POST_DRIFT_SQL" 2>&1; then
    log "schema drift fix: применён успешно"
  else
    log "WARNING: schema drift SQL дал ошибку — возможно частичное применение, но API попробует стартовать"
  fi
  rm -f "$POST_DRIFT_SQL"
}

if npx prisma migrate deploy >"$MIGRATE_LOG" 2>&1; then
  cat "$MIGRATE_LOG" || true
  log "migrate deploy: OK"
  reconcile_schema_drift
  exec node dist/index.js
fi

cat "$MIGRATE_LOG" >&2 || true

# P3009: в _prisma_migrations висит failed-миграция (started без finished). Снимаем
# через rolled-back и снова migrate deploy — миграция выполнится заново. Нельзя сразу
# resolve --applied: при P3018 (нет таблицы) это помечало миграцию применённой без SQL.
if grep -q "P3009" "$MIGRATE_LOG"; then
  log "P3009: в истории есть failed-миграция, пытаюсь её снять"
  # Имена папок миграций: YYYYMMDD_name (8 цифр) или YYYYMMDDHHMMSS_name (14+)
  STUCK=$(grep -oE "[0-9]{8,}_[A-Za-z0-9_]+" "$MIGRATE_LOG" | head -1 || true)
  if [ -z "$STUCK" ]; then
    log "ERROR: P3009, но не получилось вычислить имя зависшей миграции из лога"
    exit 1
  fi
  log "  resolve --rolled-back $STUCK"
  npx prisma migrate resolve --rolled-back "$STUCK" || true
  log "повторный migrate deploy после снятия P3009"
  if npx prisma migrate deploy >"$MIGRATE_LOG" 2>&1; then
    cat "$MIGRATE_LOG" || true
    log "migrate deploy: OK (после P3009 recovery)"
    reconcile_schema_drift
    exec node dist/index.js
  fi
  cat "$MIGRATE_LOG" >&2 || true
  log "migrate deploy после P3009 recovery не прошёл — смотрю greenfield / другие ветки"
fi

if ! grep -q "P3005" "$MIGRATE_LOG"; then
  # Greenfield только если в БД ещё нет рабочей схемы: допустимы лишь _prisma_migrations и
  # pending_* (артефакт частичного migrate). Любая другая таблица = уже не «пустой инсталл» —
  # DROP SCHEMA запрещён, чтобы не уничтожить прод при рассинхроне истории миграций.
  if command -v psql >/dev/null 2>&1; then
    only_bootstrap_tables=$(psql "$DATABASE_URL" -t -A -c "SELECT NOT EXISTS (SELECT 1 FROM information_schema.tables t WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE' AND t.table_name NOT IN ('_prisma_migrations', 'pending_telegram_links', 'pending_email_links'));" 2>/dev/null) || only_bootstrap_tables=f
    only_bootstrap_tables=$(printf '%s' "$only_bootstrap_tables" | tr -d '[:space:]')
    clients_missing=$(psql "$DATABASE_URL" -t -A -c "SELECT (to_regclass('public.clients') IS NULL);" 2>/dev/null) || clients_missing=t
    clients_missing=$(printf '%s' "$clients_missing" | tr -d '[:space:]')
    if [ "$only_bootstrap_tables" = "t" ]; then
      log "greenfield: в public только служебные таблицы (или пусто) — безопасный сброс и полная схема из Prisma + baseline миграций"
      psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c 'DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;' || {
        log "ERROR: не удалось сбросить schema public (нужны права владельца БД)"
        exit 1
      }
      GF_SQL=$(mktemp)
      if ! npx prisma migrate diff \
        --from-empty \
        --to-schema-datamodel prisma/schema.prisma \
        --script >"$GF_SQL" 2>/tmp/gf.stderr; then
        log "migrate diff --from-empty failed:"
        cat /tmp/gf.stderr >&2 || true
        rm -f /tmp/gf.stderr
        exit 1
      fi
      rm -f /tmp/gf.stderr
      if ! [ -s "$GF_SQL" ] || ! grep -q '[^[:space:]]' "$GF_SQL"; then
        log "ERROR: migrate diff --from-empty дал пустой SQL"
        exit 1
      fi
      log "применяю полную схему ($(wc -c <"$GF_SQL" | tr -d " ") байт)"
      npx prisma db execute --url "$DATABASE_URL" --file "$GF_SQL" || {
        log "ERROR: db execute полной схемы не прошёл"
        exit 1
      }
      rm -f "$GF_SQL"
      GF_SQL=""
      apply_baseline_all || exit 1
      log "migrate deploy (после greenfield baseline)"
      if npx prisma migrate deploy; then
        log "migrate deploy: OK (greenfield)"
        exec node dist/index.js
      fi
      log "ERROR: migrate deploy после greenfield всё ещё падает — см. лог выше"
      exit 1
    fi
    if [ "$only_bootstrap_tables" != "t" ] && [ "$clients_missing" = "t" ]; then
      log "ERROR: migrate deploy не прошёл, нет public.clients, но в БД уже есть таблицы кроме _prisma_migrations / pending_*. Автосброс public отключён (это не чистая установка). Бэкап → migrate resolve / восстановление из дампа."
      exit 1
    fi
  fi
  log "migrate deploy failed — не P3005 и не P3009 (и не greenfield). См. лог выше."
  exit 1
fi

log "P3005: БД не пустая без истории Prisma Migrate — clone_bots (при необходимости), drift, baseline"

CLONE_SQL="prisma/migrations/20260502160000_clone_bots/migration.sql"
if [ ! -f "$CLONE_SQL" ]; then
  log "ERROR: не найден $CLONE_SQL"
  exit 1
fi

if ! command -v psql >/dev/null 2>&1; then
  log "ERROR: нет psql (нужен postgresql-client) для проверки таблицы bots"
  exit 1
fi

bots_missing=$(psql "$DATABASE_URL" -t -A -c "SELECT (to_regclass('public.bots') IS NULL);" 2>/dev/null) || {
  log "ERROR: psql не смог выполнить проверку to_regclass('public.bots')"
  exit 1
}
bots_missing=$(printf '%s' "$bots_missing" | tr -d '[:space:]')

if [ "$bots_missing" = "t" ]; then
  log "таблицы bots нет — применяю $CLONE_SQL (миграция clone_bots)"
  npx prisma db execute --url "$DATABASE_URL" --file "$CLONE_SQL"
else
  log "таблица bots уже есть — шаг clone_bots пропускаю"
fi

DRIFT_SQL=$(mktemp)

if ! npx prisma migrate diff \
  --from-url "$DATABASE_URL" \
  --to-schema-datamodel prisma/schema.prisma \
  --script >"$DRIFT_SQL" 2>/tmp/drift.stderr; then
  log "migrate diff failed:"
  cat /tmp/drift.stderr >&2 || true
  rm -f /tmp/drift.stderr
  exit 1
fi
rm -f /tmp/drift.stderr

# Ненулевой размер и есть непробельные символы — применяем
if [ -s "$DRIFT_SQL" ] && grep -q '[^[:space:]]' "$DRIFT_SQL"; then
  log "применяю drift SQL ($(wc -c <"$DRIFT_SQL" | tr -d " ") байт)"
  DRIFT_OUT=$(mktemp)
  drift_code=0
  npx prisma db execute --url "$DATABASE_URL" --file "$DRIFT_SQL" >"$DRIFT_OUT" 2>&1 || drift_code=$?
  cat "$DRIFT_OUT"
  if [ "$drift_code" -ne 0 ]; then
    # Кейс пользователя: clone_bots SQL был накатан вручную, поэтому drift хочет создать
    # уже существующие объекты (индекс/таблицу/колонку). В таком случае drift «по факту»
    # уже применён — просто пишем предупреждение и продолжаем в baseline.
    if grep -qiE 'already exists|duplicate (key|object|table|column|index)|relation .* already exists' "$DRIFT_OUT"; then
      log "WARNING: drift содержит уже существующие объекты ('already exists'/'duplicate') — считаем что drift применён, продолжаю в baseline"
    else
      rm -f "$DRIFT_OUT"
      log "drift SQL не применился — схема БД всё ещё расходится с schema.prisma. См. лог выше."
      exit 1
    fi
  fi
  rm -f "$DRIFT_OUT"
else
  log "drift SQL пуст — схема уже совпадает с schema.prisma, только baseline записей"
fi

apply_baseline_all || exit 1

log "migrate deploy (после baseline)"
npx prisma migrate deploy

reconcile_schema_drift

exec node dist/index.js
