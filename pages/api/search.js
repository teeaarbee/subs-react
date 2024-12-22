import { Pool } from 'pg';
import NodeCache from 'node-cache';

// Replace S3 and WorkerPool with PostgreSQL pool
const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:CES9BgXN7QKR@ep-still-cloud-a19ffcgp.ap-southeast-1.aws.neon.tech/neondb',
  ssl: {
    rejectUnauthorized: false
  }
});

// Keep the cache initialization
const searchCache = new NodeCache({ 
  stdTTL: process.env.CACHE_TTL || 3600,
  maxKeys: process.env.MAX_CACHE_SIZE || 100
});

export default async function handler(req, res) {
  // Add CORS and cache headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=7200');
  
  // Set timeout for Vercel
  res.socket.setTimeout(20000); // 20 second timeout
  
  if (!process.env.DATABASE_URL) {
    console.error('Missing database configuration');
    return res.status(500).json({ 
      message: 'Server configuration error' 
    });
  }

  const { searchWord } = req.body;
  if (!searchWord || searchWord.length < 2) {
    return res.status(400).json({ message: 'Search term must be at least 2 characters' });
  }

  const cacheKey = searchWord.toLowerCase();
  const cachedResult = searchCache.get(cacheKey);
  if (cachedResult) {
    console.log('Cache hit for:', searchWord);
    return res.status(200).json(cachedResult);
  }

  try {
    // Updated query to match the subtitles table structure
    const query = `
      SELECT filename, start_time as timestamp_start, text
      FROM subtitles
      WHERE text ILIKE $1
      ORDER BY filename, line_number
      LIMIT 100
    `;
    
    const searchPattern = `%${searchWord}%`;
    const { rows } = await pool.query(query, [searchPattern]);

    const result = {
      occurrences: rows.map(row => ({
        fileName: row.filename,
        timestamp: row.timestamp_start,
        subtitleText: row.text
      })),
      totalCount: rows.length,
      isPartial: rows.length === 100
    };
    
    searchCache.set(cacheKey, result);
    return res.status(200).json(result);

  } catch (error) {
    console.error('Search error:', {
      message: error.message,
      stack: error.stack,
      code: error.code
    });
    return res.status(500).json({ 
      message: 'Error processing search', 
      error: error.message,
      code: error.code || 'UNKNOWN_ERROR'
    });
  }
}
