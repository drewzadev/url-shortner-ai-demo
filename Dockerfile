FROM node:18-alpine AS base

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create app directory
WORKDIR /usr/src/app

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S urlshortener -u 1001

FROM base AS deps

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

FROM base AS build

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev dependencies)
RUN npm ci

# Copy source code
COPY . .

# Generate Prisma client
RUN npx prisma generate

FROM base AS runtime

# Set environment
ENV NODE_ENV=production
ENV PORT=3000

# Copy runtime dependencies
COPY --from=deps --chown=urlshortener:nodejs /usr/src/app/node_modules ./node_modules

# Copy application code
COPY --from=build --chown=urlshortener:nodejs /usr/src/app .

# Create directories with proper permissions
RUN mkdir -p logs && chown urlshortener:nodejs logs

# Switch to non-root user
USER urlshortener

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# Start application
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "url-shortener.js"]