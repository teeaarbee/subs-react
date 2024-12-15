import { S3 } from 'aws-sdk';
import NodeCache from 'node-cache';
import WorkerPool from '../../utils/workerPool';
import { optimizeSearchTerm } from '../../utils/searchOptimizer';

// Initialize with smaller pool and shorter timeout
const workerPool = new WorkerPool(5, 15000); // 15 second timeout

// Initialize the cache with 1 hour TTL
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
  
  if (!process.env.CLOUDFLARE_ACCOUNT_ID || 
      !process.env.CLOUDFLARE_ACCESS_KEY_ID || 
      !process.env.CLOUDFLARE_SECRET_ACCESS_KEY) {
    console.error('Missing required environment variables');
    return res.status(500).json({ 
      message: 'Server configuration error' 
    });
  }

  const { searchWord } = req.body;
  if (!searchWord || searchWord.length < 2) {
    return res.status(400).json({ message: 'Search term must be at least 2 characters' });
  }

  const s3 = new S3({
    endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    accessKeyId: process.env.CLOUDFLARE_ACCESS_KEY_ID,
    secretAccessKey: process.env.CLOUDFLARE_SECRET_ACCESS_KEY,
    region: process.env.CLOUDFLARE_REGION,
    signatureVersion: 'v4',
    httpOptions: { 
      timeout: 15000, // 15 seconds
      connectTimeout: 8000,
      maxRetries: 3
    },
    computeChecksums: false,
    s3ForcePathStyle: true,
    maxRedirects: 3
  });

  const cacheKey = searchWord.toLowerCase();
  const cachedResult = searchCache.get(cacheKey);
  if (cachedResult) {
    console.log('Cache hit for:', searchWord);
    return res.status(200).json(cachedResult);
  }

  try {
    const fileListCacheKey = 'srtFileList';
    let srtFiles = searchCache.get(fileListCacheKey);
    
    if (!srtFiles) {
      const Contents = await listAllObjects(s3, process.env.CLOUDFLARE_BUCKET_NAME);
      srtFiles = Contents.filter(file => file.Key.toLowerCase().endsWith('.srt'));
      searchCache.set(fileListCacheKey, srtFiles, 3600);
    }

    // Instead of limiting to first 10 files, let's process in batches
    const BATCH_SIZE = 5; // Reduce batch size
    const MAX_TOTAL_FILES = 20; // Limit total files processed

    const allFiles = srtFiles
      .filter(file => file.Key.toLowerCase().endsWith('.srt'))
      .slice(0, MAX_TOTAL_FILES); // Limit total files

    console.log(`Processing ${allFiles.length} files`);

    // Process files in batches
    const batches = [];
    for (let i = 0; i < allFiles.length; i += BATCH_SIZE) {
      batches.push(allFiles.slice(i, i + BATCH_SIZE));
    }

    let allOccurrences = [];
    for (const batch of batches) {
      const results = await Promise.all(
        batch.map(file => processFile(file, s3, optimizeSearchTerm(searchWord)))
      );
      allOccurrences = allOccurrences.concat(results.flat());
      
      // Early exit if we found enough results
      if (allOccurrences.length > 100) {
        console.log('Found enough results, stopping early');
        break;
      }
    }

    const result = {
      occurrences: allOccurrences,
      totalCount: allOccurrences.length,
      totalFiles: allFiles.length,
      processedFiles: allFiles.length
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

async function listAllObjects(s3, bucket, prefix = '') {
  let allObjects = [];
  let continuationToken = undefined;
  const MAX_KEYS = 1000;

  try {
    do {
      const params = {
        Bucket: bucket,
        Prefix: prefix,
        MaxKeys: MAX_KEYS,
        ContinuationToken: continuationToken,
        Delimiter: '/'
      };

      const response = await s3.listObjectsV2(params).promise();
      
      // Process files in current directory
      if (response.Contents) {
        const files = response.Contents.filter(obj => {
          const key = obj.Key.toLowerCase();
          return key.endsWith('.srt') && !key.endsWith('/');
        });
        allObjects = allObjects.concat(files);
        console.log(`Found ${files.length} files in ${prefix || 'root'}, total: ${allObjects.length}`);
      }

      // Process subfolders
      if (response.CommonPrefixes && response.CommonPrefixes.length > 0) {
        console.log(`Found folders: ${response.CommonPrefixes.map(p => p.Prefix).join(', ')}`);
        
        // Recursively process each subfolder
        const subfolderPromises = response.CommonPrefixes.map(async ({ Prefix }) => {
          console.log(`Processing folder: ${Prefix}`);
          const subfolderObjects = await listAllObjects(s3, bucket, Prefix);
          return subfolderObjects;
        });

        const subfolderResults = await Promise.all(subfolderPromises);
        subfolderResults.forEach(objects => {
          allObjects = allObjects.concat(objects);
        });
      }
      
      continuationToken = response.NextContinuationToken;
    } while (continuationToken);

    console.log(`Total files found in ${prefix || 'root'}: ${allObjects.length}`);
    return allObjects;

  } catch (error) {
    console.error('Error listing objects:', {
      message: error.message,
      prefix: prefix,
      objectCount: allObjects.length
    });
    throw error;
  }
}

async function processFile(file, s3, searchWord) {
  return workerPool.execute(async () => {
    const fileData = await fetchWithRetry(s3, {
      Bucket: process.env.CLOUDFLARE_BUCKET_NAME,
      Key: file.Key,
    });

    const fileContent = fileData.Body.toString('utf-8');
    const lines = fileContent.split('\n');
    let fileOccurrences = [];

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim() === '' || lines[i].includes('-->')) continue;
      
      if (lines[i].toLowerCase().includes(searchWord.toLowerCase())) {
        let timestamp = '';
        if (i > 1) timestamp = lines[i - 1].trim();

        fileOccurrences.push({
          fileName: file.Key,
          timestamp: timestamp,
          subtitleText: lines[i].trim()
        });
      }
    }
    return fileOccurrences;
  });
}

async function fetchWithRetry(s3, params, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await s3.getObject(params).promise();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, i)));
    }
  }
}
