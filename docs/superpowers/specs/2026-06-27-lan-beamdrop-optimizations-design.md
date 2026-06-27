# 局域网传输健壮性与热更新优化设计规约

本文档记录了关于 LAN BeamDrop 共享目录动态路径切换、大文件分片残留自动清理、WebSocket 消息推送容错以及取消上传时即时清理等 4 项核心优化方案的设计规约。

---

## 1. 目标描述 (Goal Description)

提升局域网传输工具在多用户设置变动、高频大文件传输以及弱网环境下的系统健壮性（Robustness）与磁盘利用率，解决以下体验痛点：
1. 共享路径在网页设置变动后不能热生效，导致文件上传写入旧路径甚至报错。
2. 异常中断或取消的大文件上传会在磁盘遗留大量 2MB 的临时分片，耗尽空间。
3. 网络不稳导致个别设备连接断开时，WebSocket 广播发送抛出同步异常打断整体推送流程。

---

## 2. 方案正向设计 (Proposed Changes)

### 📂 组件一：共享目录动态路径解析与热更新 (Dynamic Path Resolution)

#### [MODIFY] [routes/files.js](file:///d:/Document/huawei_develop/lan-beamdrop/routes/files.js)
- 废弃模块级静态常量 `thumbnailsDir` 和 `chunkUploadDir`。
- 新增动态路径获取 getter 函数：
  ```javascript
  const getThumbnailsDir = () => {
    const dir = path.join(config.shareDir, '.thumbnails');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
  };
  const getChunkUploadDir = () => {
    const dir = path.join(config.shareDir, '.chunks');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
  };
  ```
- 替换所有使用这两个常量的接口实现（`/thumbnail/:filename`、`/chunk`、`/merge` 以及清理接口等）为调用对应的 getter。
- 重构 `multer` chunk 上传中间件，使用 `multer.diskStorage` 自定义 `destination` 方法动态求解：
  ```javascript
  const chunkStorage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, getChunkUploadDir());
    },
    filename: (req, file, cb) => {
      const tempName = 'chunk-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9);
      cb(null, tempName);
    }
  });
  const chunkUpload = multer({ storage: chunkStorage });
  ```

---

### 🧹 组件二：孤立切片清理与取消即时释放 (Cleanup & Freeing Storage)

#### [MODIFY] [routes/files.js](file:///d:/Document/huawei_develop/lan-beamdrop/routes/files.js)
- 增加孤立缓存文件夹扫描与清理辅助函数，加设 10 分钟限频器（`lastCleanupTime`）防止频繁拉取目录导致 I/O 阻塞：
  ```javascript
  let lastCleanupTime = 0;
  function cleanupOrphanedChunks() {
    const now = Date.now();
    if (now - lastCleanupTime < 10 * 60 * 1000) return;
    lastCleanupTime = now;

    try {
      const chunkDir = path.join(config.shareDir, '.chunks');
      if (!fs.existsSync(chunkDir)) return;
      
      const items = fs.readdirSync(chunkDir, { withFileTypes: true });
      items.forEach((item) => {
        if (item.isDirectory()) {
          const itemPath = path.join(chunkDir, item.name);
          const stats = fs.statSync(itemPath);
          if (now - stats.mtimeMs > 24 * 60 * 60 * 1000) {
            fs.rmSync(itemPath, { recursive: true, force: true });
            console.log(`[文件] 已清理超期未合并的孤立切片目录: ${item.name}`);
          }
        }
      });
    } catch (err) {
      console.error('[文件] 清理孤立切片失败:', err.message);
    }
  }
  ```
- **模块装载时**同步调用一次该清理函数。
- **在 `GET /api/files` 路由回调内**调用一次。
- 新增 `POST /api/files/cancel-upload` 接口，接收客户端因主动取消而发送的 `fileId`，当场删除切片目录：
  ```javascript
  router.post('/cancel-upload', (req, res) => {
    try {
      let { fileId } = req.body;
      if (!fileId) return res.status(400).json({ success: false, error: '缺少参数' });
      
      fileId = path.basename(fileId.toString()).replace(/[<>:"\/\\|?*]/g, '_');
      const chunkDir = path.join(getChunkUploadDir(), fileId);
      if (fs.existsSync(chunkDir)) {
        fs.rmSync(chunkDir, { recursive: true, force: true });
      }
      res.json({ success: true, message: '临时分片已清除' });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });
  ```

#### [MODIFY] [public/js/main.js](file:///d:/Document/huawei_develop/lan-beamdrop/public/js/main.js)
- 在客户端取消上传时，除了 abort 正在上传的 XHR/fetch，发送一个取消请求以立即通知服务端清理切片：
  ```javascript
  onCancelUpload: (id) => {
    if (activeXhrs.has(id)) {
      activeXhrs.get(id).abort();
      activeXhrs.delete(id);
    }
    uploadQueue.cancelTask(id);
    uploadingFiles.delete(id);
    
    // 主动通知服务端清理该任务已上传的切片
    fetch('/api/files/cancel-upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileId: id })
    }).catch(e => console.warn('Cancel upload notification failed', e));

    fetchUnifiedMessages();
  }
  ```

---

### 🔌 组件三：WebSocket 广播容错 (WebSocket Resiliency)

#### [MODIFY] [utils/websocket.js](file:///d:/Document/huawei_develop/lan-beamdrop/utils/websocket.js)
- 重构 `broadcastUpdate`，用 `try-catch` 包裹单次 `client.send` 行为以吞掉由于突发断线导致的坏 Socket 同步错误，并采用 warn 级日志输出：
  ```javascript
  wss.clients.forEach((client) => {
    if (client.readyState === 1) { // WebSocket.OPEN
      try {
        client.send(message);
        count++;
      } catch (err) {
        console.warn('[WebSocket] 广播推送至个别设备失败:', err.message);
      }
    }
  });
  ```

---

## 3. 自动化测试与隔离规约 (Verification & Test Isolation)

### 🧪 自动化测试设计
1. **测试隔离保障**：
   - 必须通过修改全局单例 `config.shareDir` 到专用的测试沙箱目录 `tests/routes/temp_test_share` 进行路径热解析和分片测试。
   - 所有测试用例需在 `beforeAll` 备份原配置，并在 `afterAll` 恢复，最后强制使用 `fs.rmSync` 清理沙箱目录。
   - 验证环境变量 `process.env.NODE_ENV = 'test'` 处于激活态，禁止向用户真实 `settings.json` 进行任何读写。
2. **测试场景覆盖**：
   - **动态更新测试**：模拟修改 `shareDir`，测试在 `/chunk` 与 `/merge` 中新目录是否生效。
   - **分片超期清理测试**：向 `.chunks/` 写入过期（25小时前）与活跃文件夹，执行清理并断言过期者被顺利移除，且满足 10 分钟频率限制。
   - **WebSocket 故障隔离测试**：模拟挂载损坏 of Mock 客户端，断言广播能跳过错误继续推送至其他正常设备而不引发全局崩溃。
   - **取消清理接口测试**：发送取消请求，断言对应 `.chunks/<fileId>` 物理目录被即时移除。
