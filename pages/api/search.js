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

  try {
    const Contents = await listAllObjects(s3, process.env.CLOUDFLARE_BUCKET_NAME);
    console.log('Files found:', Contents.length);

    const srtFiles = Contents.filter(file => file.Key.toLowerCase().endsWith('.srt'));

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

    return res.status(200).json({
      occurrences: allOccurrences,
      totalCount
    });

  } catch (error) {
    console.error('Error processing search:', error);
    return res.status(500).json({ message: 'Error processing search', error: error.message });
  }
}
