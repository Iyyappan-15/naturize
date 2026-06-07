const ipMap = new Map();

/**
 * Basic in-memory rate limiter for serverless functions.
 * Protects against basic scraping and bot abuse per instance.
 * @param {object} req - The incoming request object
 * @param {number} limit - Max requests per window (default: 15)
 * @param {number} windowMs - Time window in milliseconds (default: 60000ms / 1 min)
 * @returns {object} { success: boolean, ip: string }
 */
export default function checkRateLimit(req, limit = 15, windowMs = 60000) {
  // Extract client IP address (Vercel provides x-forwarded-for)
  const ip = req.headers['x-forwarded-for'] || req.connection?.remoteAddress || '127.0.0.1';
  
  const now = Date.now();
  const record = ipMap.get(ip);
  
  if (!record) {
    // First request from this IP
    ipMap.set(ip, { count: 1, startTime: now });
    return { success: true, ip };
  }
  
  if (now - record.startTime > windowMs) {
    // Time window expired, reset counter
    ipMap.set(ip, { count: 1, startTime: now });
    return { success: true, ip };
  }
  
  if (record.count >= limit) {
    // Rate limit exceeded
    return { success: false, ip };
  }
  
  // Increment counter
  record.count += 1;
  return { success: true, ip };
}
