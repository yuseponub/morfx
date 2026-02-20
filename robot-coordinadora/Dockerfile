# Robot Coordinadora - Production Docker Image
# Uses official Playwright image (includes Chromium + all system dependencies)

FROM mcr.microsoft.com/playwright:v1.52.0-noble

WORKDIR /app

# Copy package files first (Docker cache layer optimization)
COPY package*.json ./

# Install production dependencies only
RUN npm ci --omit=dev

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Create storage directories
RUN mkdir -p storage/sessions storage/artifacts

# Health check for Railway
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD curl -f http://localhost:3001/api/health || exit 1

# Default port (Railway may override via PORT env var)
EXPOSE 3001

# Start the compiled application
CMD ["node", "dist/index.js"]
