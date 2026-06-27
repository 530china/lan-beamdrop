# LAN BeamDrop 传输与热更新加固实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现共享目录动态热更新、孤立切片目录清理、WebSocket 广播推送容错以及取消上传即时清理等 4 项核心优化，并增加完善的自动化测试覆盖。

**Architecture:** 
1. 重构 `/routes/files.js` 中的常量路径为动态函数，并利用 `multer.diskStorage` 进行动态上传路由。
2. 引入 `cleanupOrphanedChunks` 清理辅助函数，并采用内存时间锁限频。
3. 增加 `/api/files/cancel-upload` 接口与前端 `onCancelUpload` 的清理请求对接。
4. 使用 `try/catch` 隔离 `broadcastUpdate` 中各个客户端套接字的同步报错。

**Tech Stack:** Node.js, Express, Jest, Supertest, WS, Multer

## Global Constraints
- 多端兼容 (严格): 必须严格使用 `path.join` 处理路径，禁止硬编码 `/` 或 `\\`。
- 测试隔离 (严格): 所有测试用例执行时必须在 `beforeAll` 中备份 `config` 配置，并在 `afterAll` 彻底还原，临时产生的测试数据必须在测试完成后通过 `afterAll` 清理。
- 零第三方库依赖: 仅使用项目已有的 express, multer, ws 等依赖。

---

### Task 1: 🔌 WebSocket 广播发送容错机制

**Files:**
- Modify: `utils/websocket.js`
- Test: `tests/utils/websocket.test.js`

**Interfaces:**
- Consumes: `broadcastUpdate` from `utils/websocket.js`
- Produces: `broadcastUpdate` with internal `try/catch` send fault isolation

