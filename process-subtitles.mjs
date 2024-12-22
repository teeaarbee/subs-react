import pkg from 'pg';
const { Pool } = pkg;
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import SrtParser2 from 'srt-parser-2';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Database configuration
const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:CES9BgXN7QKR@ep-still-cloud-a19ffcgp.ap-southeast-1.aws.neon.tech/neondb?sslmode=require',
  ssl: {
    rejectUnauthorized: false
  }
});

// Initialize SRT parser
const parser = new SrtParser2();

// Add this constant at the top
const BATCH_SIZE = 1000; // Adjust based on your needs

// Create tables if they don't exist
async function initializeDatabase() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS subtitles (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(255),
        line_number INTEGER,
        start_time VARCHAR(50),
        end_time VARCHAR(50),
        text TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE INDEX IF NOT EXISTS idx_subtitles_text ON subtitles USING gin(to_tsvector('english', text));
      CREATE INDEX IF NOT EXISTS idx_filename ON subtitles(filename);
    `);
  } finally {
    client.release();
  }
}

// Improved SQL string escaping
function escapeSqlString(str) {
  if (!str) return 'NULL';
  // Remove any non-printable characters and escape special characters
  return `E'${str
    .replace(/[\x00-\x1F\x7F-\x9F]/g, '') // Remove control characters
    .replace(/\\/g, '\\\\')    // Escape backslashes
    .replace(/'/g, "''")       // Escape single quotes
    .replace(/\$/g, '\\$')     // Escape dollar signs
    .replace(/\n/g, ' ')       // Replace newlines with spaces
    .trim()}'`;
}

// Modified processSrtFile to use parameterized queries
async function processSrtFile(filePath) {
  const filename = path.basename(filePath);
  const content = fs.readFileSync(filePath, 'utf-8');
  const subtitles = parser.fromSrt(content);
  
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Process in smaller chunks to avoid query size limits
    const chunkSize = 100;
    for (let i = 0; i < subtitles.length; i += chunkSize) {
      const chunk = subtitles.slice(i, i + chunkSize);
      
      // Use parameterized query
      const values = chunk.map((subtitle, idx) => [
        filename,
        i + idx + 1,
        subtitle.startTime,
        subtitle.endTime,
        subtitle.text
      ]);
      
      const placeholders = values.map((_, idx) => 
        `($${idx * 5 + 1}, $${idx * 5 + 2}, $${idx * 5 + 3}, $${idx * 5 + 4}, $${idx * 5 + 5})`
      ).join(',');
      
      const flatValues = values.flat();
      
      await client.query(`
        INSERT INTO subtitles (filename, line_number, start_time, end_time, text)
        VALUES ${placeholders}
      `, flatValues);
    }
    
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(`Error processing file ${filename}:`, error);
    // Log more details about the failing subtitle
    console.error('File content sample:', content.slice(0, 200));
  } finally {
    client.release();
  }
}

// Process multiple files in batches
async function processAllSrtFiles(baseDir) {
  // Get all files from all seasons upfront
  const allFiles = [];
  const seasons = fs.readdirSync(baseDir).filter(item => 
    fs.statSync(path.join(baseDir, item)).isDirectory() && 
    item.startsWith('friends-season-')
  );

  seasons.forEach(season => {
    const seasonPath = path.join(baseDir, season);
    const files = fs.readdirSync(seasonPath)
      .filter(file => file.endsWith('.srt'))
      .map(file => path.join(seasonPath, file));
    allFiles.push(...files);
  });

  // Process files in batches
  const batches = [];
  for (let i = 0; i < allFiles.length; i += BATCH_SIZE) {
    const batch = allFiles.slice(i, i + BATCH_SIZE);
    batches.push(batch);
  }

  // Process each batch in parallel
  for (const batch of batches) {
    await Promise.all(batch.map(file => {
      console.log(`Processing: ${file}`);
      return processSrtFile(file);
    }));
  }
}

// Main execution
async function main() {
  try {
    await initializeDatabase();
    const baseDir = 'C:\\Users\\TRB\\Downloads\\Besttt Prime\\Dec\\Friends Subtitles';
    await processAllSrtFiles(baseDir);
    console.log('Processing complete!');
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

main(); 