const request = require('supertest');
const express = require('express');
const explorerRouter = require('../../routes/explorer');
const path = require('path');
const fs = require('fs');
const os = require('os');

const app = express();
app.use(express.json());

// 模拟 req.ip
app.use((req, res, next) => {
  const simIp = req.headers['x-simulated-ip'];
  if (simIp) {
    Object.defineProperty(req, 'ip', { value: simIp, writable: false });
  } else {
    Object.defineProperty(req, 'ip', { value: '127.0.0.1', writable: false });
  }
  next();
});

app.use('/api/explorer', explorerRouter);

describe('Explorer API', () => {
  let testDir;

  beforeAll(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lan-beamdrop-test-'));
    fs.mkdirSync(path.join(testDir, 'subfolder1'));
    fs.mkdirSync(path.join(testDir, 'subfolder2'));
    fs.writeFileSync(path.join(testDir, 'fake.txt'), 'hello'); // file should be ignored
  });

  afterAll(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('GET /api/explorer/list', () => {
    it('应该拦截非本机请求', async () => {
      const res = await request(app)
        .get('/api/explorer/list')
        .set('x-simulated-ip', '192.168.1.100');
      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('应该返回目录下的子文件夹且过滤掉文件', async () => {
      const res = await request(app)
        .get('/api/explorer/list?dir=' + encodeURIComponent(testDir))
        .set('x-simulated-ip', '127.0.0.1');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.folders.length).toBe(2);
      expect(res.body.folders[0].name).toBe('subfolder1');
      expect(res.body.folders[1].name).toBe('subfolder2');
    });

    describe('跨平台盘符根目录逻辑', () => {
      let platformSpy;
      beforeEach(() => {
        platformSpy = jest.spyOn(os, 'platform');
      });
      afterEach(() => {
        platformSpy.mockRestore();
      });

      it('Linux/Mac 下空目录请求应该返回根目录 (/)', async () => {
        platformSpy.mockReturnValue('linux');
        const res = await request(app)
          .get('/api/explorer/list?dir=')
          .set('x-simulated-ip', '127.0.0.1');
        
        expect(res.status).toBe(200);
        // 在 Linux/Mac 下，dir 为空时会被指向 '/'，但经过 path.normalize 后在 Windows 环境下测试可能会变成 '\'
        expect(res.body.path).toBe(path.normalize('/'));
      });

      it('Windows 下空目录请求应该返回驱动器列表', async () => {
        platformSpy.mockReturnValue('win32');
        const res = await request(app)
          .get('/api/explorer/list?dir=')
          .set('x-simulated-ip', '127.0.0.1');
        
        expect(res.status).toBe(200);
        expect(res.body.path).toBe(''); // Windows 盘符选择层 path 为空
        // 验证返回了数组
        expect(Array.isArray(res.body.folders)).toBe(true);
        if (res.body.folders.length > 0) {
          expect(res.body.folders[0].path).toMatch(/^[A-Z]:\\$/);
        }
      });
    });
  });

  describe('POST /api/explorer/mkdir', () => {
    it('应该拦截非本机请求', async () => {
      const res = await request(app)
        .post('/api/explorer/mkdir')
        .send({ parentPath: testDir, folderName: 'newfolder' })
        .set('x-simulated-ip', '192.168.1.100');
      expect(res.status).toBe(403);
    });

    it('拦截非法的文件夹名称', async () => {
      const res = await request(app)
        .post('/api/explorer/mkdir')
        .send({ parentPath: testDir, folderName: '../hack' })
        .set('x-simulated-ip', '127.0.0.1');
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('非法的文件夹名称');
    });

    it('成功创建新文件夹', async () => {
      const res = await request(app)
        .post('/api/explorer/mkdir')
        .send({ parentPath: testDir, folderName: 'new_folder' })
        .set('x-simulated-ip', '127.0.0.1');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(fs.existsSync(path.join(testDir, 'new_folder'))).toBe(true);
    });

    it('文件夹已存在时返回错误', async () => {
      const res = await request(app)
        .post('/api/explorer/mkdir')
        .send({ parentPath: testDir, folderName: 'subfolder1' })
        .set('x-simulated-ip', '127.0.0.1');
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('文件夹已存在');
    });
  });
});
