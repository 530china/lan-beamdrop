const os = require('os');

/**
 * 获取本机局域网 IPv4 地址列表
 * 排除回环地址和虚拟网卡
 */
function getLocalIPs() {
  const interfaces = os.networkInterfaces();
  const ips = [];

  for (const [name, addrs] of Object.entries(interfaces)) {
    // 跳过虚拟网卡（VMware、VirtualBox、Docker 等）
    const lowerName = name.toLowerCase();
    if (
      lowerName.includes('vmware') ||
      lowerName.includes('virtualbox') ||
      lowerName.includes('vethernet') ||
      lowerName.includes('docker') ||
      lowerName.includes('vbox')
    ) {
      continue;
    }

    for (const addr of addrs) {
      // 只取 IPv4、非回环、非内部地址
      if (addr.family === 'IPv4' && !addr.internal) {
        ips.push({
          name: name,
          address: addr.address,
          netmask: addr.netmask,
        });
      }
    }
  }

  return ips;
}

/**
 * 获取最可能的局域网 IP（优先 192.168.x.x 或 10.x.x.x）
 */
function getPrimaryIP() {
  const ips = getLocalIPs();

  if (ips.length === 0) {
    return '127.0.0.1';
  }

  // 优先选择常见局域网段
  const preferred = ips.find(
    (ip) => ip.address.startsWith('192.168.') || ip.address.startsWith('10.')
  );

  return preferred ? preferred.address : ips[0].address;
}

module.exports = { getLocalIPs, getPrimaryIP };
