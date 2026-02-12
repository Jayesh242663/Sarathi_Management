FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci && npm cache clean --force

# Copy source code
COPY . .

# Expose port (GCP Cloud Run will override PORT environment variable)
EXPOSE 8080

# Set NODE_ENV for production
ENV NODE_ENV=production

# Health check (uses PORT environment variable if set, defaults to 8080 for Cloud Run)
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "const port = process.env.PORT || 8080; require('http').get('http://localhost:' + port + '/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Run as non-root user for security
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001
USER nodejs

# Start the application
CMD ["node", "src/index.js"]
