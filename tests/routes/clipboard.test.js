const request = require('supertest');
const express = require('express');
const clipboardRouter = require('../../routes/clipboard');
const clipboard = require('../../utils/clipboard');

// 完整 Mock 底层剪切板服务，防止干扰物理机器和 CI 环境
jest.mock('../../utils/clipboard', () => ({
  syncFromPC: jest.fn(),
  getHistory: jest.fn(),
  setSharedClipboard: jest.fn(),
  writeToPC: jest.fn(),
}));

const app = express();
app.use(express.json());
app.use('/api/clipboard', clipboardRouter);

describe('Clipboard API Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('GET /api/clipboard 应该返回剪切板历史记录', async () => {
    const mockHistory = [
      { id: '1', content: 'hello', clientId: 'HOST', deviceName: 'PC' }
    ];
    clipboard.getHistory.mockReturnValue(mockHistory);
    clipboard.syncFromPC.mockResolvedValue();

    const response = await request(app).get('/api/clipboard');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.history).toEqual(mockHistory);
    expect(clipboard.syncFromPC).toHaveBeenCalledTimes(1);
  });

  test('POST /api/clipboard 提交合法内容', async () => {
    const mockMsg = { id: '2', content: 'test content', clientId: 'phone1', deviceName: 'iPhone' };
    clipboard.setSharedClipboard.mockReturnValue(mockMsg);
    clipboard.writeToPC.mockResolvedValue();

    const response = await request(app)
      .post('/api/clipboard')
      .send({ content: 'test content', clientId: 'phone1', deviceName: 'iPhone' });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.message).toEqual(mockMsg);

    // 验证底层调用
    expect(clipboard.setSharedClipboard).toHaveBeenCalledWith(expect.objectContaining({
      content: 'test content',
      clientId: 'phone1'
    }));
    expect(clipboard.writeToPC).toHaveBeenCalledWith('test content');
  });

  test('POST /api/clipboard 提交空内容应被拦截', async () => {
    const response = await request(app)
      .post('/api/clipboard')
      .send({}); // 缺少 content

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.error).toBe('内容不能为空');
    
    // 确保没有真正写入
    expect(clipboard.setSharedClipboard).not.toHaveBeenCalled();
    expect(clipboard.writeToPC).not.toHaveBeenCalled();
  });
});
