jest.mock('child_process', () => ({
  execFile: jest.fn((file, args, callback) => {
    if (callback) callback(null);
  })
}));

const request = require('supertest');
const express = require('express');
const { execFile } = require('child_process');
const settingsRouter = require('../../routes/settings');
const config = require('../../config');
const path = require('path');
const fs = require('fs');
const os = require('os');
const appdata = require('../../utils/appdata');

const app = express();
app.use(express.json());

// 模拟 req.ip，我们需要测试中间件
app.use((req, res, next) => {
  // 允许测试用例设置 x-forwarded-for 来模拟 IP
  const simIp = req.headers['x-simulated-ip'];
  if (simIp) {
    Object.defineProperty(req, 'ip', { value: simIp, writable: false });
  } else {
    Object.defineProperty(req, 'ip', { value: '127.0.0.1', writable: false });
  }
  next();
});

app.use('/api/settings', settingsRouter);

describe('Settings API Security & Functionality', () => {
  // 使用 appdata.resolve 对齐 utils/settings.js 的测试环境路径
  const settingsPath = appdata.resolve('settings_test.json');
  
  beforeEach(() => {
    if (fs.existsSync(settingsPath)) {
      fs.unlinkSync(settingsPath);
    }
    config.shareDir = path.join(require('os').homedir(), 'LANBeamDrop');
    config.port = 8765;
    config.maxFileSize = 2 * 1024 * 1024 * 1024;
  });

  afterAll(() => {
    if (fs.existsSync(settingsPath)) {
      fs.unlinkSync(settingsPath);
    }
  });

  it('should block non-localhost IPs from getting settings', async () => {
    const response = await request(app)
      .get('/api/settings')
      .set('x-simulated-ip', '192.168.1.100');
    
    expect(response.status).toBe(403);
    expect(response.body.error).toBe('安全拦截：此接口仅允许运行服务的本机访问！');
  });

  it('should block non-localhost IPs from updating settings', async () => {
    const mockDir = path.join(require('os').tmpdir(), 'test');
    const res = await request(app)
      .post('/api/settings')
      .set('x-simulated-ip', '192.168.1.100')
      .send({ shareDir: mockDir });
    expect(res.status).toBe(403);
  });

  it('should allow localhost to get settings', async () => {
    const res = await request(app)
      .get('/api/settings')
      .set('x-simulated-ip', '127.0.0.1');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.shareDir).toBe(config.shareDir);
    expect(res.body.data.port).toBe(config.port);
    expect(res.body.data.maxFileSize).toBe(config.maxFileSize);
  });

  it('should allow localhost to update settings', async () => {
    const newDir = path.join(__dirname, 'test_route_dir');
    const res = await request(app)
      .post('/api/settings')
      .set('x-simulated-ip', '127.0.0.1')
      .send({ shareDir: newDir });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    
    // Check config update
    expect(config.shareDir).toBe(newDir);
    
    // Clean up
    if (fs.existsSync(newDir)) {
      fs.rmdirSync(newDir);
    }
  });

  it('should allow localhost to update port and maxFileSize', async () => {
    const res = await request(app)
      .post('/api/settings')
      .set('x-simulated-ip', '127.0.0.1')
      .send({ port: 9000, maxFileSize: 5368709120 });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    
    // Check config update
    expect(config.port).toBe(9000);
    expect(config.maxFileSize).toBe(5368709120);
  });

  describe('POST /api/settings/open-folder', () => {
    let platformSpy;

    beforeEach(() => {
      execFile.mockClear();
      platformSpy = jest.spyOn(os, 'platform');
    });

    afterEach(() => {
      platformSpy.mockRestore();
    });

    it('should block non-localhost IPs', async () => {
      const res = await request(app)
        .post('/api/settings/open-folder')
        .set('x-simulated-ip', '192.168.1.100');
      expect(res.status).toBe(403);
    });

    it('should open folder on win32 platform', async () => {
      platformSpy.mockReturnValue('win32');
      const res = await request(app)
        .post('/api/settings/open-folder')
        .set('x-simulated-ip', '127.0.0.1');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('共享文件夹已打开');
      expect(execFile).toHaveBeenCalledWith('explorer.exe', [config.shareDir], expect.any(Function));
    });

    it('should open folder on darwin platform', async () => {
      platformSpy.mockReturnValue('darwin');
      const res = await request(app)
        .post('/api/settings/open-folder')
        .set('x-simulated-ip', '127.0.0.1');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(execFile).toHaveBeenCalledWith('open', [config.shareDir], expect.any(Function));
    });

    it('should open folder on other platforms (e.g. linux)', async () => {
      platformSpy.mockReturnValue('linux');
      const res = await request(app)
        .post('/api/settings/open-folder')
        .set('x-simulated-ip', '127.0.0.1');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(execFile).toHaveBeenCalledWith('xdg-open', [config.shareDir], expect.any(Function));
    });

    it('should create the folder if it does not exist', async () => {
      const nonExistentDir = path.join(__dirname, 'non_existent_test_dir');
      if (fs.existsSync(nonExistentDir)) {
        fs.rmdirSync(nonExistentDir);
      }
      config.shareDir = nonExistentDir;
      platformSpy.mockReturnValue('win32');

      const res = await request(app)
        .post('/api/settings/open-folder')
        .set('x-simulated-ip', '127.0.0.1');

      expect(res.status).toBe(200);
      expect(fs.existsSync(nonExistentDir)).toBe(true);

      // Clean up
      fs.rmdirSync(nonExistentDir);
    });
  });
});
