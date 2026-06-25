const express = require('express');
const router = express.Router();
const { exec } = require('child_process');
const os = require('os');

// Helper to execute commands with a timeout
function execAsync(command, timeoutMs = 5000) {
  return new Promise((resolve) => {
    exec(command, { timeout: timeoutMs }, (error, stdout, stderr) => {
      resolve({ error, stdout, stderr });
    });
  });
}

/**
 * 扫描 ARP 缓存表
 * 提取局域网内当前与本机有过通信（物理层可视）的设备
 */
router.get('/arp', async (req, res) => {
  const isWin = os.platform() === 'win32';
  // Windows 下强制使用 UTF-8 (65001) 编码，防止中文乱码，使用 >nul 屏蔽 active code page 提示
  const command = isWin ? 'chcp 65001 >nul && arp -a' : 'arp -a';
  
  const { stdout, error } = await execAsync(command);
  if (error && !stdout) {
    return res.status(500).json({ success: false, error: '无法执行 ARP 扫描' });
  }

  const devices = [];
  const lines = stdout.split('\n');
  
  if (isWin) {
    // Windows ARP 解析:  192.168.31.1      d4-35-38-24-3c-d5     动态
    for (const line of lines) {
      const match = line.match(/^\s*(\d{1,3}(?:\.\d{1,3}){3})\s+([0-9a-fA-F-]{17})\s+(.*)/);
      if (match) {
        devices.push({
          ip: match[1],
          mac: match[2].replace(/-/g, ':'),
          type: match[3].trim()
        });
      }
    }
  } else {
    // Mac/Linux ARP 解析: ? (192.168.31.1) at d4:35:38:24:3c:d5 on en0 ifscope [ethernet]
    for (const line of lines) {
      const match = line.match(/\(([\d\.]+)\) at ([0-9a-fA-F:]+) /i);
      if (match) {
        devices.push({
          ip: match[1],
          mac: match[2],
          type: '动态'
        });
      }
    }
  }

  // 去重 (以防多个接口有同一个 IP)
  const uniqueDevices = [];
  const seenIps = new Set();
  for (const d of devices) {
    // 过滤掉广播/组播地址 (如 224.x, 239.x, 255.x)
    if (d.ip.startsWith('224.') || d.ip.startsWith('239.') || d.ip.endsWith('.255')) continue;
    if (!seenIps.has(d.ip)) {
      seenIps.add(d.ip);
      uniqueDevices.push(d);
    }
  }

  res.json({ success: true, devices: uniqueDevices });
});

/**
 * Ping 测试
 * 测试本机是否能够连通目标 IP
 */
router.get('/ping', async (req, res) => {
  const { ip } = req.query;
  if (!ip || !/^(\d{1,3}\.){3}\d{1,3}$/.test(ip)) {
    return res.status(400).json({ success: false, error: '无效的 IP 地址' });
  }

  const isWin = os.platform() === 'win32';
  // Windows 发 1 个包用 -n 1，Mac/Linux 用 -c 1。超时设为 1 秒 (-w 1000 / -W 1)
  // Windows 同样强制使用 UTF-8 (65001) 避免乱码
  const command = isWin ? `chcp 65001 >nul && ping -n 1 -w 1000 ${ip}` : `ping -c 1 -W 1 ${ip}`;

  const { error, stdout } = await execAsync(command, 2000);
  
  // Windows 的 ping 即使不通有时候也会 exit 0 (如 Destination host unreachable)，所以要看输出内容
  const isReachable = !error && !stdout.includes('Unreachable') && !stdout.includes('无法访问目标主机') && !stdout.includes('100% packet loss') && !stdout.includes('100% 丢失');

  res.json({
    success: true,
    reachable: isReachable,
    log: stdout.trim()
  });
});

/**
 * GET /api/diagnostics/rtt-test
 * 极简接口，仅用于客户端高频多次请求测算网络延迟 (RTT) 和丢包
 */
