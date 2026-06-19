const express = require('express');
const router = express.Router();
const config = require('../config');
const { updateSettings } = require('../utils/settings');
const { isLocalHostReq } = require('../utils/network');

/**
 * 安全网关中间件：仅允许本机访问
 */
router.use((req, res, next) => {
  if (!isLocalHostReq(req)) {
    return res.status(403).json({
      success: false,
      error: '安全拦截：此接口仅允许运行服务的本机访问！'
    });
  }
  next();
});

// GET /api/settings - 获取设置
router.get('/', (req, res) => {
  try {
    res.json({
      success: true,
      data: {
        shareDir: config.shareDir,
        port: config.port,
        maxFileSize: config.maxFileSize,
        maxClipboardHistory: config.maxClipboardHistory
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: '获取设置失败' });
  }
});

// POST /api/settings - 修改设置
router.post('/', (req, res) => {
  const { shareDir, port, maxFileSize, maxClipboardHistory } = req.body;
  if (!shareDir && !port && !maxFileSize && maxClipboardHistory === undefined) {
    return res.status(400).json({ success: false, error: '缺少配置参数' });
  }

  try {
    const newSettings = {};
    if (shareDir) newSettings.shareDir = shareDir;
    if (port) newSettings.port = port;
    if (maxFileSize) newSettings.maxFileSize = maxFileSize;
    if (maxClipboardHistory !== undefined) newSettings.maxClipboardHistory = maxClipboardHistory;
    
    updateSettings(newSettings);
    res.json({ success: true, message: '设置已保存' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
