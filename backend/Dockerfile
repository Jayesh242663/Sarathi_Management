FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci && npm cache clean --force

# Copy source code
COPY . .

# Expose port (Cloud Run uses PORT env var, defaults to 8080)
EXPOSE 8080

# Health check with increased tolerance for slow starts
# Increased start-period from 40s to 120s to handle cold starts and DB migrations
HEALTHCHECK --interval=5s --timeout=5s --start-period=120s --retries=10 \
  CMD node -e "const p=process.env.PORT||8080;require('http').get('http://localhost:'+p+'/health',(r)=>{process.exit(r.statusCode===200?0:1)}).on('error',()=>process.exit(1))" || exit 1

# Set NODE_ENV to production
ENV NODE_ENV=production

# Ensure PORT is set for Cloud Run (Cloud Run will override this with PORT=8080)
ENV PORT=8080

# Start the application with detailed logging
CMD ["node", "--trace-uncaught", "src/index.js"]
