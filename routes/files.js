const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const config = require('../config');

const router = express.Router();

// 确保共享目录存在
if (!fs.existsSync(config.shareDir)) {
  fs.mkdirSync(config.shareDir, { recursive: true });
  console.log(`[文件] 共享目录已创建: ${config.shareDir}`);
}

// 配置 multer 文件上传
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, config.shareDir);
  },
  filename: (req, file, cb) => {
    // 保留原始文件名，处理中文编码
    const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    // 如果文件名已存在，添加时间戳前缀
    const targetPath = path.join(config.shareDir, originalName);
    if (fs.existsSync(targetPath)) {
      const ext = path.extname(originalName);
      const base = path.basename(originalName, ext);
      const timestamp = Date.now();
      cb(null, `${base}_${timestamp}${ext}`);
    } else {
      cb(null, originalName);
    }
  },
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: config.maxFileSize,
  },
});

/**
 * GET /api/files
 * 获取共享目录文件列表
 */
router.get('/', (req, res) => {
  try {
    const items = fs.readdirSync(config.shareDir, { withFileTypes: true });
    const files = items.map((item) => {
      const filePath = path.join(config.shareDir, item.name);
      const stats = fs.statSync(filePath);
      return {
        name: item.name,
        size: stats.size,
        mtime: stats.mtime.toISOString(),
        isDirectory: item.isDirectory(),
      };
    });

    // 按修改时间倒序（最新在前）
    files.sort((a, b) => new Date(b.mtime) - new Date(a.mtime));

    res.json({
      success: true,
      shareDir: config.shareDir,
      files: files,
      count: files.length,
    });
  } catch (err) {
    console.error('[文件] 读取目录失败:', err.message);
    res.status(500).json({ success: false, error: '读取文件列表失败' });
  }
});

/**
 * GET /api/files/download/:filename
 * 下载指定文件（支持断点续传）
 */
router.get('/download/:filename', (req, res) => {
  try {
    const filename = decodeURIComponent(req.params.filename);
    const filePath = path.join(config.shareDir, filename);

    // 安全检查：防止路径遍历攻击
    const resolvedPath = path.resolve(filePath);
    if (!resolvedPath.startsWith(path.resolve(config.shareDir))) {
      return res.status(403).json({ success: false, error: '非法路径' });
    }

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, error: '文件不存在' });
    }

    const stat = fs.statSync(filePath);

    // 设置下载头
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);

    // 根据文件扩展名设置 MIME 类型
    const mimeTypes = {
      '.txt': 'text/plain',
      '.pdf': 'application/pdf',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.mp3': 'audio/mpeg',
      '.mp4': 'video/mp4',
      '.zip': 'application/zip',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.xls': 'application/vnd.ms-excel',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.ppt': 'application/vnd.ms-powerpoint',
      '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      '.apk': 'application/vnd.android.package-archive',
    };

    const ext = path.extname(filename).toLowerCase();
    const contentType = mimeTypes[ext] || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);

    // 流式传输
    const readStream = fs.createReadStream(filePath);
    readStream.pipe(res);

    readStream.on('error', (err) => {
      console.error('[文件] 下载出错:', err.message);
      if (!res.headersSent) {
        res.status(500).json({ success: false, error: '下载失败' });
      }
    });
  } catch (err) {
    console.error('[文件] 下载处理失败:', err.message);
    res.status(500).json({ success: false, error: '下载处理失败' });
  }
});

/**
 * POST /api/files/upload
 * 上传文件（支持多文件）
 */
router.post('/upload', upload.array('files', 20), (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, error: '未选择文件' });
    }

    const uploaded = req.files.map((f) => ({
      name: f.filename,
      size: f.size,
      path: f.path,
    }));

    console.log(`[文件] 收到 ${uploaded.length} 个文件:`, uploaded.map((f) => f.name).join(', '));

    res.json({
      success: true,
      message: `成功上传 ${uploaded.length} 个文件`,
      files: uploaded,
    });
  } catch (err) {
    console.error('[文件] 上传失败:', err.message);
    res.status(500).json({ success: false, error: '上传失败' });
  }
});

/**
 * DELETE /api/files/:filename
 * 删除指定文件
 */
router.delete('/:filename', (req, res) => {
  try {
    const filename = decodeURIComponent(req.params.filename);
    const filePath = path.join(config.shareDir, filename);

    // 安全检查
    const resolvedPath = path.resolve(filePath);
    if (!resolvedPath.startsWith(path.resolve(config.shareDir))) {
      return res.status(403).json({ success: false, error: '非法路径' });
    }

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, error: '文件不存在' });
    }

    fs.unlinkSync(filePath);
    console.log(`[文件] 已删除: ${filename}`);

    res.json({ success: true, message: `已删除 ${filename}` });
  } catch (err) {
    console.error('[文件] 删除失败:', err.message);
    res.status(500).json({ success: false, error: '删除失败' });
  }
});

module.exports = router;
