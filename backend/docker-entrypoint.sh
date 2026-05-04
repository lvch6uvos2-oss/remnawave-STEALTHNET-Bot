#!/bin/sh
# Старт API: migrate deploy → node.
# Если БД «живая», но без истории Prisma Migrate (ошибка P3005), один раз:
#   0) если нет таблицы public.bots — SQL миграции 20260502160000_clone_bots
#      (backfill bot_id; без этого migrate diff даёт «голый» скрипт и NOT NULL bot_id)
#   1) SQL-дрейф из текущей БД к schema.prisma (migrate diff + db execute), если не пуст
#   2) baseline: migrate resolve --applied для каждой папки (P3008 «уже есть» — пропуск)
#   3) migrate deploy
#
# Важно: шаг diff может содержать деструктивные операции — бэкап перед первым
# запуском на проде. После появления _prisma_migrations этот блок не вызывается.

set -eu
cd /app

log() {
  printf '%s\n' "[docker-entrypoint] $*"
}

if [ -z "${DATABASE_URL:-}" ]; then
  log "ERROR: DATABASE_URL is not set"
  exit 1
fi

MIGRATE_LOG=$(mktemp)
DRIFT_SQL=""
cleanup() {
  rm -f "$MIGRATE_LOG"
  [ -n "$DRIFT_SQL" ] && rm -f "$DRIFT_SQL"
}
trap cleanup EXIT INT TERM

if npx prisma migrate deploy >"$MIGRATE_LOG" 2>&1; then
  cat "$MIGRATE_LOG" || true
  log "migrate deploy: OK"
  exec node dist/index.js
fi

cat "$MIGRATE_LOG" >&2 || true

# P3009: в _prisma_migrations висит failed-миграция от прошлой попытки (не доехала
# до конца, оставила started_at без finished_at). Снимаем её через rolled-back +
# applied и снова пробуем deploy. Только если миграция уже создала свои объекты —
# в противном случае applied не корректен и сюда не попадаем.
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
  log "  resolve --applied $STUCK (полагаемся что схема уже совпадает)"
  npx prisma migrate resolve --applied "$STUCK" || true
  log "повторный migrate deploy после снятия P3009"
  if npx prisma migrate deploy; then
    log "migrate deploy: OK (после P3009 recovery)"
    exec node dist/index.js
  fi
  log "migrate deploy всё ещё не проходит после P3009 recovery — см. лог выше."
  exit 1
fi

if ! grep -q "P3005" "$MIGRATE_LOG"; then
  log "migrate deploy failed — не P3005 и не P3009. См. лог выше."
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

log "baseline: migrate resolve --applied для всех миграций"
# Сортировка по имени папки = хронология YYYYMMDD...
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
      exit 1
    ;; esac
  fi
done

log "migrate deploy (после baseline)"
npx prisma migrate deploy

exec node dist/index.js
