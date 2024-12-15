import { S3 } from 'aws-sdk';
import NodeCache from 'node-cache';
import WorkerPool from '../../utils/workerPool';

// Initialize with smaller pool and shorter timeout
const workerPool = new WorkerPool(3, 8000); // 8 second timeout

// Initialize the cache with 1 hour TTL
const searchCache = new NodeCache({ 
  stdTTL: process.env.CACHE_TTL || 3600,
  maxKeys: process.env.MAX_CACHE_SIZE || 100
});

export default async function handler(req, res) {
  // Set timeout for Vercel
  res.socket.setTimeout(9000); // 9 second timeout
  
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
    httpOptions: { timeout: 5000 } // 5 second timeout for S3 requests
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

    // Limit to first 10 files for faster response
    const limitedFiles = srtFiles.slice(0, 10);
    
    const results = await Promise.all(
      limitedFiles.map(file => processFile(file, s3, searchWord))
    );

    const allOccurrences = results.flat();
    const result = {
      occurrences: allOccurrences,
      totalCount: allOccurrences.length,
      isPartial: srtFiles.length > 10 // Indicate if we're only showing partial results
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

  do {
    const params = {
      Bucket: bucket,
      Prefix: prefix,
      ContinuationToken: continuationToken
    };

    const response = await s3.listObjectsV2(params).promise();
    allObjects = allObjects.concat(response.Contents || []);
    continuationToken = response.NextContinuationToken;
  } while (continuationToken);

  return allObjects;
}

async function processFile(file, s3, searchWord) {
  return workerPool.execute(async () => {
    const fileData = await s3.getObject({
      Bucket: process.env.CLOUDFLARE_BUCKET_NAME,
      Key: file.Key,
    }).promise();

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
