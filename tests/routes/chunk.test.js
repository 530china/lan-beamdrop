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

  it('should dynamically upload chunks to a newly updated shareDir settings path', async () => {
    const originalShareDir = config.shareDir;
    const dynamicShareDir = path.join(__dirname, 'test_share_dynamic');
    
    try {
      config.shareDir = dynamicShareDir;
      if (!fs.existsSync(dynamicShareDir)) {
        fs.mkdirSync(dynamicShareDir, { recursive: true });
      }

      const fileId = 'test-file-dynamic-123';
      const filename = 'dynamic-file.txt';
      const chunkContent = Buffer.from('Dynamic content');
      
      const res = await request(app)
        .post('/api/files/chunk')
        .field('fileId', fileId)
        .field('filename', filename)
        .field('index', 0)
        .field('totalChunks', 1)
        .attach('chunk', chunkContent, 'blob');

      expect(res.status).toBe(200);
      
      // Verify that chunks are saved in the new dynamicShareDir path
      const expectedChunkPath = path.join(dynamicShareDir, '.chunks', fileId, '0');
      expect(fs.existsSync(expectedChunkPath)).toBe(true);

    } finally {
      // Restore config and cleanup
      config.shareDir = originalShareDir;
      if (fs.existsSync(dynamicShareDir)) {
        fs.rmSync(dynamicShareDir, { recursive: true, force: true });
      }
    }
  });

  it('should clean up chunk directories older than 24 hours but keep newer ones', async () => {
    const chunksBaseDir = path.join(config.shareDir, '.chunks');
    if (!fs.existsSync(chunksBaseDir)) {
      fs.mkdirSync(chunksBaseDir, { recursive: true });
    }

    const oldDir = path.join(chunksBaseDir, 'old-task');
    const newDir = path.join(chunksBaseDir, 'new-task');

    fs.mkdirSync(oldDir, { recursive: true });
    fs.mkdirSync(newDir, { recursive: true });

    // Force oldDir mtime to 25 hours ago
    const pastTime = (Date.now() - 25 * 60 * 60 * 1000) / 1000;
    fs.utimesSync(oldDir, pastTime, pastTime);

    // Call GET /api/files to trigger cleanup
    const res = await request(app).get('/api/files');
    expect(res.status).toBe(200);

    // Assert cleanup occurred
    expect(fs.existsSync(oldDir)).toBe(false);
    expect(fs.existsSync(newDir)).toBe(true);
  });
});

