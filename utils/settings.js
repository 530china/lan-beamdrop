const fs = require('fs');
const path = require('path');
const config = require('../config');

// 判断是否处于 pkg 打包后的环境中
const isPkg = typeof process.pkg !== 'undefined';
// 如果是打包环境，保存在可执行文件同级目录；否则保存在项目根目录
const basePath = isPkg ? path.dirname(process.execPath) : path.join(__dirname, '..');
// 隔离测试环境，防止 npm test 污染用户的真实配置
const settingsFileName = process.env.NODE_ENV === 'test' ? 'settings_test.json' : 'settings.json';
const settingsPath = path.join(basePath, settingsFileName);

/**
 * 读取本地持久化设置并合并到配置中
 */
function getSettings() {
  let settings = {};
  if (fs.existsSync(settingsPath)) {
    try {
      const data = fs.readFileSync(settingsPath, 'utf8');
      settings = JSON.parse(data);
    } catch (err) {
      console.error('[Settings] 读取 settings.json 失败:', err.message);
    }
  }

  // 合并到当前内存 config 中
  if (settings.shareDir) config.shareDir = settings.shareDir;
  if (settings.port) config.port = parseInt(settings.port, 10);
  if (settings.maxFileSize) config.maxFileSize = parseInt(settings.maxFileSize, 10);

  return config;
}

/**
 * 更新设置并持久化到本地
 * @param {Object} newSettings - 新的设置对象
 */
function updateSettings(newSettings) {
  let settings = {};
  if (fs.existsSync(settingsPath)) {
    try {
      const data = fs.readFileSync(settingsPath, 'utf8');
      settings = JSON.parse(data);
    } catch (err) {
      // 忽略读取错误，使用空对象覆盖
    }
  }

  // 合并新设置
  settings = { ...settings, ...newSettings };

  // 更新内存配置
  if (settings.shareDir) {
    config.shareDir = settings.shareDir;
    // 确保目录存在
    if (!fs.existsSync(config.shareDir)) {
      try {
        fs.mkdirSync(config.shareDir, { recursive: true });
      } catch (err) {
        console.error('[Settings] 创建共享目录失败:', err.message);
        throw new Error('无法创建指定的共享目录');
      }
    }
  }
  
  if (settings.port) config.port = parseInt(settings.port, 10);
  if (settings.maxFileSize) config.maxFileSize = parseInt(settings.maxFileSize, 10);

  // 写入文件
  try {
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
  } catch (err) {
    console.error('[Settings] 写入 settings.json 失败:', err.message);
    throw new Error('保存设置失败');
  }

  return config;
}

module.exports = {
  getSettings,
  updateSettings
};
