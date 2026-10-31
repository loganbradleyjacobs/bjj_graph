#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
DB_CONFIG_FILE="${BJJ_ENV_FILE:-$HOME/secrets/bjj_db.env}"

if [ ! -f "$DB_CONFIG_FILE" ]; then
  mkdir -p "$(dirname "$DB_CONFIG_FILE")"
  chmod 700 "$(dirname "$DB_CONFIG_FILE")"
  cat > "$DB_CONFIG_FILE" <<'EOF'
# MySQL Database Configuration
MYSQL_HOST=localhost
MYSQL_USER=root
MYSQL_PASSWORD=
MYSQL_DATABASE=bjj
MYSQL_PORT=3306
EOF
  chmod 600 "$DB_CONFIG_FILE"
  echo "Created $DB_CONFIG_FILE — set MYSQL_PASSWORD, then re-run."
  exit 1
fi

# Export everything so child python processes see the DB config
set -a
# shellcheck disable=SC1090
source "$DB_CONFIG_FILE"
set +a
export DOTENV_PATH="$DB_CONFIG_FILE"

MYSQL_PASSWORD="${MYSQL_PASSWORD:-}"
MYSQL_PORT="${MYSQL_PORT:-3306}"

command -v mysql   >/dev/null || { echo "Error: mysql client not found."; exit 1; }
command -v python3 >/dev/null || { echo "Error: python3 not found."; exit 1; }

mysql_exec() {
  MYSQL_PWD="$MYSQL_PASSWORD" mysql \
    --host="$MYSQL_HOST" --user="$MYSQL_USER" --port="$MYSQL_PORT" "$@"
}

echo "Creating database '$MYSQL_DATABASE'..."
mysql_exec <<SQL
CREATE DATABASE IF NOT EXISTS \`$MYSQL_DATABASE\`;
SQL

if [ -f "$PROJECT_DIR/schema.sql" ]; then
  echo "Creating tables from schema.sql..."
  mysql_exec "$MYSQL_DATABASE" < "$PROJECT_DIR/schema.sql"
else
  echo "Error: schema.sql not found"; exit 1
fi

if [ -f "$PROJECT_DIR/migrate.py" ]; then
  echo "Running data migration..."
  python3 "$PROJECT_DIR/migrate.py"
else
  echo "Error: migrate.py not found"; exit 1
fi

echo "Verifying connection..."
python3 - <<'PY'
import os, sys, mysql.connector
try:
    conn = mysql.connector.connect(
        host=os.environ["MYSQL_HOST"],
        user=os.environ["MYSQL_USER"],
        password=os.environ.get("MYSQL_PASSWORD", ""),
        database=os.environ["MYSQL_DATABASE"],
        port=int(os.environ.get("MYSQL_PORT", "3306")),
        charset="utf8mb4",
    )
    cur = conn.cursor()
    cur.execute("SELECT COUNT(*) FROM nodes")
    n = cur.fetchone()[0]
    cur.close(); conn.close()
except Exception as e:
    print(f"Error: {e}"); sys.exit(1)
if n == 0:
    print("Error: database appears to be empty"); sys.exit(1)
print(f"Successfully connected — {n} nodes")
PY

printf '\nDatabase setup completed successfully!\n'
printf 'Start the app with:\n  cd %s\n  uvicorn app:app --reload\n' "$PROJECT_DIR"