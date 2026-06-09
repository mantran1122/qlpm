# Database Backup Script — QL Phòng Máy
# Usage: chạy bằng cron mỗi ngày lúc 2:00 AM
# Windows: Task Scheduler
# Linux/macOS: 0 2 * * * /path/to/scripts/backup-db.sh

# Lấy DATABASE_URL từ file .env gốc
# Cần đặt biến môi trường hoặc chỉnh trực tiếp trong script
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="./backups/db"
mkdir -p "$BACKUP_DIR"

# Extract MySQL connection từ DATABASE_URL
# DATABASE_URL=mysql://user:password@host:port/database
MYSQL_USER="root"
MYSQL_PASS=""
MYSQL_HOST="localhost"
MYSQL_PORT="3306"
MYSQL_DB="phong_may_db"

echo "Backing up $MYSQL_DB..."

mysqldump -h "$MYSQL_HOST" -P "$MYSQL_PORT" -u "$MYSQL_USER" -p"$MYSQL_PASS" \
  --single-transaction --routines --triggers --events \
  "$MYSQL_DB" | gzip > "$BACKUP_DIR/${DATE}.sql.gz"

echo "Backup saved to $BACKUP_DIR/${DATE}.sql.gz"

# Giữ 30 bản backup gần nhất
ls -t "$BACKUP_DIR"/*.sql.gz | tail -n +31 | xargs rm -f 2>/dev/null

echo "Done."
