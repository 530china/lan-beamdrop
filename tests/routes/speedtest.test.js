const request = require('supertest');
const express = require('express');
const speedtestRouter = require('../../routes/speedtest');
const http = require('http');

const app = express();
app.use('/api/speedtest', speedtestRouter);

describe('Speedtest API Routes', () => {
  let server;
  beforeAll((done) => {
    server = app.listen(0, done);
  });

  afterAll((done) => {
    server.close(done);
  });

  test('GET /api/speedtest/download 应该返回流式 octet-stream 并提供数据', (done) => {
    const { port } = server.address();
    const req = http.get(`http://127.0.0.1:${port}/api/speedtest/download`, (res) => {
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toBe('application/octet-stream');
      
      let receivedData = false;
      res.on('data', (chunk) => {
        if (!receivedData) {
          receivedData = true;
          expect(chunk.length).toBeGreaterThan(0);
          // 收到第一块数据后立刻中断连接，避免死循环
          req.destroy();
        }
      });

      res.on('close', () => {
        expect(receivedData).toBe(true);
        done();
      });
    });

    req.on('error', (err) => {
      // req.destroy() 会触发 ECONNRESET 或 socket hang up
      if (err.code !== 'ECONNRESET' && err.message !== 'socket hang up') {
        done(err);
      }
    });
  });

  test('POST /api/speedtest/upload 应该丢弃数据并快速返回 200 OK', async () => {
    const payload = Buffer.alloc(1024 * 1024); // 1MB 垃圾数据
    const response = await request(app)
      .post('/api/speedtest/upload')
      .set('Content-Type', 'application/octet-stream')
      .send(payload);
      
    expect(response.status).toBe(200);
  });
});
