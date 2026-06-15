const request = require('supertest');
const express = require('express');
const settingsRouter = require('../../routes/settings');
const config = require('../../config');
const path = require('path');
const fs = require('fs');

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
  const settingsPath = path.join(__dirname, '../settings.json');
  
  beforeEach(() => {
    if (fs.existsSync(settingsPath)) {
      fs.unlinkSync(settingsPath);
    }
    config.shareDir = path.join(require('os').homedir(), 'LANBeamDrop');
  });

  afterAll(() => {
    if (fs.existsSync(settingsPath)) {
      fs.unlinkSync(settingsPath);
    }
  });

  it('should block non-localhost IPs from getting settings', async () => {
    const res = await request(app)
      .get('/api/settings')
      .set('x-simulated-ip', '192.168.1.100');
    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  it('should block non-localhost IPs from updating settings', async () => {
    const res = await request(app)
      .post('/api/settings')
      .set('x-simulated-ip', '192.168.1.100')
      .send({ shareDir: 'C:\\test' });
    expect(res.status).toBe(403);
  });

  it('should allow localhost to get settings', async () => {
    const res = await request(app)
      .get('/api/settings')
      .set('x-simulated-ip', '127.0.0.1');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.shareDir).toBe(config.shareDir);
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
});
