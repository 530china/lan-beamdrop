const express = require('express');
const router = express.Router();

/**
 * 下行测速接口 (PC -> 手机)
 * 无限下发 1MB 的空数据块，直到客户端主动断开连接
 */
router.get('/download', (req, res) => {
  // 设置相关的头，避免任何缓存，并声明二进制流
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  const chunk = Buffer.alloc(1024 * 1024); // 1MB 零块
  let isWriting = true;

  // 客户端中断连接时停止发送
  req.on('close', () => {
    isWriting = false;
    res.end();
  });

  // 递归发送数据
  const writeChunk = () => {
    if (!isWriting) return;
    
    const canContinue = res.write(chunk);
    
    if (canContinue) {
      // 使用 setImmediate 避免饿死 Node.js 事件循环中的其他请求
      setImmediate(writeChunk);
    } else {
      // 缓冲区满，等待排空后再继续发
      res.once('drain', writeChunk);
    }
  };

  writeChunk();
});

/**
 * 上行测速接口 (手机 -> PC)
 * 将接收到的数据包直接丢入“黑洞”，不对磁盘做任何写入操作
 */
router.post('/upload', (req, res) => {
  // 快速黑洞，消耗数据流但不处理
  req.on('data', () => {});
  
  req.on('end', () => {
    if (!res.headersSent) {
      res.json({ success: true });
    }
  });

  req.on('error', () => {
    // 忽略异常断开
  });
});

module.exports = router;
