const config = require('../config');

let bonjourInstance = null;

/**
 * 启动 mDNS 服务广播
 * 让局域网内的设备能发现此服务
 */
function startMdns(port) {
  try {
    const { Bonjour } = require('bonjour-service');
    bonjourInstance = new Bonjour();

    bonjourInstance.publish({
      name: `LANBeamDrop-${config.deviceName}`,
      type: config.mdnsServiceType,
      port: port,
      txt: {
        deviceName: config.deviceName,
        platform: 'windows',
        version: '1.0.0',
      },
    });

    console.log(`[mDNS] 服务已广播: _${config.mdnsServiceType}._tcp`);
    return bonjourInstance;
  } catch (err) {
    console.warn('[mDNS] 广播启动失败（不影响手动连接）:', err.message);
    return null;
  }
}

/**
 * 停止 mDNS 广播
 */
function stopMdns() {
  if (bonjourInstance) {
    bonjourInstance.unpublishAll();
    bonjourInstance.destroy();
    bonjourInstance = null;
    console.log('[mDNS] 服务已停止');
  }
}

module.exports = { startMdns, stopMdns };
