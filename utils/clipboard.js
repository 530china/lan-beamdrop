/**
 * 共享剪切板管理模块
 * 维护一个内存中的"共享剪切板"，PC 和手机双向读写
 */

const { getPrimaryIP } = require('./network');

let clipboardyModule = null;

/**
 * 动态加载 clipboardy（ESM 模块需要动态 import）
 */
async function getClipboardy() {
  if (!clipboardyModule) {
    clipboardyModule = await import('clipboardy');
  }
  return clipboardyModule.default || clipboardyModule;
}

// store history
const MAX_HISTORY = 50;
let clipboardHistory = [];
let lastPCClipboard = '';
let isWritingToPC = false;

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
    const clipboardy = await getClipboardy();
    const content = await clipboardy.read();
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
    const clipboardy = await getClipboardy();
    await clipboardy.write(content);
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
