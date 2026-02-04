import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import morgan from 'morgan';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Configure Morgan request logging
 */
export function setupRequestLogging(app, isDev) {
  if (isDev) {
    // Development: Log to console in a compact format
    app.use(morgan(':method :url :status :res[content-length] - :response-time ms'));
  } else {
    // Production: Log to file with full details
    const logDir = path.join(__dirname, '../../logs');
    
    // Create logs directory if it doesn't exist
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    // Create a write stream (in append mode)
    const accessLogStream = fs.createWriteStream(
      path.join(logDir, 'access.log'),
      { flags: 'a' }
    );

    // Log format: combined with timestamp
    const logFormat = ':remote-addr - :remote-user [:date[clf]] ":method :url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent" :response-time ms';
    
    app.use(morgan(logFormat, { stream: accessLogStream }));
  }
}
