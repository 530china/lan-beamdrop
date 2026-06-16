const request = require('supertest');
const express = require('express');
const fs = require('fs');
const path = require('path');
const config = require('../../config');
const filesRouter = require('../../routes/files');

const app = express();
app.use(express.json());
app.use('/api/files', filesRouter);

describe('Files API Routes', () => {
  const TEST_DIR = path.join(__dirname, '../test_files_dir');

  beforeAll(() => {
    // 强制把共享目录指向专门的测试目录
    config.shareDir = TEST_DIR;
    if (!fs.existsSync(TEST_DIR)) {
      fs.mkdirSync(TEST_DIR, { recursive: true });
    }
  });

  afterAll(() => {
    // 清理测试目录
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    // Reset config
    config.shareDir = TEST_DIR;
    config.maxFileSize = 2 * 1024 * 1024 * 1024; // Default 2GB
    if (!fs.existsSync(TEST_DIR)) {
      fs.mkdirSync(TEST_DIR, { recursive: true });
    }
  });

  afterEach(() => {
    // 清空目录里的文件但不删除目录本身
    if (fs.existsSync(TEST_DIR)) {
      const files = fs.readdirSync(TEST_DIR);
      for (const file of files) {
        fs.unlinkSync(path.join(TEST_DIR, file));
      }
    }
  });

  test('GET /api/files 应该返回空列表（当目录为空时）', async () => {
    const response = await request(app).get('/api/files');
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.files).toEqual([]);
    expect(response.body.count).toBe(0);
  });

  test('POST /api/files/upload 应该能上传文件', async () => {
    const fakeFilePath = path.join(__dirname, 'fake.txt');
    fs.writeFileSync(fakeFilePath, 'hello world');

    const response = await request(app)
      .post('/api/files/upload')
      .attach('files', fakeFilePath);

    fs.unlinkSync(fakeFilePath); // 清理临时的用于上传的文件

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.files.length).toBe(1);
    expect(response.body.files[0].name).toBe('fake.txt');

    // 验证文件是否真的写入了测试目录
    const exists = fs.existsSync(path.join(TEST_DIR, 'fake.txt'));
    expect(exists).toBe(true);
  });

  test('GET /api/files/download/:filename 应该能下载文件并流式返回', async () => {
    const targetFile = path.join(TEST_DIR, 'download_test.txt');
    fs.writeFileSync(targetFile, 'download content');

    const response = await request(app).get('/api/files/download/download_test.txt');

    expect(response.status).toBe(200);
    expect(response.headers['content-disposition']).toContain('attachment; filename*=UTF-8');
    expect(response.text).toBe('download content');
  });

  test('DELETE /api/files/:filename 应该能成功删除文件', async () => {
    const targetFile = path.join(TEST_DIR, 'delete_test.txt');
    fs.writeFileSync(targetFile, 'to be deleted');

    const response = await request(app).delete('/api/files/delete_test.txt');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);

    // 验证物理文件确实消失了
    const exists = fs.existsSync(targetFile);
    expect(exists).toBe(false);
  });

  test('应该拒绝超过动态 maxFileSize 的文件上传', async () => {
    // 动态配置上限为 500KB
    config.maxFileSize = 500 * 1024;

    // 创建一个 2MB 的巨大 Buffer，远超上限 + 1MB 冗余
    const fileBuffer = Buffer.alloc(2 * 1024 * 1024, 'a');
    
    const res = await request(app)
      .post('/api/files/upload')
      .attach('files', fileBuffer, 'large_file.txt');

    expect(res.status).toBe(413);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain('文件大小超过限制');
  });

  describe('跨平台与安全文件名净化 (Cross-platform & Security)', () => {
    test('应该剥离文件名中的目录穿越 (Path Traversal) 攻击路径', async () => {
      const fileBuffer = Buffer.from('hello');
      const maliciousName = '../../../etc/passwd';
      
      const res = await request(app)
        .post('/api/files/upload')
        .attach('files', fileBuffer, maliciousName);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      
      // 断言返回的文件名被安全地保留为 base name，穿越路径被剥离
      expect(res.body.files[0].name).toBe('passwd');
      expect(fs.existsSync(path.join(TEST_DIR, 'passwd'))).toBe(true);
    });

    test('应该将跨平台非法字符替换为下划线，防止写入崩溃', async () => {
      const fileBuffer = Buffer.from('hello');
      // 构造包含 Windows 非法字符的文件名：< > : " / \ | ? *
      const badName = 'my:video?file*.mp4';
      
      const res = await request(app)
        .post('/api/files/upload')
        .attach('files', fileBuffer, badName);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      
      // 断言非法字符 : ? * 都被替换为了 _
      expect(res.body.files[0].name).toBe('my_video_file_.mp4');
      expect(fs.existsSync(path.join(TEST_DIR, 'my_video_file_.mp4'))).toBe(true);
    });
  });

  test('GET /api/files/download/ 非法路径遍历应该被拦截', async () => {
    const response = await request(app).get('/api/files/download/..%2f..%2fconfig.js');
    
    // 我们的业务逻辑拦截了带有向外穿越的路径，并返回 403
    expect(response.status).toBe(403);
    expect(response.body.error).toBe('非法路径');
  });
});
