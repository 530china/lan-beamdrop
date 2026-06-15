const express = require('express');
const router = express.Router();
const config = require('../config');
const { updateSettings } = require('../utils/settings');
const { getLocalIPs } = require('../utils/network');

/**
 * 判断当前请求的 IP 是否属于本机
 */
function isLocalHostReq(req) {
  // express中，ip可能带有前缀如 ::ffff:127.0.0.1
  const reqIp = req.ip || req.connection.remoteAddress || '';
  if (reqIp.includes('127.0.0.1') || reqIp === '::1') {
    return true;
  }
  const localIps = getLocalIPs().map(n => n.address);
  // 如果请求的 IP 是本机的内网 IP 之一，也算作本机请求
  for (let ip of localIps) {
    if (reqIp.includes(ip)) return true;
  }
  return false;
}

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
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: '获取设置失败' });
  }
});

// POST /api/settings - 修改设置
router.post('/', (req, res) => {
  const { shareDir } = req.body;
  if (!shareDir) {
    return res.status(400).json({ success: false, error: '缺少 shareDir 参数' });
  }

  try {
    updateSettings({ shareDir });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
