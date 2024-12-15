import { S3 } from 'aws-sdk';

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

  try {
    const Contents = await listAllObjects(s3, process.env.CLOUDFLARE_BUCKET_NAME);
    
    console.log('Files found:', Contents.length);

    let occurrences = [];
    let totalCount = 0;

    const srtFiles = Contents.filter(file => file.Key.toLowerCase().endsWith('.srt'));

    for (const file of srtFiles) {
      console.log('Processing file:', file.Key);

      const fileData = await s3.getObject({
        Bucket: process.env.CLOUDFLARE_BUCKET_NAME,
        Key: file.Key,
      }).promise();

      const fileContent = fileData.Body.toString('utf-8');
      const lines = fileContent.split('\n');
      
      // Process SRT file content
      for (let i = 0; i < lines.length; i++) {
        // Skip empty lines and timestamp lines
        if (lines[i].trim() === '' || lines[i].includes('-->')) {
          continue;
        }

        // Check if line contains the search word (case insensitive)
        if (lines[i].toLowerCase().includes(searchWord.toLowerCase())) {
          // Get the timestamp from the previous lines
          let timestamp = '';
          if (i > 1) {
            timestamp = lines[i - 1].trim();
          }

          occurrences.push({
            fileName: file.Key,
            timestamp: timestamp,
            subtitleText: lines[i].trim()
          });
          totalCount++;
        }
      }
    }

    occurrences.sort((a, b) => {
      if (a.fileName === b.fileName) {
        return a.timestamp.localeCompare(b.timestamp);
      }
      return a.fileName.localeCompare(b.fileName);
    });

    return res.status(200).json({
      occurrences,
      totalCount
    });

  } catch (error) {
    console.error('Error processing search:', error);
    return res.status(500).json({ message: 'Error processing search', error: error.message });
  }
}
