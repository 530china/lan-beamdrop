const request = require('supertest');
const express = require('express');
const fs = require('fs');
const path = require('path');
const config = require('../../config');

// Mock ES modules and websocket before importing files router
jest.mock('jimp', () => {
  return {
    Jimp: {
      read: jest.fn().mockResolvedValue({
        resize: jest.fn().mockReturnThis(),
        write: jest.fn().mockImplementation(async (path) => {
          const fs = require('fs');
          fs.writeFileSync(path, 'fake-thumbnail-data');
          return this;
        })
      })
    }
  };
});

jest.mock('archiver', () => {
  return {
    ZipArchive: jest.fn().mockImplementation(() => {
      const { PassThrough } = require('stream');
      const archive = new PassThrough();
      archive.file = jest.fn();
      archive.finalize = jest.fn(() => {
        archive.write('FAKE_ZIP_DATA');
        archive.end();
      });
      return archive;
    })
  };
});

jest.mock('../../utils/websocket', () => ({
  broadcastUpdate: jest.fn()
}));

const router = require('../../routes/files');

const app = express();
app.use('/api/files', router);

describe('GET /api/files/download/:filename?inline=true', () => {
  const testFileName = 'test_video_dummy.mp4';
  const testFilePath = path.join(config.shareDir, testFileName);

  beforeAll(() => {
    if (!fs.existsSync(config.shareDir)) {
      fs.mkdirSync(config.shareDir, { recursive: true });
    }
    fs.writeFileSync(testFilePath, 'fake video file content of sufficient length for range requests testing');
  });

  afterAll(() => {
    if (fs.existsSync(testFilePath)) {
      fs.unlinkSync(testFilePath);
    }
  });

  it('should return 206 Partial Content and accept-ranges header when requesting with a range header and inline=true', async () => {
    const res = await request(app)
      .get(`/api/files/download/${encodeURIComponent(testFileName)}`)
      .query({ inline: 'true' })
      .set('Range', 'bytes=0-10');

    expect(res.status).toBe(206);
    expect(res.headers['accept-ranges']).toBe('bytes');
    expect(res.headers['content-disposition']).toBe('inline');
  });
});

describe('isVideo Extension Detection', () => {
  const isVideo = (filename) => {
    return /\.(mp4|webm|ogg|mov|mkv)$/i.test(filename);
  };

  it('should correctly identify video file extensions', () => {
    expect(isVideo('test.mp4')).toBe(true);
    expect(isVideo('test.MOV')).toBe(true);
    expect(isVideo('test.mkv')).toBe(true);
    expect(isVideo('test.webm')).toBe(true);
    expect(isVideo('test.ogg')).toBe(true);
    expect(isVideo('test.png')).toBe(false);
    expect(isVideo('test.zip')).toBe(false);
    expect(isVideo('test.mp3')).toBe(false);
  });
});

