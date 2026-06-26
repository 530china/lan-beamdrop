/**
 * 共享剪切板历史记录管理模块
 * 维护内存与本地存储中的"共享文本历史"，PC 和手机设备双向按需读写
 */

const fs = require('fs');
const config = require('../config');
const appdata = require('./appdata');

// 历史数据存储文件
const historyFile = process.env.NODE_ENV === 'test' ? 'clipboard_history_test.json' : 'clipboard_history.json';
const HISTORY_PATH = appdata.resolve(historyFile);

let clipboardHistory = [];

try {
  if (fs.existsSync(HISTORY_PATH)) {
    clipboardHistory = JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf8'));
  }
} catch (err) {
  console.error('[剪切板] 读取历史记录失败:', err.message);
}

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
 * 获取共享剪切板历史记录
 */
function getHistory() {
  return clipboardHistory;
}

/**
 * 设置共享剪切板内容 (由客户端手动发送时触发)
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
  clearHistory,
  deleteMessages,
};
