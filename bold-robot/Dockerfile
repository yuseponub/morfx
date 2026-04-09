FROM mcr.microsoft.com/playwright:v1.58.2-noble

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY . .

# Create screenshots directory for debug artifacts
RUN mkdir -p /app/screenshots

# Create state directory to persist Playwright storage state (skip re-login after 2FA)
RUN mkdir -p /app/state

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8080/api/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

ENV PORT=8080
EXPOSE 8080

CMD ["node", "server.js"]