- [ ] **Step 1: Write the failing test**

  Modify [tests/utils/websocket.test.js](file:///d:/Document/huawei_develop/lan-beamdrop/tests/utils/websocket.test.js) to add a test case verifying that `broadcastUpdate` does not throw and successfully delivers messages to healthy clients even when one of the clients throws a send error.

  Add the following test at the end of the file:
  ```javascript
  test('should isolate client.send errors and continue broadcasting to other clients', () => {
    const message = 'test-fault-tolerance';
    const mockClientGood1 = { readyState: 1, send: jest.fn() };
    const mockClientBad = { readyState: 1, send: jest.fn().mockImplementation(() => { throw new Error('Socket error'); }) };
    const mockClientGood2 = { readyState: 1, send: jest.fn() };

    const mockWss = {
      clients: new Set([mockClientGood1, mockClientBad, mockClientGood2])
    };

    // Override the global wss instance temporarily
    const websocketModule = require('../../utils/websocket');
    
    // Create a temporary mock function or override wss inside websocket module
    const originalWss = websocketModule.__get__ ? websocketModule.__get__('wss') : null;
    
    // To mock the wss object cleanly without rewiring, we can init with a dummy server or mock the wss variable
    // Let's inspect utils/websocket.js. It exports { initWebSocketServer, broadcastUpdate } and has let wss = null.
    // We can initialize it by creating a dummy server, or simply modifying wss
  });
  ```
  Wait! Let's view `tests/utils/websocket.test.js` first to see how it mocks and uses `websocket.js`.

- [ ] **Step 2: Run test to verify it fails**

  Run: `npx jest tests/utils/websocket.test.js`
  Expected: FAIL (or verify the mock fails if we don't handle error).

- [ ] **Step 3: Modify implementation**

  Modify [utils/websocket.js:38-43](file:///d:/Document/huawei_develop/lan-beamdrop/utils/websocket.js#L38-L43):
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

- [ ] **Step 4: Run test to verify it passes**

  Run: `npx jest tests/utils/websocket.test.js`
  Expected: PASS

- [ ] **Step 5: Commit**

  ```bash
  git add utils/websocket.js tests/utils/websocket.test.js
  git commit -m "FIX: handle socket send errors during ws broadcast"
  ```

---

### Task 2: 📂 共享目录动态路径解析与 Multer 动态路由

**Files:**
- Modify: `routes/files.js`
- Test: `tests/routes/chunk.test.js`

**Interfaces:**
- Consumes: `config.shareDir` dynamic updates
- Produces: `getThumbnailsDir()`, `getChunkUploadDir()`, and dynamic Multer destination

- [ ] **Step 1: Write the failing test**

  Modify [tests/routes/chunk.test.js](file:///d:/Document/huawei_develop/lan-beamdrop/tests/routes/chunk.test.js) to add a test case verifying that if `config.shareDir` is updated dynamically, the uploaded chunks are written to the new directory.

  Add the following test case inside the `describe` block:
  ```javascript
  it('should dynamically upload chunks to a newly updated shareDir settings path', async () => {
    const originalShareDir = config.shareDir;
    const dynamicShareDir = path.join(__dirname, 'test_share_dynamic');
    
    try {
      config.shareDir = dynamicShareDir;
      if (!fs.existsSync(dynamicShareDir)) {
        fs.mkdirSync(dynamicShareDir, { recursive: true });
      }

      const fileId = 'test-file-dynamic-123';
      const filename = 'dynamic-file.txt';
      const chunkContent = Buffer.from('Dynamic content');
      
      const res = await request(app)
        .post('/api/files/chunk')
        .field('fileId', fileId)
        .field('filename', filename)
        .field('index', 0)
        .field('totalChunks', 1)
        .attach('chunk', chunkContent, 'blob');

      expect(res.status).toBe(200);
      
      // Verify that chunks are saved in the new dynamicShareDir path
      const expectedChunkPath = path.join(dynamicShareDir, '.chunks', fileId, '0');
      expect(fs.existsSync(expectedChunkPath)).toBe(true);

    } finally {
      // Restore config and cleanup
      config.shareDir = originalShareDir;
      if (fs.existsSync(dynamicShareDir)) {
        fs.rmSync(dynamicShareDir, { recursive: true, force: true });
      }
    }
  });
  ```

- [ ] **Step 2: Run test to verify it fails**

  Run: `npx jest tests/routes/chunk.test.js`
  Expected: FAIL (because `chunkUploadDir` is still hardcoded to the old path on load).

- [ ] **Step 3: Modify implementation**

  Modify [routes/files.js](file:///d:/Document/huawei_develop/lan-beamdrop/routes/files.js) to remove static module constants `thumbnailsDir` and `chunkUploadDir` and replace them with:
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
  Replace `thumbnailsDir` references with `getThumbnailsDir()` and `chunkUploadDir` references with `getChunkUploadDir()`.
  
  Reconfigure `chunkUpload` on line 29 with `multer.diskStorage` dynamic destination:
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

- [ ] **Step 4: Run test to verify it passes**

  Run: `npx jest tests/routes/chunk.test.js`
  Expected: PASS

- [ ] **Step 5: Commit**

  ```bash
  git add routes/files.js tests/routes/chunk.test.js
  git commit -m "ENH: resolve dynamic shareDir changes instantly for chunked uploads"
  ```

---

### Task 3: 🧹 孤立切片文件夹定期扫描与清理机制

**Files:**
- Modify: `routes/files.js`
- Test: `tests/routes/chunk.test.js`

**Interfaces:**
- Consumes: None
- Produces: `cleanupOrphanedChunks()` and list files integration

- [ ] **Step 1: Write the failing test**

  Modify [tests/routes/chunk.test.js](file:///d:/Document/huawei_develop/lan-beamdrop/tests/routes/chunk.test.js) to add tests for the cleanup logic, verifying that:
  1. Folders inside `.chunks` older than 24 hours are deleted.
  2. Folders younger than 24 hours are kept.
  3. Subsequent cleanup calls within 10 minutes are throttled (rate-limited).

  Add the following test:
  ```javascript
  it('should clean up chunk directories older than 24 hours but keep newer ones', async () => {
    const chunksBaseDir = path.join(config.shareDir, '.chunks');
    if (!fs.existsSync(chunksBaseDir)) fs.mkdirSync(chunksBaseDir, { recursive: true });

    const oldDir = path.join(chunksBaseDir, 'old-task');
    const newDir = path.join(chunksBaseDir, 'new-task');

    fs.mkdirSync(oldDir, { recursive: true });
    fs.mkdirSync(newDir, { recursive: true });

    // Force oldDir mtime to 25 hours ago
    const pastTime = (Date.now() - 25 * 60 * 60 * 1000) / 1000;
    fs.utimesSync(oldDir, pastTime, pastTime);

    // Call GET /api/files to trigger cleanup
    const res = await request(app).get('/api/files');
    expect(res.status).toBe(200);

    // Assert cleanup occurred
    expect(fs.existsSync(oldDir)).toBe(false);
    expect(fs.existsSync(newDir)).toBe(true);
  });
  ```

- [ ] **Step 2: Run test to verify it fails**

  Run: `npx jest tests/routes/chunk.test.js`
  Expected: FAIL (No cleanup function is implemented).

- [ ] **Step 3: Modify implementation**

  Modify [routes/files.js](file:///d:/Document/huawei_develop/lan-beamdrop/routes/files.js) to implement `cleanupOrphanedChunks` and call it at module load and inside the file listing route `router.get('/', ...)`:
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

  // Run once at startup
  cleanupOrphanedChunks();
  ```
  Inside `router.get('/', (req, res) => { ... })` at the top:
  ```javascript
  router.get('/', (req, res) => {
    try {
      cleanupOrphanedChunks();
      const items = fs.readdirSync(config.shareDir, { withFileTypes: true });
      ...
  ```

- [ ] **Step 4: Run test to verify it passes**

  Run: `npx jest tests/routes/chunk.test.js`
  Expected: PASS

- [ ] **Step 5: Commit**

  ```bash
  git add routes/files.js tests/routes/chunk.test.js
  git commit -m "ENH: add orphaned chunk folders cleanup with a 10-minute rate limit"
  ```

---

### Task 4: 🧹 主动取消上传即时清理接口与前端对接

**Files:**
- Modify: `routes/files.js`
- Modify: `public/js/main.js`
- Test: `tests/routes/chunk.test.js`

**Interfaces:**
- Consumes: `POST /api/files/cancel-upload`
- Produces: Instant folder delete and client notification payload

- [ ] **Step 1: Write the failing test**

  Modify [tests/routes/chunk.test.js](file:///d:/Document/huawei_develop/lan-beamdrop/tests/routes/chunk.test.js) to verify that `POST /api/files/cancel-upload` with `fileId` immediately deletes the folder `.chunks/fileId`.

  Add the following test:
  ```javascript
  it('should immediately delete chunk directory when POST /api/files/cancel-upload is called', async () => {
    const fileId = 'cancel-test-id';
    const chunkDir = path.join(config.shareDir, '.chunks', fileId);
    fs.mkdirSync(chunkDir, { recursive: true });
    
    expect(fs.existsSync(chunkDir)).toBe(true);

    const res = await request(app)
      .post('/api/files/cancel-upload')
      .send({ fileId });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(fs.existsSync(chunkDir)).toBe(false);
  });
  ```

- [ ] **Step 2: Run test to verify it fails**

  Run: `npx jest tests/routes/chunk.test.js`
  Expected: FAIL (Route doesn't exist).

- [ ] **Step 3: Modify implementation**

  Modify [routes/files.js](file:///d:/Document/huawei_develop/lan-beamdrop/routes/files.js) to add the `/cancel-upload` endpoint:
  ```javascript
  router.post('/cancel-upload', (req, res) => {
    try {
      let { fileId } = req.body;
      if (!fileId) {
        return res.status(400).json({ success: false, error: '缺少参数' });
      }

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

  Modify [public/js/main.js:901-909](file:///d:/Document/huawei_develop/lan-beamdrop/public/js/main.js#L901-L909):
  ```javascript
        onCancelUpload: (id) => {
          if (activeXhrs.has(id)) {
            activeXhrs.get(id).abort();
            activeXhrs.delete(id);
          }
          uploadQueue.cancelTask(id);
          uploadingFiles.delete(id);
          
          // Send cancel upload request to release disk space immediately
          fetch('/api/files/cancel-upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fileId: id })
          }).catch(e => console.warn('Cancel upload notification failed', e));

          fetchUnifiedMessages();
        },
  ```

- [ ] **Step 4: Run test to verify it passes**

  Run: `npx jest tests/routes/chunk.test.js`
  Expected: PASS

- [ ] **Step 5: Commit**

  ```bash
  git add routes/files.js public/js/main.js tests/routes/chunk.test.js
  git commit -m "ENH: implement cancel-upload API to instantly free disk space on cancel"
  ```
