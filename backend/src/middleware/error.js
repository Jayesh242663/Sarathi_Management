export default function errorHandler(err, req, res, next) {
  const isDev = process.env.NODE_ENV !== 'production';
  const status = err.status || err.statusCode || 500;

  // Log full error details server-side
  // eslint-disable-next-line no-console
  console.error('[Error]', {
    timestamp: new Date().toISOString(),
    status,
    path: req.path,
    method: req.method,
    userId: req.user?.id,
    message: err.message,
    name: err.name,
    ...(isDev && { stack: err.stack })
  });

  // Ensure response is not already sent
  if (res.headersSent) {
    return next(err);
  }

  // Determine client-facing error message
  let clientMessage = err.message;
  
  // Hide sensitive information in production
  if (!isDev) {
    // Don't expose database errors, file paths, or implementation details
    if (status === 500 || status === 503) {
      clientMessage = 'An error occurred. Please try again later.';
    } else if (err.message?.includes('password') || err.message?.includes('token')) {
      clientMessage = 'Authentication error occurred.';
    } else if (err.message?.includes('database') || err.message?.includes('query')) {
      clientMessage = 'A database error occurred.';
    } else if (err.message?.includes('ENOENT') || err.message?.includes('EACCES')) {
      clientMessage = 'An error occurred.';
    }
  }

  // Always include CORS headers in error responses
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Credentials', 'true');

  res.status(status).json({
    error: clientMessage,
    ...(isDev && { details: err.message, code: err.code })
  });
}
