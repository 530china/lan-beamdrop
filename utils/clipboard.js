/**
 * 共享剪切板管理模块
 * 维护一个内存中的"共享剪切板"，PC 和手机双向读写
 */

const { getPrimaryIP } = require('./network');
const { execSync } = require('child_process');
const os = require('os');

// store history
const MAX_HISTORY = 50;
let clipboardHistory = [];
let lastPCClipboard = '';
let isWritingToPC = false;

/**
 * 原生读取剪切板 (兼容 Windows, Mac, Linux)
 */
function readNativeClipboard() {
  const platform = os.platform();
  try {
    if (platform === 'win32') {
      const script = `[Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes((Get-Clipboard -Raw)))`;
      const base64 = execSync(`powershell.exe -NoProfile -Command "${script}"`, { encoding: 'utf8', stdio: 'pipe' }).trim();
      if (!base64) return '';
      return Buffer.from(base64, 'base64').toString('utf8');
    } else if (platform === 'darwin') {
      return execSync('pbpaste', { encoding: 'utf8', stdio: 'pipe' });
    } else {
      return execSync('xclip -selection clipboard -o', { encoding: 'utf8', stdio: 'pipe' });
    }
  } catch (err) {
    return '';
  }
}

/**
 * 原生写入剪切板
 */
function writeNativeClipboard(text) {
  const platform = os.platform();
  try {
    if (platform === 'win32') {
      const base64 = Buffer.from(text, 'utf8').toString('base64');
      const script = `[System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${base64}')) | Set-Clipboard`;
      execSync(`powershell.exe -NoProfile -Command "${script}"`, { stdio: 'pipe' });
    } else if (platform === 'darwin') {
      execSync('pbcopy', { input: text, stdio: 'pipe' });
    } else {
      execSync('xclip -selection clipboard -in', { input: text, stdio: 'pipe' });
    }
  } catch (err) {
    console.error('[剪切板] 写入系统剪切板失败:', err.message);
  }
}

/**
 * 获取共享剪切板历史记录
 */
function getHistory() {
  return clipboardHistory;
}

/**
 * 设置共享剪切板内容
 */
function setSharedClipboard(data) {
  const { content, clientId, deviceName } = data;
  const msg = {
    id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
    content: content,
    clientId: clientId || 'unknown',
    deviceName: deviceName || '未知设备',
    timestamp: new Date().toISOString()
  };
  clipboardHistory.push(msg);
  if (clipboardHistory.length > MAX_HISTORY) clipboardHistory.shift();
  return msg;
}

/**
 * 从 PC 系统剪切板同步到共享剪切板
 */
async function syncFromPC() {
  if (isWritingToPC) return clipboardHistory;
  try {
    const content = readNativeClipboard();
    if (content && content !== lastPCClipboard) {
      lastPCClipboard = content;
      const msg = {
        id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
        content: content,
        clientId: 'HOST',
        deviceName: `🖥️ 服务端剪切板 (${getPrimaryIP()})`,
        timestamp: new Date().toISOString()
      };
      clipboardHistory.push(msg);
      if (clipboardHistory.length > MAX_HISTORY) clipboardHistory.shift();
    }
    return clipboardHistory;
  } catch (err) {
    // 忽略错误：如果电脑剪切板为空，或包含非文本数据（如图片），
    // 可能会报错，这里直接返回现有历史记录即可，不中断流程。
    return clipboardHistory;
  }
}

/**
 * 将共享剪切板内容写入 PC 系统剪切板
 */
async function writeToPC(content) {
  isWritingToPC = true;
  lastPCClipboard = content;
  try {
    writeNativeClipboard(content);
  } catch (err) {
    console.error('[剪切板] 写入 PC 剪切板失败:', err.message);
    throw err;
  } finally {
    isWritingToPC = false;
  }
}

module.exports = {
  getHistory,
  setSharedClipboard,
  syncFromPC,
  writeToPC,
};