router.get('/rtt-test', (req, res) => {
  res.json({ success: true });
});

/**
 * GET /api/diagnostics/auto
 * 一键自动化综合网络诊断
 */
router.get('/auto', async (req, res) => {
  try {
    const fs = require('fs');
    const path = require('path');
    const config = require('../config');

    // 1. 获取客户端 IP 且规范化
    let clientIp = req.socket.remoteAddress || req.ip || '';
    if (clientIp.startsWith('::ffff:')) {
      clientIp = clientIp.substring(7);
    }
    if (clientIp === '::1' || clientIp === '::') {
      clientIp = '127.0.0.1';
    }

    // 2. 获取服务器网卡 IP 列表
    const interfaces = os.networkInterfaces();
    const serverIps = [];
    for (const name of Object.keys(interfaces)) {
      for (const net of interfaces[name]) {
        if (net.family === 'IPv4' && !net.internal) {
          serverIps.push(net.address);
        }
      }
    }

    // 3. 判断是否在同一局域网网段
    const isLocalhost = clientIp === '127.0.0.1' || clientIp === 'localhost';
    let isSameSubnet = false;
    if (isLocalhost) {
      isSameSubnet = true;
    } else {
      const clientSubnet = clientIp.split('.').slice(0, 3).join('.');
      for (const sIp of serverIps) {
        const serverSubnet = sIp.split('.').slice(0, 3).join('.');
        if (clientSubnet === serverSubnet) {
          isSameSubnet = true;
          break;
        }
      }
    }

    // 4. 服务器磁盘落盘写入吞吐量基准测试 (10MB)
    const testFilePath = path.join(config.shareDir, `io_speedtest_${Date.now()}.tmp`);
    const testData = Buffer.alloc(10 * 1024 * 1024); // 10MB
    const t1 = Date.now();
    let diskWriteSpeedMBs = 0;
    let diskWriteTimeMs = 0;
    let diskWriteError = null;

    try {
      await fs.promises.writeFile(testFilePath, testData);
      const t2 = Date.now();
      diskWriteTimeMs = t2 - t1;
      diskWriteSpeedMBs = parseFloat(((10 * 1000) / Math.max(diskWriteTimeMs, 1)).toFixed(2));
      await fs.promises.unlink(testFilePath);
    } catch (err) {
      diskWriteError = err.message;
      try {
        if (fs.existsSync(testFilePath)) await fs.promises.unlink(testFilePath);
      } catch (e) {}
    }

    // 5. 反向 Ping 客户端连通性测试
    let clientPingReachable = false;
    let clientPingLog = '';
    if (!isLocalhost && /^(\d{1,3}\.){3}\d{1,3}$/.test(clientIp)) {
      const isWin = os.platform() === 'win32';
      const pingCmd = isWin ? `chcp 65001 >nul && ping -n 1 -w 1000 ${clientIp}` : `ping -c 1 -W 1 ${clientIp}`;
      const { error, stdout } = await execAsync(pingCmd, 2000);
      clientPingLog = stdout ? stdout.trim() : '';
      clientPingReachable = !error && !clientPingLog.includes('Unreachable') && !clientPingLog.includes('无法访问目标主机') && !clientPingLog.includes('100% packet loss') && !clientPingLog.includes('100% 丢失');
    } else {
      clientPingReachable = true; // Localhost 默认可连
    }

    res.json({
      success: true,
      clientIp,
      serverIps,
      isLocalhost,
      isSameSubnet,
      diskWriteSpeedMBs,
      diskWriteTimeMs,
      diskWriteError,
      clientPingReachable,
      clientPingLog,
      serverPlatform: os.platform()
    });
  } catch (err) {
    console.error('[网络诊断] 一键自动诊断发生异常:', err.message);
    res.status(500).json({ success: false, error: '一键自动诊断服务异常' });
  }
});

module.exports = router;
