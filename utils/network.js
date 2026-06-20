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

/**
 * 判断当前请求的 IP 是否属于本机（严格全等比较，防止子串误匹配）
 * 例如：服务端 IP 192.168.1.10 不应匹配客户端 IP 192.168.1.100
 */
function isLocalHostReq(req) {
  let rawIp = req.ip || (req.connection && req.connection.remoteAddress) || '';
  // 剥离 IPv6 前缀 ::ffff:192.168.x.x → 192.168.x.x
  if (rawIp.startsWith('::ffff:')) rawIp = rawIp.slice(7);

  if (rawIp === '127.0.0.1' || rawIp === '::1') {
    return true;
  }
  const localIps = getLocalIPs().map(n => n.address);
  return localIps.includes(rawIp);
}

module.exports = { getLocalIPs, getPrimaryIP, isLocalHostReq };
