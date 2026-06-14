const fs = require('fs');
const path = require('path');
const config = require('../config');

const settingsPath = path.join(__dirname, '../settings.json');

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
  if (settings.shareDir) {
    config.shareDir = settings.shareDir;
  }

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
