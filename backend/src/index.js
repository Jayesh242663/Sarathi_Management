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
import { csrfProtection, generateCsrfToken, csrfErrorHandler } from './middleware/csrf.js';
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
const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman, etc)
    if (!origin) return callback(null, true);

    // In production, require explicit whitelist
    if (isProduction) {
      if (allowedOrigins.length === 0) {
        return callback(new Error('CORS_ORIGIN not configured - all origins blocked'));
      }
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error('Not allowed by CORS'));
    }

    // In development, check whitelist if configured, otherwise allow all
    if (allowedOrigins.length > 0) {
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error('Not allowed by CORS'));
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
  }
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
app.use(cookieParser());  // Required for CSRF protection
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

// CSRF token endpoint - available after authentication
app.get('/api/csrf-token', (req, res) => {
  generateCsrfToken(req, res);
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

// Basic rate limit for auth routes (much stricter)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 5,                     // 5 attempts per 15 min (was 100)
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many login attempts, please try again after 15 minutes'
});

// Global rate limiter for all API endpoints
const globalLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,    // 1 minute
  max: 100,                   // 100 requests per minute
  skipSuccessfulRequests: false,
  standardHeaders: true,
  legacyHeaders: false
});

// API v1 routes - stable, versioned
app.use('/api/v1/', globalLimiter);
app.use('/api/v1/auth', authLimiter, authRouter);  // No CSRF on auth endpoints
app.use('/api/v1/courses', csrfProtection, coursesRouter);
app.use('/api/v1/batches', csrfProtection, batchesRouter);
app.use('/api/v1/students', csrfProtection, studentsRouter);
app.use('/api/v1/payments', csrfProtection, paymentsRouter);
app.use('/api/v1/expenses', csrfProtection, expensesRouter);
app.use('/api/v1/placements', csrfProtection, placementsRouter);
app.use('/api/v1/placement-installments', csrfProtection, placementInstallmentsRouter);
app.use('/api/v1/data', csrfProtection, dataRouter);

// Backward compatibility - legacy routes (deprecated)
app.use('/api/auth', authLimiter, authRouter);  // No CSRF on auth endpoints
app.use('/api/courses', csrfProtection, coursesRouter);
app.use('/api/batches', csrfProtection, batchesRouter);
app.use('/api/students', csrfProtection, studentsRouter);
app.use('/api/payments', csrfProtection, paymentsRouter);
app.use('/api/expenses', csrfProtection, expensesRouter);
app.use('/api/placements', csrfProtection, placementsRouter);
app.use('/api/placement-installments', csrfProtection, placementInstallmentsRouter);
app.use('/api/data', csrfProtection, dataRouter);

app.use(csrfErrorHandler);

app.use((req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

app.use(errorHandler);

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`[server] Listening on http://localhost:${port}`);
});
