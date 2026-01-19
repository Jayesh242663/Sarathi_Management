import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';

import auth from './middleware/auth.js';
import errorHandler from './middleware/error.js';
import { isSupabaseConfigured } from './config/supabase.js';

import authRouter from './routes/auth.js';
import coursesRouter from './routes/courses.js';
import batchesRouter from './routes/batches.js';
import studentsRouter from './routes/students.js';
import dataRouter from './routes/data.js';
import paymentsRouter from './routes/payments.js';
import placementInstallmentsRouter from './routes/placement-installments.js';
import placementsRouter from './routes/placements.js';

const app = express();
const port = process.env.PORT || 3001;

// CORS: restrict to configured origins - require explicit allowlist
const allowedOrigins = (process.env.CORS_ORIGIN || '').split(',').map(o => o.trim()).filter(Boolean);
const corsOptions = {
  origin: (origin, callback) => {
    // Require explicit origin configuration
    if (allowedOrigins.length === 0) {
      return callback(new Error('CORS_ORIGIN not configured - all origins blocked'));
    }
    // Allow requests with no origin (like mobile apps, curl requests)
    if (!origin) return callback(null, true);
    // Check if origin is in allowlist
    if (allowedOrigins.includes(origin)) return callback(null, true);
    // Reject origin not in allowlist
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};
app.use(cors(corsOptions));

// Security headers and gzip
app.use(helmet());
app.use(compression());
app.use(express.json());
app.use(auth);

// Health check endpoint (no /api prefix for Docker)
app.get('/health', (req, res) => {
  res.json({ status: 'ok', supabaseConfigured: isSupabaseConfigured });
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true, supabaseConfigured: isSupabaseConfigured });
});

// Debug endpoint to check loaded routes - ONLY in development
if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'staging') {
  app.get('/api/routes', (req, res) => {
    res.json({
      message: 'Available routes:',
      routes: [
        '/api/health',
        '/api/routes',
        '/api/data/test (TEST - check Supabase connection)',
        '/api/data/snapshot',
        '/api/auth/login',
        '/api/auth/register',
        '/api/students',
        '/api/payments',
        '/api/placements',
        '/api/placement-installments',
        '/api/courses',
        '/api/batches'
      ]
    });
  });
}

// Basic rate limit for auth routes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/auth', authLimiter, authRouter);
app.use('/api/courses', coursesRouter);
app.use('/api/batches', batchesRouter);
app.use('/api/students', studentsRouter);
app.use('/api/payments', paymentsRouter);
app.use('/api/placements', placementsRouter);
app.use('/api/placement-installments', placementInstallmentsRouter);
app.use('/api/data', dataRouter);

app.use((req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

app.use(errorHandler);

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`[server] Listening on http://localhost:${port}`);
});
