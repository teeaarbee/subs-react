import { S3 } from 'aws-sdk';

const searchCache = new Map();
const CACHE_EXPIRY = 1000 * 60 * 60; // 1 hour

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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { searchWord } = req.body;
  if (!searchWord) {
    return res.status(400).json({ message: 'Search word is required' });
  }

  const s3 = new S3({
    endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    accessKeyId: process.env.CLOUDFLARE_ACCESS_KEY_ID,
    secretAccessKey: process.env.CLOUDFLARE_SECRET_ACCESS_KEY,
    region: process.env.CLOUDFLARE_REGION,
    signatureVersion: 'v4',
  });

  console.log('Bucket name:', process.env.CLOUDFLARE_BUCKET_NAME);

  const cacheKey = `${searchWord.toLowerCase()}_${process.env.CLOUDFLARE_BUCKET_NAME}`;
  const cached = searchCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_EXPIRY) {
    return res.status(200).json(cached.data);
  }

  try {
    console.log('Starting search with config:', {
      endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      region: process.env.CLOUDFLARE_REGION,
      bucket: process.env.CLOUDFLARE_BUCKET_NAME
    });

    const Contents = await listAllObjects(s3, process.env.CLOUDFLARE_BUCKET_NAME);
    console.log('Files found:', Contents.length);

    const srtFiles = Contents.filter(file => {
      const key = file.Key.toLowerCase();
      return key.endsWith('.srt') && key.includes(searchWord.toLowerCase());
    });

    const processFile = async (file) => {
      const fileData = await s3.getObject({
        Bucket: process.env.CLOUDFLARE_BUCKET_NAME,
        Key: file.Key,
      }).promise();

      const fileContent = fileData.Body.toString('utf-8');
      const lines = fileContent.split('\n');
      let fileOccurrences = [];

      for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim() === '' || lines[i].includes('-->')) {
          continue;
        }

        if (lines[i].toLowerCase().includes(searchWord.toLowerCase())) {
          let timestamp = '';
          if (i > 1) {
            timestamp = lines[i - 1].trim();
          }

          fileOccurrences.push({
            fileName: file.Key,
            timestamp: timestamp,
            subtitleText: lines[i].trim()
          });
        }
      }
      return fileOccurrences;
    };

    const batchSize = 5;
    let allOccurrences = [];
    for (let i = 0; i < srtFiles.length; i += batchSize) {
      const batch = srtFiles.slice(i, i + batchSize);
      const batchResults = await Promise.all(batch.map(processFile));
      allOccurrences = allOccurrences.concat(batchResults.flat());
    }

    const totalCount = allOccurrences.length;

    allOccurrences.sort((a, b) => {
      if (a.fileName === b.fileName) {
        return a.timestamp.localeCompare(b.timestamp);
      }
      return a.fileName.localeCompare(b.fileName);
    });

    searchCache.set(cacheKey, {
      timestamp: Date.now(),
      data: { occurrences: allOccurrences, totalCount }
    });

    return res.status(200).json({
      occurrences: allOccurrences,
      totalCount
    });

  } catch (error) {
    console.error('Detailed error:', {
      message: error.message,
      stack: error.stack,
      code: error.code
    });
    return res.status(500).json({ 
      message: 'Error processing search', 
      error: error.message,
      errorCode: error.code 
    });
  }
}
