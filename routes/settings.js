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
        maxClipboardHistory: config.maxClipboardHistory,
        accessPassword: config.accessPassword || ''
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: '获取设置失败' });
  }
});

// POST /api/settings - 修改设置
router.post('/', (req, res) => {
  const { shareDir, port, maxFileSize, maxClipboardHistory, accessPassword } = req.body;
  if (!shareDir && !port && !maxFileSize && maxClipboardHistory === undefined && accessPassword === undefined) {
    return res.status(400).json({ success: false, error: '缺少配置参数' });
  }

  if (accessPassword !== undefined && accessPassword !== '' && accessPassword !== 'random' && !/^\d{4}$/.test(accessPassword)) {
    return res.status(400).json({ success: false, error: '访问密码必须是 4 位纯数字，或者是 random' });
  }

  try {
    const newSettings = {};
    if (shareDir) newSettings.shareDir = shareDir;
    if (port) newSettings.port = port;
    if (maxFileSize) newSettings.maxFileSize = maxFileSize;
    if (maxClipboardHistory !== undefined) newSettings.maxClipboardHistory = maxClipboardHistory;
    if (accessPassword !== undefined) newSettings.accessPassword = accessPassword;
    
    updateSettings(newSettings);

    // 动态更新内存中的安全凭证，让其立即生效，而不需要手动重启 Node 服务
    if (accessPassword !== undefined) {
      if (accessPassword) {
        const crypto = require('crypto');
        global.ACCESS_TOKEN = crypto.randomBytes(32).toString('hex');
        if (accessPassword === 'random') {
          global.CURRENT_PIN = Math.floor(1000 + Math.random() * 9000).toString();
        } else {
          global.CURRENT_PIN = accessPassword;
        }
        console.log(`\n[安全] 访问凭证已更新。新的配对码: ${global.CURRENT_PIN}`);
      } else {
        global.ACCESS_TOKEN = null;
        global.CURRENT_PIN = null;
        console.log(`\n[安全] 密码已清除，现已进入裸奔模式`);
      }
    }

    res.json({ success: true, message: '设置已保存' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
