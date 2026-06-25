const request = require('supertest');
const express = require('express');
const path = require('path');
const fs = require('fs');

// Mock child_process.exec to simulate arp and ping commands safely
jest.mock('child_process', () => ({
  exec: jest.fn((cmd, opts, callback) => {
    // 兼容 chcp 65001 >nul && arp -a
    if (cmd.includes('arp -a')) {
      const mockArpOutput = require('os').platform() === 'win32'
        ? `
接口: 192.168.31.50 --- 0xb
  Internet 地址         物理地址              类型
  192.168.31.1          d4-35-38-24-3c-d5     动态
  192.168.31.100        a1-b2-c3-d4-e5-f6     动态
        `
        : `
? (192.168.31.1) at d4:35:38:24:3c:d5 [ethernet] on en0
? (192.168.31.100) at a1:b2:c3:d4:e5:f6 [ethernet] on en0
        `;
      if (callback) callback(null, mockArpOutput, '');
      return;
    }
    // 兼容 ping 命令
    if (cmd.includes('ping')) {
      const mockPingOutput = `
正在 Ping 192.168.31.100 具有 32 字节的数据:
来自 192.168.31.100 的回复: 字节=32 时间<1ms TTL=64
192.168.31.100 的 Ping 统计信息:
    数据包: 已发送 = 1，已接收 = 1，丢失 = 0 (0% 丢失)，
往返行程的估计时间(以毫秒为单位):
    最短 = 0ms，最长 = 0ms，平均 = 0ms
      `;
      if (callback) callback(null, mockPingOutput, '');
      return;
    }
    if (callback) callback(null, 'Success', '');
  })
}));

const diagnosticsRouter = require('../../routes/diagnostics');

const app = express();
app.use(express.json());

// Set up simulated client IP via custom header
app.use((req, res, next) => {
  const simIp = req.headers['x-simulated-ip'];
  if (simIp) {
    Object.defineProperty(req, 'ip', { value: simIp, writable: false });
    // Also overwrite remoteAddress for req.socket
    Object.defineProperty(req.socket, 'remoteAddress', { value: simIp, writable: true });
  } else {
    Object.defineProperty(req, 'ip', { value: '127.0.0.1', writable: false });
    Object.defineProperty(req.socket, 'remoteAddress', { value: '127.0.0.1', writable: true });
  }
  next();
});

app.use('/api/diagnostics', diagnosticsRouter);

describe('Diagnostics API Routes', () => {
  test('GET /api/diagnostics/rtt-test should return success: true', async () => {
    const response = await request(app).get('/api/diagnostics/rtt-test');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true });
  });

  test('GET /api/diagnostics/arp should scan and return list of devices', async () => {
    const response = await request(app).get('/api/diagnostics/arp');
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.devices.length).toBeGreaterThan(0);
    expect(response.body.devices[0]).toHaveProperty('ip');
    expect(response.body.devices[0]).toHaveProperty('mac');
  });

  test('GET /api/diagnostics/ping should test connectivity to target IP', async () => {
    const response = await request(app).get('/api/diagnostics/ping?ip=192.168.31.100');
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.reachable).toBe(true);
    expect(response.body).toHaveProperty('log');
  });

  test('GET /api/diagnostics/auto (Localhost) should return complete diagnostics report', async () => {
    const response = await request(app)
      .get('/api/diagnostics/auto')
      .set('x-simulated-ip', '127.0.0.1');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.clientIp).toBe('127.0.0.1');
    expect(response.body.isLocalhost).toBe(true);
    expect(response.body.isSameSubnet).toBe(true);
    expect(response.body.diskWriteSpeedMBs).toBeGreaterThanOrEqual(0);
    expect(response.body.clientPingReachable).toBe(true);
  });

  test('GET /api/diagnostics/auto (LAN client) should perform subnet and ping checks', async () => {
    // 假设服务端 IP 列表里可能包含 192.168.31.X (ARP Mock 返回的段)
    const response = await request(app)
      .get('/api/diagnostics/auto')
      .set('x-simulated-ip', '192.168.31.100');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.clientIp).toBe('192.168.31.100');
    expect(response.body.isLocalhost).toBe(false);
    expect(response.body.diskWriteSpeedMBs).toBeGreaterThanOrEqual(0);
    expect(response.body).toHaveProperty('isSameSubnet');
    expect(response.body).toHaveProperty('clientPingReachable');
  });
});
