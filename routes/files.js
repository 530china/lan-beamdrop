const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { Jimp } = require('jimp');
const archiver = require('archiver');
const config = require('../config');
const { broadcastUpdate } = require('../utils/websocket');

const router = express.Router();

// 确保共享目录存在
if (!fs.existsSync(config.shareDir)) {
  fs.mkdirSync(config.shareDir, { recursive: true });
  console.log(`[文件] 共享目录已创建: ${config.shareDir}`);
}

const thumbnailsDir = path.join(config.shareDir, '.thumbnails');
if (!fs.existsSync(thumbnailsDir)) {
  fs.mkdirSync(thumbnailsDir, { recursive: true });
  console.log(`[文件] 缩略图缓存目录已创建: ${thumbnailsDir}`);
}

// 配置 multer 文件上传
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, config.shareDir);
  },
  filename: (req, file, cb) => {
    // 提取原始文件名，处理中文编码，并强制只取 Basename 防止目录穿越漏洞 (Path Traversal)
    let originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    originalName = path.basename(originalName);
    
    // 跨平台字符净化：剔除 Windows 不支持的非法字符，确保 Mac 上传的文件在 Win 上不崩
    originalName = originalName.replace(/[<>:"\/\\|?*]/g, '_');
    
    // 如果文件名已存在，或者正有一个同名文件在上传，添加时间戳前缀
    const targetPath = path.join(config.shareDir, originalName);
    const uploadingPath = targetPath + '.uploading';
    if (fs.existsSync(targetPath) || fs.existsSync(uploadingPath)) {
      const ext = path.extname(originalName);
      const base = path.basename(originalName, ext);
      const timestamp = Date.now();
      cb(null, `${base}_${timestamp}${ext}.uploading`);
    } else {
      cb(null, `${originalName}.uploading`);
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
    const files = [];
    const now = Date.now();
    
    items.forEach((item) => {
      const filePath = path.join(config.shareDir, item.name);
      
      // Handle temporary uploading files
      if (item.name.endsWith('.uploading')) {
        try {
          const stats = fs.statSync(filePath);
          // Cleanup orphaned uploads older than 24 hours
          if (now - stats.mtimeMs > 24 * 60 * 60 * 1000) {
            fs.unlinkSync(filePath);
          }
        } catch (e) { /* ignore */ }
        return; // Do not expose to clients
      }

      try {
        const stats = fs.statSync(filePath);
        files.push({
          name: item.name,
          size: stats.size,
          mtime: stats.mtime.toISOString(),
          isDirectory: item.isDirectory(),
        });
      } catch (e) { /* ignore stat errors for deleted files */ }
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
 * GET /api/files/thumbnail/:filename
 * 获取图片的缩略图（按需生成并缓存）
 */
router.get('/thumbnail/:filename', async (req, res) => {
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

    const ext = path.extname(filename).toLowerCase();
    const isImage = ['.jpg', '.jpeg', '.png', '.bmp', '.gif'].includes(ext);

    // 如果不是支持的图片，直接重定向到原文件下载
    if (!isImage) {
      return res.redirect(`/api/files/download/${encodeURIComponent(filename)}`);
    }

    const thumbPath = path.join(thumbnailsDir, filename);
    
    // 如果缓存缩略图不存在，则生成
    if (!fs.existsSync(thumbPath)) {
      try {
        const image = await Jimp.read(fs.readFileSync(filePath));
        await image.resize({ w: 300 }).write(thumbPath);
      } catch (err) {
        console.error(`[缩略图] 生成失败 (${filename}):`, err.message);
        // 如果生成失败，降级返回原图
        return res.redirect(`/api/files/download/${encodeURIComponent(filename)}`);
      }
    }

    const stat = fs.statSync(thumbPath);
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Content-Type', 'image/jpeg'); // Jimp 默认输出格式之一，或者根据扩展名推断
    res.setHeader('Cache-Control', 'public, max-age=86400'); // 浏览器缓存一天

    const readStream = fs.createReadStream(thumbPath);
    readStream.pipe(res);
  } catch (err) {
    console.error('[缩略图] 请求异常:', err.message);
    res.status(500).json({ success: false, error: '获取缩略图失败' });
  }
});

/**
 * GET /api/files/download-zip
 * 批量下载指定文件，动态打包为 ZIP (流式输出，不写磁盘)
 */
router.get('/download-zip', async (req, res) => {
  try {
    let files = req.query.files;
    if (!files) {
      return res.status(400).json({ success: false, error: '未指定要下载的文件' });
    }

    if (!Array.isArray(files)) {
      // 兼容旧的逗号分隔（虽然前端已更新，但为了鲁棒性保留）
      files = typeof files === 'string' && files.includes(',') ? files.split(',') : [files];
    }
    
    // 移除空白字符
    files = files.map(f => f.trim()).filter(f => f);

    if (files.length === 0) {
      return res.status(400).json({ success: false, error: '文件列表为空' });
    }

    const archive = new archiver.ZipArchive({
      zlib: { level: 1 } // 设置为 1 降低压缩级别，追求极限打包速度
    });

    let hasFiles = false;

    // 遍历添加文件
    for (const filename of files) {
      if (!filename) continue;
      
      const filePath = path.join(config.shareDir, filename);
      const resolvedPath = path.resolve(filePath);

      // 安全检查：防目录穿越攻击
      if (!resolvedPath.startsWith(path.resolve(config.shareDir))) {
        console.warn(`[打包下载] 拦截非法路径尝试: ${filename}`);
        continue;
      }

      try {
        await fs.promises.access(filePath);
        console.log(`[download-zip] 请求文件: "${filename}", 是否存在: true`);
        const stat = await fs.promises.stat(filePath);
        // 忽略处于上传中的临时文件
        if (!filename.endsWith('.uploading') && stat.isFile()) {
          archive.file(filePath, { name: filename });
          hasFiles = true;
        }
      } catch (err) {
        console.log(`[download-zip] 请求文件: "${filename}", 是否存在: false`);
        console.warn(`[打包下载] 文件不存在被跳过: ${filename}`);
      }
    }

    if (!hasFiles) {
      // 如果没有一个有效文件，立刻返回错误，防止生成一个空 zip
      return res.status(404).json({ success: false, error: '没有找到可打包的有效文件' });
    }

    // 动态生成带有时间戳的文件名，避免每次下载名称都一样
    const downloadType = req.query.type === 'album' ? 'Album' : 'Batch';
    // 例如：LANBeamDrop_Album_2023-10-24_15-30-22.zip
    const timestamp = new Date().toLocaleString('zh-CN', { hour12: false }).replace(/[:\s\/]/g, '_');
    
    // 设置响应头，告诉浏览器这是一个 ZIP 下载流
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="LANBeamDrop_${downloadType}_${timestamp}.zip"`);

    // 监听错误
    archive.on('error', (err) => {
      console.error('[打包下载] Archiver 错误:', err.message);
      if (!res.headersSent) {
        res.status(500).json({ success: false, error: '打包过程中发生错误' });
      }
    });

    // 管道连接到 HTTP 响应
    archive.pipe(res);

    // 完成打包并结束流
    archive.finalize();

  } catch (err) {
    console.error('[打包下载] 错误:', err);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: '服务端内部错误' });
    }
  }
});

// GET /api/files/check-zip
// 用于前端预检，防止点击下载时页面跳转到错误 JSON
router.get('/check-zip', async (req, res) => {
  try {
    let files = req.query.files;
    if (!files) return res.status(400).json({ success: false, error: '未指定要检查的文件' });
    
    if (!Array.isArray(files)) {
      files = typeof files === 'string' && files.includes(',') ? files.split(',') : [files];
    }
    
    files = files.map(f => f.trim()).filter(f => f);

    for (const filename of files) {
      const filePath = path.join(config.shareDir, filename);
      const resolvedPath = path.resolve(filePath);
      if (!resolvedPath.startsWith(path.resolve(config.shareDir))) {
        console.log(`[check-zip] 路径越界: ${resolvedPath}`);
        continue;
      }

      try {
        await fs.promises.access(filePath);
        console.log(`[check-zip] 检查文件: "${filename}", 路径: "${filePath}", 是否存在: true`);
        const stat = await fs.promises.stat(filePath);
        if (!filename.endsWith('.uploading') && stat.isFile()) {
          // 只要找到一个有效文件即可打包
          return res.json({ valid: true });
        }
      } catch (err) {
        console.log(`[check-zip] 检查文件: "${filename}", 路径: "${filePath}", 是否存在: false`);
      }
    }
    return res.json({ valid: false });
  } catch (err) {
    return res.json({ valid: false });
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
router.post('/upload', (req, res, next) => {
  // 动态检查 Content-Length，实现实时热重载上限拦截
  const contentLength = parseInt(req.headers['content-length'] || '0', 10);
  // 允许 1MB 的 FormData 冗余开销
  if (config.maxFileSize && contentLength > config.maxFileSize + 1 * 1024 * 1024) {
    // 必须先完整排空请求流，再发送响应，否则 macOS/Linux 会因管道未读完而 ECONNRESET
    req.resume();
    req.on('end', () => {
      res.status(413).json({ 
        success: false, 
        error: `文件大小超过限制（最大 ${Math.round(config.maxFileSize / 1024 / 1024 / 1024)}GB）` 
      });
    });
    req.on('error', () => {
      if (!res.headersSent) {
        res.status(413).json({ success: false, error: '文件大小超过限制' });
      }
    });
    return;
  }
  next();
}, upload.array('files', 20), (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, error: '未选择文件' });
    }

    const uploaded = req.files.map((f) => {
      const finalPath = f.path.replace(/\.uploading$/, '');
      const finalName = f.filename.replace(/\.uploading$/, '');
      
      try {
        fs.renameSync(f.path, finalPath);
      } catch (renameErr) {
        console.error('[文件] 重命名失败:', renameErr.message);
        // Fallback to original path if rename fails
        return { name: f.filename, size: f.size, path: f.path };
      }
      
      let mtime = new Date().toISOString();
      try {
        const stats = fs.statSync(finalPath);
        mtime = stats.mtime.toISOString();
      } catch (e) { /* ignore */ }
      
      return {
        name: finalName,
        size: f.size,
        path: finalPath,
        mtime: mtime
      };
    });

    console.log(`[文件] 收到 ${uploaded.length} 个文件:`, uploaded.map((f) => f.name).join(', '));

    broadcastUpdate('FILE_ADDED', { files: uploaded });

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
 * POST /api/files/batch-delete
 * 批量删除文件
 */
router.post('/batch-delete', (req, res) => {
  try {
    const files = req.body.files;
    if (!Array.isArray(files) || files.length === 0) {
      return res.status(400).json({ success: false, error: '未提供有效的文件列表' });
    }

    const deletedFiles = [];
    const failedFiles = [];

    files.forEach(rawFilename => {
      // 防止路径穿越
      const filename = path.basename(decodeURIComponent(rawFilename));
      const filePath = path.join(config.shareDir, filename);

      const resolvedPath = path.resolve(filePath);
      if (!resolvedPath.startsWith(path.resolve(config.shareDir))) {
        failedFiles.push({ filename, reason: '非法路径' });
        return;
      }

      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
          deletedFiles.push(filename);
          console.log(`[文件] 批量删除成功: ${filename}`);
        } catch (err) {
          failedFiles.push({ filename, reason: err.message });
          console.error(`[文件] 批量删除失败: ${filename}`, err.message);
        }
      } else {
        failedFiles.push({ filename, reason: '文件不存在' });
      }
    });

    if (deletedFiles.length > 0) {
      broadcastUpdate('FILE_DELETED', { deletedFiles });
    }

    res.json({
      success: true,
      message: `成功删除 ${deletedFiles.length} 个文件`,
      deletedFiles,
      failedFiles
    });
  } catch (err) {
    console.error('[文件] 批量删除总异常:', err.message);
    res.status(500).json({ success: false, error: '批量删除失败' });
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

    broadcastUpdate('FILE_DELETED', { deletedFiles: [filename] });

    res.json({ success: true, message: `已删除 ${filename}` });
  } catch (err) {
    console.error('[文件] 删除失败:', err.message);
    res.status(500).json({ success: false, error: '删除失败' });
  }
});

module.exports = router;
