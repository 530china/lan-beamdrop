const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const os = require('os');
const { getLocalIPs } = require('../utils/network');

/**
 * 判断当前请求的 IP 是否属于本机
 */
function isLocalHostReq(req) {
  const reqIp = req.ip || req.connection.remoteAddress || '';
  if (reqIp.includes('127.0.0.1') || reqIp === '::1') {
    return true;
  }
  const localIps = getLocalIPs().map(n => n.address);
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
      error: '安全拦截：浏览文件系统仅限服务端本机操作！'
    });
  }
  next();
});

/**
 * 获取驱动器列表 (仅 Windows 需要)
 */
function getWindowsDrives() {
  try {
    const { execSync } = require('child_process');
    const stdout = execSync('wmic logicaldisk get name', { encoding: 'utf8' });
    const drives = stdout.split('\n')
      .map(line => line.trim())
      .filter(line => line.endsWith(':'))
      .map(drive => drive + '\\');
    return drives;
  } catch (err) {
    return ['C:\\', 'D:\\', 'E:\\']; // Fallback
  }
}

/**
 * GET /api/explorer/list?dir=...
 * 获取指定目录下的所有子文件夹
 */
router.get('/list', (req, res) => {
  let targetDir = req.query.dir || '';

  const isWin = os.platform() === 'win32';

  // 如果没有传 dir，返回根目录（Windows 是盘符，Mac/Linux 是 /）
  if (!targetDir) {
    if (isWin) {
      const drives = getWindowsDrives();
      return res.json({ success: true, path: '', folders: drives.map(d => ({ name: d, path: d })) });
    } else {
      targetDir = '/';
    }
  }

  try {
    // 规范化路径
    targetDir = path.normalize(targetDir);
    
    // 读取目录
    const items = fs.readdirSync(targetDir, { withFileTypes: true });
    
    // 只过滤出目录，忽略隐藏文件夹和文件
    const folders = items
      .filter(item => item.isDirectory() && !item.name.startsWith('.'))
      .map(item => ({
        name: item.name,
        path: path.join(targetDir, item.name)
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    // 计算父目录
    let parentPath = '';
    if (isWin) {
      if (targetDir.length > 3) { // 比如 D:\folder，它的 dirname 是 D:\
        parentPath = path.dirname(targetDir);
        if (!parentPath.endsWith('\\')) parentPath += '\\';
      } else {
        // 如果已经是根盘符，父目录返回空，代表回到盘符选择层
        parentPath = '';
      }
    } else {
      if (targetDir !== '/') {
        parentPath = path.dirname(targetDir);
      }
    }

    res.json({
      success: true,
      path: targetDir,
      parent: parentPath,
      folders
    });

  } catch (err) {
    res.status(500).json({ success: false, error: '无法读取该目录：' + err.message });
  }
});

/**
 * POST /api/explorer/mkdir
 * 在指定父目录下创建新文件夹
 */
router.post('/mkdir', (req, res) => {
  const { parentPath, folderName } = req.body;
  if (!parentPath || !folderName) {
    return res.status(400).json({ success: false, error: '参数不完整' });
  }

  // 防止目录穿越漏洞
  if (folderName.includes('/') || folderName.includes('\\') || folderName.includes('..')) {
    return res.status(400).json({ success: false, error: '非法的文件夹名称' });
  }

  try {
    const targetPath = path.join(parentPath, folderName);
    if (fs.existsSync(targetPath)) {
      return res.status(400).json({ success: false, error: '文件夹已存在' });
    }
    fs.mkdirSync(targetPath);
    res.json({ success: true, path: targetPath });
  } catch (err) {
    res.status(500).json({ success: false, error: '创建失败：' + err.message });
  }
});

module.exports = router;
