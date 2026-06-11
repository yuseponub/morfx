#!/bin/bash
# Wrapper for cron — runs the prima promoción campaign script.
# Logs output to godentist/pacientes-data/prima-promocion/logs/

cd /mnt/c/Users/Usuario/Proyectos/morfx-new

LOG_DIR="godentist/pacientes-data/prima-promocion/logs"
mkdir -p "$LOG_DIR"

TIMESTAMP=$(TZ='America/Bogota' date '+%Y-%m-%d_%H%M')
LOG_FILE="$LOG_DIR/cron_${TIMESTAMP}.log"

echo "=== Prima promoción cron started at $(TZ='America/Bogota' date) ===" >> "$LOG_FILE"

# Load nvm/node (cron context has minimal env)
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

npx tsx scripts/godentist-prima-promocion-campaign.ts >> "$LOG_FILE" 2>&1

echo "=== Prima promoción cron finished at $(TZ='America/Bogota' date) ===" >> "$LOG_FILE"
