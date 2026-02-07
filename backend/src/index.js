import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import fs from 'fs';
import path from 'path';

import auth from './middleware/auth.js';
import errorHandler from './middleware/error.js';
import { isSupabaseConfigured } from './config/supabase.js';

import authRouter from './routes/auth.js';
import coursesRouter from './routes/courses.js';
import batchesRouter from './routes/batches.js';
import studentsRouter from './routes/students.js';
import dataRouter from './routes/data.js';
import paymentsRouter from './routes/payments.js';
import expensesRouter from './routes/expenses.js';
import placementInstallmentsRouter from './routes/placement-installments.js';
import placementsRouter from './routes/placements.js';

const app = express();
const port = process.env.PORT || 3001;

// CORS: restrict to configured origins - require explicit allowlist
const allowedOrigins = (process.env.CORS_ORIGIN || '').split(',').map(o => o.trim()).filter(Boolean);
const isProduction = ['production', 'staging'].includes(process.env.NODE_ENV);

// Validate CORS configuration in production
if (isProduction && allowedOrigins.length === 0) {
  console.warn('[CORS] WARNING: CORS_ORIGIN not configured in production. CORS will block all cross-origin requests.');
  console.warn('[CORS] Set CORS_ORIGIN environment variable to comma-separated list of allowed origins.');
  console.warn('[CORS] Example: CORS_ORIGIN=https://example.com,https://app.example.com');
}

const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman, curl, etc)
    if (!origin) return callback(null, true);

    // Check if origin is in whitelist
    const isAllowed = allowedOrigins.includes(origin);

    if (isProduction) {
      // In production, require whitelist (but allow if not configured - will cause request to fail, but with proper CORS headers for debugging)
      if (allowedOrigins.length === 0) {
        // No whitelist configured - reject but with error message
        return callback(null, false); // Reject but still send CORS headers
      }
      if (isAllowed) {
        return callback(null, true);
      }
      return callback(null, false); // Reject but still send CORS headers
    }

    // In development, be more lenient
    if (allowedOrigins.length > 0 && !isAllowed) {
      return callback(null, false);
    }

    // No whitelist in development - allow
    return callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 3600
};
app.use(cors(corsOptions));

// Request logging
if (process.env.NODE_ENV === 'development') {
  // Development: Log to console in a compact format
  app.use(morgan(':method :url :status :res[content-length] - :response-time ms'));
} else {
  // Production: Log to file with full details
  const logDir = path.join(process.cwd(), 'logs');
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }

  const accessLogStream = fs.createWriteStream(
    path.join(logDir, 'access.log'),
    { flags: 'a' }
  );

  const logFormat = ':remote-addr - :remote-user [:date[clf]] ":method :url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent" :response-time ms';
  app.use(morgan(logFormat, { stream: accessLogStream }));
}

// Security headers and gzip
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", 'https://iuebuvwifmlgiptmotjh.supabase.co'],
    }
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  },
  frameguard: {
    action: 'deny'  // Prevent clickjacking attacks
  },
  noSniff: true,  // Prevent MIME type sniffing
  referrerPolicy: {
    policy: 'strict-origin-when-cross-origin'  // Control referrer information
  },
  xssFilter: true,  // Enable XSS filter
  hidePoweredBy: true  // Hide X-Powered-By header
}));

// Redirect HTTP to HTTPS in production
if (isProduction) {
  app.use((req, res, next) => {
    const forwarded = req.header('x-forwarded-proto');
    if (forwarded && forwarded !== 'https') {
      res.redirect(`https://${req.header('host')}${req.url}`);
    } else {
      next();
    }
  });
}

app.use(compression());
app.use(express.json({ 
  limit: '1mb'  // Limit request body size to prevent DoS
}));
app.use(cookieParser());
app.use(auth);

// Health check endpoint (no /api prefix for Docker)
// Public endpoint - doesn't expose sensitive info
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Health check endpoint (API version)
// Returns basic status only - no sensitive configuration info
app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

// Debug endpoint to check loaded routes - ONLY in development with authentication
if (process.env.NODE_ENV === 'development') {
  app.get('/api/debug/routes', auth, (req, res, next) => {
    // Only available in development mode
    res.json({
      message: 'Available routes (development only):',
      routes: [
        '/api/health',
        '/api/auth/login',
        '/api/auth/register',
        '/api/students',
        '/api/payments',
        '/api/expenses',
        '/api/placements',
        '/api/placement-installments',
        '/api/courses',
        '/api/batches'
      ]
    });
  });
}

// Strict rate limit for login/register (prevent brute force)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 5,                     // 5 attempts per 15 min
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many login attempts, please try again after 15 minutes',
  skip: (req) => {
    // Skip this limiter for session/refresh endpoints
    return req.path === '/session' || req.path === '/refresh';
  }
});

// Lenient rate limit for session/token refresh (30 per minute)
const sessionLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,    // 1 minute
  max: 30,                     // Allow 30 requests per minute for session checks
  skipSuccessfulRequests: false,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many session checks. Please wait a moment.'
});

// Global rate limiter for all API endpoints (reduced for security)
const globalLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,    // 1 minute
  max: 60,                    // Reduced to 60 requests per minute
  skipSuccessfulRequests: false,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many requests. Please slow down.'
});

// Financial operations rate limiter - stricter for payment/placement operations
const financialLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,    // 1 minute
  max: 30,                    // 30 financial operations per minute max
  skipSuccessfulRequests: false,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many financial operations. Please wait a moment.'
});

// API v1 routes - stable, versioned
app.use('/api/v1/', globalLimiter);
// Auth routes with granular rate limiting
app.use('/api/v1/auth/session', sessionLimiter, authRouter);
app.use('/api/v1/auth/refresh', sessionLimiter, authRouter);
app.use('/api/v1/auth', authLimiter, authRouter);
app.use('/api/v1/courses', coursesRouter);
app.use('/api/v1/batches', batchesRouter);
app.use('/api/v1/students', studentsRouter);
app.use('/api/v1/payments', financialLimiter, paymentsRouter);
app.use('/api/v1/expenses', financialLimiter, expensesRouter);
app.use('/api/v1/placements', placementsRouter);
app.use('/api/v1/placement-installments', financialLimiter, placementInstallmentsRouter);
app.use('/api/v1/data', dataRouter);

// Backward compatibility - legacy routes (deprecated)
// Auth routes with granular rate limiting
app.use('/api/auth/session', sessionLimiter, authRouter);
app.use('/api/auth/refresh', sessionLimiter, authRouter);
app.use('/api/auth', authLimiter, authRouter);
app.use('/api/courses', coursesRouter);
app.use('/api/batches', batchesRouter);
app.use('/api/students', studentsRouter);
app.use('/api/payments', financialLimiter, paymentsRouter);
app.use('/api/expenses', financialLimiter, expensesRouter);
app.use('/api/placements', placementsRouter);
app.use('/api/placement-installments', financialLimiter, placementInstallmentsRouter);
app.use('/api/data', dataRouter);

app.use((req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

app.use(errorHandler);

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`[server] Listening on http://localhost:${port}`);
});
