/**
 * 共享剪切板管理模块
 * 维护一个内存中的"共享剪切板"，PC 和手机双向读写
 */

const { getPrimaryIP } = require('./network');
const { execSync } = require('child_process');
const os = require('os');
const fs = require('fs');
const path = require('path');
const config = require('../config');

// 判断是否处于 pkg 打包环境
const isPkg = typeof process.pkg !== 'undefined';
const basePath = isPkg ? path.dirname(process.execPath) : path.join(__dirname, '..');

// store history
const historyFile = process.env.NODE_ENV === 'test' ? 'clipboard_history_test.json' : 'clipboard_history.json';
const HISTORY_PATH = path.join(basePath, historyFile);

let clipboardHistory = [];

try {
  if (fs.existsSync(HISTORY_PATH)) {
    clipboardHistory = JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf8'));
  }
} catch (err) {
  console.error('[剪切板] 读取历史记录失败:', err.message);
}

let lastPCClipboard = '';
let isWritingToPC = false;

function saveHistory() {
  if (config.maxClipboardHistory <= 0) {
    clipboardHistory = [];
    if (fs.existsSync(HISTORY_PATH)) {
      try { fs.unlinkSync(HISTORY_PATH); } catch(e){}
    }
    return;
  }
  if (clipboardHistory.length > config.maxClipboardHistory) {
    clipboardHistory = clipboardHistory.slice(-config.maxClipboardHistory);
  }
  try {
    fs.writeFileSync(HISTORY_PATH, JSON.stringify(clipboardHistory, null, 2), 'utf8');
  } catch (err) {
    console.error('[剪切板] 写入历史记录失败:', err.message);
  }
}

function clearHistory() {
  clipboardHistory = [];
  if (fs.existsSync(HISTORY_PATH)) {
    try { fs.unlinkSync(HISTORY_PATH); } catch(err) {}
  }
}

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
  saveHistory();
  return msg;
}

/**
 * 从 PC 系统剪切板同步到共享剪切板
 */
async function syncFromPC() {
  if (isWritingToPC) return false;
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
      saveHistory();
      return true;
    }
    return false;
  } catch (err) {
    // 忽略错误
    return false;
  }
}

let monitorTimer = null;
function startClipboardMonitor(broadcastUpdate) {
  if (monitorTimer) clearInterval(monitorTimer);
  monitorTimer = setInterval(async () => {
    const changed = await syncFromPC();
    if (changed && typeof broadcastUpdate === 'function') {
      broadcastUpdate('NEW_CLIPBOARD');
    }
  }, 1000); // 每秒主动探测一次系统剪切板
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

/**
 * 根据 ID 批量删除共享剪切板记录
 */
function deleteMessages(ids) {
  if (!Array.isArray(ids)) return;
  const originalLength = clipboardHistory.length;
  clipboardHistory = clipboardHistory.filter(msg => !ids.includes(msg.id));
  if (clipboardHistory.length < originalLength) {
    saveHistory();
  }
}

module.exports = {
  getHistory,
  setSharedClipboard,
  syncFromPC,
  writeToPC,
  clearHistory,
  deleteMessages,
  startClipboardMonitor,
};
