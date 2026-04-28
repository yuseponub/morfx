#!/bin/bash
# Wrapper for cron — runs the blast experiment script.
# Logs output to godentist/pacientes-data/blast-experiment/logs/

cd /mnt/c/Users/Usuario/Proyectos/morfx-new

LOG_DIR="godentist/pacientes-data/blast-experiment/logs"
mkdir -p "$LOG_DIR"

TIMESTAMP=$(TZ='America/Bogota' date '+%Y-%m-%d_%H%M')
LOG_FILE="$LOG_DIR/cron_${TIMESTAMP}.log"

echo "=== Blast cron started at $(TZ='America/Bogota' date) ===" >> "$LOG_FILE"

# Load nvm/node (cron context has minimal env — Pitfall 5)
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

npx tsx scripts/godentist-blast-experiment.ts >> "$LOG_FILE" 2>&1

echo "=== Blast cron finished at $(TZ='America/Bogota' date) ===" >> "$LOG_FILE"
