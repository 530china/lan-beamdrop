const request = require('supertest');
const express = require('express');
const fs = require('fs');
const path = require('path');
const config = require('../../config');

jest.mock('../../utils/websocket', () => ({
  broadcastUpdate: jest.fn()
}));

jest.mock('archiver', () => {
  return jest.fn().mockImplementation(() => ({
    pipe: jest.fn(),
    append: jest.fn(),
    finalize: jest.fn(),
    on: jest.fn(),
  }));
});

const filesRouter = require('../../routes/files');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/api/files', filesRouter);

describe('Chunked File Upload (TDD)', () => {
  const testShareDir = path.join(__dirname, 'test_share');
  
  beforeAll(() => {
    config.shareDir = testShareDir;
    if (!fs.existsSync(testShareDir)) {
      fs.mkdirSync(testShareDir, { recursive: true });
    }
    const thumbnailsDir = path.join(config.shareDir, '.thumbnails');
    if (!fs.existsSync(thumbnailsDir)) {
      fs.mkdirSync(thumbnailsDir, { recursive: true });
    }
  });

  afterAll(() => {
    if (fs.existsSync(testShareDir)) {
      fs.rmSync(testShareDir, { recursive: true, force: true });
    }
  });

  it('should upload chunks and merge them into a single file', async () => {
    const fileId = 'test-file-12345';
    const filename = 'large-test-file.txt';
    const totalChunks = 2;
    
    // Upload Chunk 0
    const chunk1Content = Buffer.from('Hello ');
    const chunk1Res = await request(app)
      .post('/api/files/chunk')
      .field('fileId', fileId)
      .field('filename', filename)
      .field('index', 0)
      .field('totalChunks', totalChunks)
      .attach('chunk', chunk1Content, 'blob');
      
    expect(chunk1Res.status).toBe(200);
    expect(chunk1Res.body.success).toBe(true);
    
    // Upload Chunk 1
    const chunk2Content = Buffer.from('World!');
    const chunk2Res = await request(app)
      .post('/api/files/chunk')
      .field('fileId', fileId)
      .field('filename', filename)
      .field('index', 1)
      .field('totalChunks', totalChunks)
      .attach('chunk', chunk2Content, 'blob');
      
    expect(chunk2Res.status).toBe(200);
    expect(chunk2Res.body.success).toBe(true);

    // Merge chunks
    const mergeRes = await request(app)
      .post('/api/files/merge')
      .send({
        fileId,
        filename,
        totalChunks
      });

    expect(mergeRes.status).toBe(200);
    expect(mergeRes.body.success).toBe(true);
    
    // Verify file content
    const mergedPath = path.join(testShareDir, filename);
    expect(fs.existsSync(mergedPath)).toBe(true);
    const content = fs.readFileSync(mergedPath, 'utf8');
    expect(content).toBe('Hello World!');
  });
});
