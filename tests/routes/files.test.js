const request = require('supertest');
const express = require('express');
const fs = require('fs');
const path = require('path');
const config = require('../../config');

jest.mock('jimp', () => {
  return {
    Jimp: {
      read: jest.fn().mockResolvedValue({
        resize: jest.fn().mockReturnThis(),
        write: jest.fn().mockImplementation(async (path) => {
          // Simulate jimp writing to our mocked memory fs
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
      archive.file = jest.fn((filepath, options) => {
        // mock file append
      });
      archive.finalize = jest.fn(() => {
        archive.write('FAKE_ZIP_DATA');
        archive.end();
      });
      return archive;
    })
  };
});

// === Memory FS Mock ===
let mockMemoryFs = {};

jest.mock('fs', () => {
  const path = require('path');
  const originalFs = jest.requireActual('fs');
  return {
    ...originalFs,
    existsSync: jest.fn((p) => {
      return p in mockMemoryFs;
    }),
    mkdirSync: jest.fn((p) => {
      mockMemoryFs[p] = { type: 'dir' };
    }),
    readdirSync: jest.fn((p) => {
      const results = [];
      for (const key in mockMemoryFs) {
        if (key.startsWith(p) && key !== p) {
          const relative = key.replace(p + path.sep, '');
          if (!relative.includes(path.sep)) {
            results.push(relative);
          }
        }
      }
      return results;
    }),
    statSync: jest.fn((p) => {
      if (!mockMemoryFs[p]) throw new Error(`ENOENT: no such file or directory, stat '${p}'`);
      return {
        isDirectory: () => mockMemoryFs[p].type === 'dir',
        isFile: () => mockMemoryFs[p].type === 'file',
        size: mockMemoryFs[p].content ? mockMemoryFs[p].content.length : 0,
        mtime: new Date()
      };
    }),
    stat: jest.fn((p, options, cb) => {
      const callback = typeof options === 'function' ? options : cb;
      if (!mockMemoryFs[p]) {
        const err = new Error(`ENOENT: no such file or directory, stat '${p}'`);
        err.code = 'ENOENT';
        return callback(err);
      }
      const stats = Object.create(originalFs.Stats.prototype);
      Object.assign(stats, {
        size: mockMemoryFs[p].content ? mockMemoryFs[p].content.length : 0,
        mtime: new Date(),
        ctime: new Date(),
        atime: new Date(),
      });
      stats.isDirectory = () => mockMemoryFs[p].type === 'dir';
      stats.isFile = () => mockMemoryFs[p].type === 'file';
      callback(null, stats);
    }),
    unlinkSync: jest.fn((p) => {
      if (p.includes('locked_file')) {
        const err = new Error(`EACCES: permission denied, unlink '${p}'`);
        err.code = 'EACCES';
        throw err;
      }
      if (!mockMemoryFs[p]) {
        const err = new Error(`ENOENT: no such file or directory, unlink '${p}'`);
        err.code = 'ENOENT';
        throw err;
      }
      delete mockMemoryFs[p];
    }),
    writeFileSync: jest.fn((p, data) => {
      mockMemoryFs[p] = { type: 'file', content: Buffer.from(data) };
    }),
    readFileSync: jest.fn((p) => {
      if (!mockMemoryFs[p] || mockMemoryFs[p].type !== 'file') {
        throw new Error('ENOENT');
      }
      return mockMemoryFs[p].content;
    }),
    createReadStream: jest.fn((p) => {
      if (!mockMemoryFs[p] || mockMemoryFs[p].type !== 'file') {
        throw new Error('ENOENT');
      }
      const { Readable } = require('stream');
      const stream = new Readable();
      stream.push(mockMemoryFs[p].content);
      stream.push(null);
      return stream;
    }),
    createWriteStream: jest.fn((p) => {
      const { Writable } = require('stream');
      mockMemoryFs[p] = { type: 'file', content: Buffer.alloc(0) };
      const stream = new Writable({
        write(chunk, encoding, callback) {
          mockMemoryFs[p].content = Buffer.concat([mockMemoryFs[p].content, chunk]);
          callback();
        }
      });
      // Multer hooks into stream events
      setTimeout(() => stream.emit('close'), 10);
      return stream;
    }),
    // Multer disk storage uses open, close, etc.
    open: jest.fn((p, flags, cb) => {
      mockMemoryFs[p] = { type: 'file', content: Buffer.alloc(0) };
      cb(null, 999); // dummy fd
    }),
    close: jest.fn((fd, cb) => {
      cb(null);
    }),
    write: jest.fn((fd, buffer, offset, length, position, cb) => {
      // simplistic mock for multer
      cb(null, length, buffer);
    }),
    renameSync: jest.fn((oldPath, newPath) => {
      if (!mockMemoryFs[oldPath]) throw new Error('ENOENT');
      mockMemoryFs[newPath] = mockMemoryFs[oldPath];
      delete mockMemoryFs[oldPath];
    }),
    promises: {
      access: jest.fn(async (p) => {
        if (!mockMemoryFs[p]) throw new Error(`ENOENT: no such file or directory, access '${p}'`);
      }),
      stat: jest.fn(async (p) => {
        if (!mockMemoryFs[p]) throw new Error(`ENOENT: no such file or directory, stat '${p}'`);
        return {
          isDirectory: () => mockMemoryFs[p].type === 'dir',
          isFile: () => mockMemoryFs[p].type === 'file',
          size: mockMemoryFs[p].content ? mockMemoryFs[p].content.length : 0,
          mtime: new Date()
        };
      })
    }
  };
});

const filesRouter = require('../../routes/files');
const app = express();
app.use(express.json());
app.use('/api/files', filesRouter);

describe('Files API Routes (Mocked FS)', () => {
  const TEST_DIR = path.join(__dirname, '../mocked_test_dir');

  beforeAll(() => {
    config.shareDir = TEST_DIR;
  });

  beforeEach(() => {
    mockMemoryFs = {};
    mockMemoryFs[TEST_DIR] = { type: 'dir' };
    config.shareDir = TEST_DIR;
    config.maxFileSize = 2 * 1024 * 1024 * 1024;
    jest.clearAllMocks();
  });

  test('GET /api/files 应该返回空列表', async () => {
    const response = await request(app).get('/api/files');
    expect(response.status).toBe(200);
    expect(response.body.files).toEqual([]);
    expect(response.body.count).toBe(0);
  });

  test('POST /api/files/upload 应该能上传文件', async () => {
    const fakeFilePath = path.join(__dirname, 'fake.txt');
    mockMemoryFs[fakeFilePath] = { type: 'file', content: Buffer.from('hello world') };

    const response = await request(app)
      .post('/api/files/upload')
      .attach('files', Buffer.from('hello world'), 'fake.txt');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.files[0].name).toBe('fake.txt');

    // 验证在虚拟文件系统中是否存在
    const exists = !!mockMemoryFs[path.join(TEST_DIR, 'fake.txt')];
    expect(exists).toBe(true);
  });

  test('GET /api/files/download/:filename 应该能下载文件并流式返回', async () => {
    const targetFile = path.join(TEST_DIR, 'download_test.txt');
    mockMemoryFs[targetFile] = { type: 'file', content: Buffer.from('download content') };

    const response = await request(app).get('/api/files/download/download_test.txt');
    if (response.status !== 200) {
      console.log('RESPONSE STATUS:', response.status);
      console.log('RESPONSE BODY:', response.body);
      console.log('RESPONSE TEXT:', response.text);
    }
    expect(response.status).toBe(200);
    expect(response.text).toBe('download content');
  });

  it('GET /api/files/thumbnail/:filename 应该返回非图片的原文件并重定向', async () => {
    mockMemoryFs[path.join(config.shareDir, 'test_thumb.txt')] = {
      type: 'file',
      content: Buffer.from('hello world')
    };
    const res = await request(app).get('/api/files/thumbnail/test_thumb.txt');
    expect(res.status).toBe(302); // Redirects to download
  });

  it('GET /api/files/thumbnail/:filename 应该为图片生成缩略图并返回', async () => {
    const filename = 'test_thumb.jpg';
    mockMemoryFs[path.join(config.shareDir, filename)] = {
      type: 'file',
      content: Buffer.from('fake-image-content')
    };
    
    // First request should trigger generation
    const res1 = await request(app).get(`/api/files/thumbnail/${filename}`);
    expect(res1.status).toBe(200);
    expect(res1.body.toString()).toBe('fake-thumbnail-data');
    expect(res1.headers['content-type']).toBe('image/jpeg');

    // Second request should serve from cache
    const res2 = await request(app).get(`/api/files/thumbnail/${filename}`);
    expect(res2.status).toBe(200);
    expect(res2.body.toString()).toBe('fake-thumbnail-data');
  });

  test('DELETE /api/files/:filename 应该能成功删除文件', async () => {
    const targetFile = path.join(TEST_DIR, 'delete_test.txt');
    mockMemoryFs[targetFile] = { type: 'file', content: Buffer.from('to be deleted') };

    const response = await request(app).delete('/api/files/delete_test.txt');
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(!!mockMemoryFs[targetFile]).toBe(false);
  });

  test('应该拒绝超过动态 maxFileSize 的文件上传', async () => {
    config.maxFileSize = 500 * 1024; // 500KB
    const fileBuffer = Buffer.alloc(3 * 1024 * 1024, 'a'); // 3MB (exceeds 500KB limit + 1MB redundancy)
    
    const res = await request(app)
      .post('/api/files/upload')
      .attach('files', fileBuffer, 'large_file.txt');

    expect(res.status).toBe(413);
  });

  test('POST /api/files/upload 遇到同名文件时应该自动加时间戳', async () => {
    const fakeFilePath = path.join(TEST_DIR, 'fake.txt');
    // Pre-create the file to force a collision
    mockMemoryFs[fakeFilePath] = { type: 'file', content: Buffer.from('old content') };

    const response = await request(app)
      .post('/api/files/upload')
      .attach('files', Buffer.from('new content'), 'fake.txt');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.files[0].name).not.toBe('fake.txt');
    expect(response.body.files[0].name).toMatch(/fake_\d+\.txt/);
  });

  test('POST /api/files/upload 未选择文件时应返回 400', async () => {
    const response = await request(app).post('/api/files/upload');
    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.error).toBe('未选择文件');
  });

  describe('跨平台与安全文件名净化 (Cross-platform & Security)', () => {
    test('应该剥离文件名中的目录穿越 (Path Traversal) 攻击路径', async () => {
      const maliciousName = '../../../etc/passwd';
      
      const res = await request(app)
        .post('/api/files/upload')
        .attach('files', Buffer.from('hello'), maliciousName);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      
      expect(res.body.files[0].name).toBe('passwd');
      expect(!!mockMemoryFs[path.join(TEST_DIR, 'passwd')]).toBe(true);
    });

    test('应该将跨平台非法字符替换为下划线，防止写入崩溃', async () => {
      // Windows 非法字符：< > : " / \ | ? *
      const badName = 'my:video?file*.mp4';
      
      const res = await request(app)
        .post('/api/files/upload')
        .attach('files', Buffer.from('hello'), badName);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      
      expect(res.body.files[0].name).toBe('my_video_file_.mp4');
      expect(!!mockMemoryFs[path.join(TEST_DIR, 'my_video_file_.mp4')]).toBe(true);
    });
    test('DELETE /api/files/:filename 遇到权限拒绝应该返回 500', async () => {
      const targetFile = path.join(TEST_DIR, 'locked_file.txt');
      mockMemoryFs[targetFile] = { type: 'file', content: Buffer.from('to be deleted') };

      const response = await request(app).delete('/api/files/locked_file.txt');
      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('删除失败');
    });

  });

  test('GET /api/files/download/ 非法路径遍历应该被拦截', async () => {
    const response = await request(app).get('/api/files/download/..%2f..%2fconfig.js');
    expect(response.status).toBe(403);
    expect(response.body.error).toBe('非法路径');
  });

  describe('GET /api/files/download-zip (一键打包)', () => {
    test('应该能成功流式打包有效文件', async () => {
      const file1 = path.join(TEST_DIR, 'valid1.jpg');
      const file2 = path.join(TEST_DIR, 'valid2.txt');
      mockMemoryFs[file1] = { type: 'file', content: Buffer.from('img data') };
      mockMemoryFs[file2] = { type: 'file', content: Buffer.from('text data') };

      const response = await request(app).get('/api/files/download-zip?files=valid1.jpg,valid2.txt');
      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toBe('application/zip');
      expect(response.text).toBe('FAKE_ZIP_DATA');
    });

    test('部分文件缺失时，应该忽略不存在的文件并继续打包存在的文件', async () => {
      const file1 = path.join(TEST_DIR, 'exist.txt');
      mockMemoryFs[file1] = { type: 'file', content: Buffer.from('data') };

      const response = await request(app).get('/api/files/download-zip?files=exist.txt,missing.jpg');
      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toBe('application/zip');
      expect(response.text).toBe('FAKE_ZIP_DATA');
    });

    test('全部文件不存在时，应抛出404防止生成空ZIP', async () => {
      const response = await request(app).get('/api/files/download-zip?files=missing1.txt,missing2.txt');
      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('没有找到可打包的有效文件');
    });

    test('参数为空时应该返回400', async () => {
      const response = await request(app).get('/api/files/download-zip?files=');
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    test('应该强力拦截任何目录穿越攻击 (Path Traversal)', async () => {
      const response = await request(app).get('/api/files/download-zip?files=../../../Windows/system.ini');
      // 因为文件不存在，并且唯一的文件非法，所以没有有效文件，返回 404
      expect(response.status).toBe(404);
      expect(response.body.error).toBe('没有找到可打包的有效文件');
    });

    test('支持以数组形式传递 files 参数 (files[]=a&files[]=b)', async () => {
      const file1 = path.join(TEST_DIR, 'valid1.jpg');
      mockMemoryFs[file1] = { type: 'file', content: Buffer.from('img data') };

      const response = await request(app).get('/api/files/download-zip?files[]=valid1.jpg');
      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toBe('application/zip');
      expect(response.text).toBe('FAKE_ZIP_DATA');
    });
  });

  describe('GET /api/files/check-zip', () => {
    test('全部文件存在时，应返回 valid: true', async () => {
      const file1 = path.join(TEST_DIR, 'exist1.txt');
      const file2 = path.join(TEST_DIR, 'exist2.jpg');
      mockMemoryFs[file1] = { type: 'file', content: Buffer.from('data') };
      mockMemoryFs[file2] = { type: 'file', content: Buffer.from('data') };

      const response = await request(app).get('/api/files/check-zip?files[]=exist1.txt&files[]=exist2.jpg');
      expect(response.status).toBe(200);
      expect(response.body.valid).toBe(true);
    });

    test('部分文件缺失但仍有文件存在时，应返回 valid: true', async () => {
      const file1 = path.join(TEST_DIR, 'exist.txt');
      mockMemoryFs[file1] = { type: 'file', content: Buffer.from('data') };

      const response = await request(app).get('/api/files/check-zip?files[]=exist.txt&files[]=missing.jpg');
      expect(response.status).toBe(200);
      expect(response.body.valid).toBe(true);
    });

    test('全部文件缺失时，应返回 valid: false', async () => {
      const response = await request(app).get('/api/files/check-zip?files[]=missing1.txt&files[]=missing2.jpg');
      expect(response.status).toBe(200);
      expect(response.body.valid).toBe(false);
    });

    test('参数为空时应该返回400', async () => {
      const response = await request(app).get('/api/files/check-zip');
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });
});
