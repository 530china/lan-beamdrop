/**
 * 应用数据目录解析器
 * 统一管理 settings.json、clipboard_history.json 等应用状态文件的存储路径
 * 
 * 遵循各操作系统的标准规范：
 * - Windows:  %APPDATA%\LANBeamDrop\
 * - macOS:    ~/Library/Application Support/LANBeamDrop/
 * - Linux:    ~/.config/lanbeamdrop/
 */

const os = require('os');
const path = require('path');
const fs = require('fs');

const APP_NAME_WIN = 'LANBeamDrop';
const APP_NAME_UNIX = 'lanbeamdrop';

function getAppDataDir() {
  const platform = os.platform();

  let dir;
  if (platform === 'win32') {
    dir = path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), APP_NAME_WIN);
  } else if (platform === 'darwin') {
    dir = path.join(os.homedir(), 'Library', 'Application Support', APP_NAME_WIN);
  } else {
    // Linux 及其他 POSIX 系统，遵循 XDG Base Directory 规范
    dir = path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), APP_NAME_UNIX);
  }

  // 确保目录存在（仅在首次调用时创建，后续调用走缓存）
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  return dir;
}

// 缓存计算结果，避免重复 I/O
let _cachedDir = null;

function resolve(filename) {
  if (!_cachedDir) {
    _cachedDir = getAppDataDir();
  }
  return path.join(_cachedDir, filename);
}

module.exports = { getAppDataDir, resolve };
