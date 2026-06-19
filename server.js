const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

const config = require('./config');
const { getSettings } = require('./utils/settings');

// 初始化：加载持久化设置并覆盖默认 config
getSettings();

const { getPrimaryIP, getLocalIPs, isLocalHostReq } = require('./utils/network');
const { startMdns } = require('./utils/mdns');
const { checkUpdate } = require('./utils/update');
const filesRouter = require('./routes/files');
const clipboardRouter = require('./routes/clipboard');
const settingsRouter = require('./routes/settings');
const explorerRouter = require('./routes/explorer');
const diagnosticsRouter = require('./routes/diagnostics');
const speedtestRouter = require('./routes/speedtest');

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
app.get('/api/info', async (req, res) => {
  const ip = getPrimaryIP();
  const isLocalHost = isLocalHostReq(req);

  const os = require('os');
  const osPlatform = os.platform() === 'win32' ? 'windows' : (os.platform() === 'darwin' ? 'mac' : 'linux');
  const pkg = require('./package.json');

  res.json({
    success: true,
    deviceName: config.deviceName,
    platform: osPlatform,
    ip: ip,
    port: config.port,
    shareDir: config.shareDir,
    version: pkg.version,
    url: `http://${ip}:${config.port}`,
    isLocalHost: isLocalHost,
    maxFileSize: config.maxFileSize
  });
});

// 系统更新 API (分离出来，防止阻塞核心信息流)
app.get('/api/system/update', async (req, res) => {
  if (!isLocalHostReq(req)) {
    return res.json({ hasUpdate: false });
  }
  const updateInfo = await checkUpdate();
  res.json(updateInfo);
});

// 文件 API
app.use('/api/files', filesRouter);

// 剪切板 API
app.use('/api/clipboard', clipboardRouter);

// 设置 API
app.use('/api/settings', settingsRouter);

// 文件浏览器 API
app.use('/api/explorer', explorerRouter);

// 局域网测速 API (全局允许，供手机端调用)
app.use('/api/speedtest', speedtestRouter);

// 网络诊断 API (仅限本机)
app.use('/api/diagnostics', (req, res, next) => {
  if (!isLocalHostReq(req)) {
    return res.status(403).json({ success: false, error: 'Access Denied: Localhost only' });
  }
  next();
}, diagnosticsRouter);

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
