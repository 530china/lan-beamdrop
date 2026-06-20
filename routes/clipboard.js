const express = require('express');
const clipboard = require('../utils/clipboard');
const { getLocalIPs } = require('../utils/network');
const { broadcastUpdate } = require('../utils/websocket');

const router = express.Router();

/**
 * GET /api/clipboard
 * 获取共享剪切板内容
 */
router.get('/', async (req, res) => {
  try {
    await clipboard.syncFromPC();
    const history = clipboard.getHistory();
    res.json({ success: true, history });
  } catch (err) {
    res.status(500).json({ success: false, error: '获取剪切板失败' });
  }
});

/**
 * POST /api/clipboard
 * 设置共享剪切板内容（来自手机端）
 * 同时写入 PC 系统剪切板
 */
router.post('/', async (req, res) => {
  try {
    let { content, clientId, deviceName } = req.body;
    if (content === undefined || content === null) {
      return res.status(400).json({ success: false, error: '内容不能为空' });
    }

    let ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
    if (ip.includes('::ffff:')) ip = ip.split('::ffff:')[1];
    if (ip === '::1') ip = '127.0.0.1';
    
    const serverIPs = getLocalIPs().map(i => i.address);
    serverIPs.push('127.0.0.1', 'localhost');
    
    if (serverIPs.includes(ip)) {
      deviceName = `🖥️ 服务端网页 (${ip})`;
    } else if (ip && !deviceName.includes(ip)) {
      deviceName = `${deviceName.replace(/ \(.*\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\)$/, '')} (${ip})`;
    }

    const msg = clipboard.setSharedClipboard({
      content: String(content),
      clientId: clientId,
      deviceName: deviceName
    });

    // 同时写入 PC 系统剪切板
    try {
      await clipboard.writeToPC(String(content));
      console.log(`[剪切板] 手机 → PC 同步成功 (${String(content).length} 字符)`);
    } catch (writeErr) {
      console.warn('[剪切板] 写入 PC 系统剪切板失败:', writeErr.message);
    }

    broadcastUpdate('NEW_CLIPBOARD');

    res.json({ success: true, message: msg });
  } catch (err) {
    console.error('[剪切板] 设置失败:', err.message);
    res.status(500).json({ success: false, error: '设置剪切板失败' });
  }
});

/**
 * DELETE /api/clipboard
 * 清空共享剪切板历史记录
 */
router.delete('/', (req, res) => {
  try {
    clipboard.clearHistory();
    broadcastUpdate('DELETE_CLIPBOARD');
    res.json({ success: true, message: '历史记录已清空' });
  } catch (err) {
    res.status(500).json({ success: false, error: '清空历史记录失败' });
  }
});

module.exports = router;
