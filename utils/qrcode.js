const QRCode = require('qrcode');
const config = require('../config');
const { getPrimaryIP } = require('./network');

/**
 * 生成连接二维码并缓存到全局变量
 * 仅在启动时和设置变更时调用，避免运行时性能开销
 */
async function updateCachedQrCode() {
  const ip = getPrimaryIP();
  let url = `http://${ip}:${config.port}`;
  if (config.accessPassword && global.ACCESS_TOKEN) {
    url += `?token=${global.ACCESS_TOKEN}`;
  }
  try {
    global.CACHED_QR_CODE = await QRCode.toString(url, { type: 'svg', margin: 1 });
    global.CACHED_QR_URL = url;
    console.log('[二维码] 连接二维码已缓存');
  } catch (err) {
    console.error('[二维码] 缓存生成失败:', err);
    global.CACHED_QR_CODE = '';
    global.CACHED_QR_URL = '';
  }
}

module.exports = { updateCachedQrCode };
