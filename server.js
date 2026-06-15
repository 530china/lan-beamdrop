const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

const config = require('./config');
const { getSettings } = require('./utils/settings');

// 初始化：加载持久化设置并覆盖默认 config
getSettings();

const { getPrimaryIP, getLocalIPs } = require('./utils/network');
const { startMdns } = require('./utils/mdns');
const filesRouter = require('./routes/files');
const clipboardRouter = require('./routes/clipboard');
const settingsRouter = require('./routes/settings');
const explorerRouter = require('./routes/explorer');

const app = express();

// ============================================
// 中间件配置
// ============================================

// CORS（允许所有来源，局域网使用）
app.use(cors());

// JSON 解析
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// 静态文件（Web UI）
app.use(express.static(path.join(__dirname, 'public')));

// 请求日志
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    const now = new Date().toLocaleTimeString('zh-CN');
    console.log(`[${now}] ${req.method} ${req.path}`);
  }
  next();
});

// ============================================
// API 路由
// ============================================

// 设备信息
app.get('/api/info', (req, res) => {
  const ip = getPrimaryIP();
  
  // 判断是否为本机请求
  const reqIp = req.ip || req.connection.remoteAddress || '';
  let isLocalHost = false;
  if (reqIp.includes('127.0.0.1') || reqIp === '::1') {
    isLocalHost = true;
  } else {
    const localIps = getLocalIPs().map(n => n.address);
    for (let lip of localIps) {
      if (reqIp.includes(lip)) {
        isLocalHost = true;
        break;
      }
    }
  }

  res.json({
    success: true,
    deviceName: config.deviceName,
    platform: 'windows',
    ip: ip,
    port: config.port,
    shareDir: config.shareDir,
    version: '1.0.0',
    url: `http://${ip}:${config.port}`,
    isLocalHost: isLocalHost
  });
});

// 文件 API
app.use('/api/files', filesRouter);

// 剪切板 API
app.use('/api/clipboard', clipboardRouter);

// 设置 API
app.use('/api/settings', settingsRouter);

// 文件浏览器 API
app.use('/api/explorer', explorerRouter);

// SPA 回退：所有非 API 请求返回 index.html
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api/')) {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
});

// ============================================
// 错误处理
// ============================================

// Multer 文件大小超限错误
app.use((err, req, res, next) => {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({
      success: false,
      error: `文件大小超过限制（最大 ${Math.round(config.maxFileSize / 1024 / 1024 / 1024)}GB）`,
    });
  }
  console.error('[服务器] 错误:', err.message);
  res.status(500).json({ success: false, error: '服务器内部错误' });
});

// ============================================
// 启动服务器
// ============================================

// 确保共享目录存在
if (!fs.existsSync(config.shareDir)) {
  fs.mkdirSync(config.shareDir, { recursive: true });
}

app.listen(config.port, '0.0.0.0', () => {
  const ip = getPrimaryIP();
  const url = `http://${ip}:${config.port}`;

  console.log('');
  console.log('╭──────────────────────────────────────────╮');
  console.log('│          🚀 LAN BeamDrop 启动成功        │');
  console.log('├──────────────────────────────────────────┤');
  console.log(`║  地址: ${url.padEnd(33)}║`);
  console.log(`║  设备: ${config.deviceName.padEnd(33)}║`);
  console.log(`║  目录: ${config.shareDir.padEnd(33)}║`);
  console.log('╠══════════════════════════════════════════╣');
  console.log('║  📱 手机扫描下方二维码连接               ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log('');

  // 显示二维码
  try {
    const qrcode = require('qrcode-terminal');
    qrcode.generate(url, { small: true }, (qr) => {
      console.log(qr);
    });
  } catch (err) {
    console.log(`📱 请用手机浏览器打开: ${url}`);
  }

  console.log('');
  console.log('所有局域网 IP:');
  getLocalIPs().forEach((ip) => {
    console.log(`  - ${ip.name}: http://${ip.address}:${config.port}`);
  });
  console.log('');

  // 启动 mDNS 广播
  startMdns(config.port);
});

// 优雅退出
process.on('SIGINT', () => {
  console.log('\n[服务器] 正在关闭...');
  const { stopMdns } = require('./utils/mdns');
  stopMdns();
  process.exit(0);
});

process.on('SIGTERM', () => {
  const { stopMdns } = require('./utils/mdns');
  stopMdns();
  process.exit(0);
});
