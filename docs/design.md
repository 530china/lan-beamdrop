# LAN Drop 系统设计文档

## 1. 系统架构
本系统采用轻量级的 **B/S (Browser/Server) 架构**：
*   **后端**：Node.js + Express。专注于提供 RESTful API，并处理流式文件的高速读写。不引入任何数据库，保证极简性和易部署性。
*   **前端**：Vanilla JavaScript (原生 JS) + HTML5 + CSS3。不依赖 React/Vue 等框架，实现真正的零依赖、秒开体验。

## 2. 核心模块设计

### 2.1 存储设计
*   **文本历史**：采用服务端内存数组 `clipboardHistory` 存储，重启服务即清空。
*   **文件存储**：采用本地文件系统存储。所有文件统一存放于 `C:\Users\<UserName>\LanDrop`。服务端通过 `fs.readdirSync` 和 `fs.statSync` 即时读取目录状态。
*   **客户端识别**：前端通过 `localStorage` 持久化生成唯一的 `clientId`，通过 `navigator.userAgent` 提取设备特征（DeviceName），在请求时随 Payload 发送给后端。

### 2.2 前后端接口契约 (RESTful API)
*   **`GET /api/info`**：获取主机名称等基础信息。
*   **`GET /api/clipboard`**：拉取内存中的文本历史记录。
*   **`POST /api/clipboard`**：发送新文本。
    *   Payload: `{ content, clientId, deviceName }`
*   **`GET /api/files`**：获取 `LanDrop` 目录下的所有文件列表及元数据 (mtime, size)。
*   **`POST /api/files/upload`**：基于 `multer` 的 `multipart/form-data` 接收流式文件上传。
*   **`GET /api/files/download/:filename`**：获取指定文件的读取流进行下载。

### 2.3 前端核心逻辑
*   **轮询同步机制**：为了保持界面的实时性，前端采用 `setInterval` (2000ms) 轮询 `fetchUnifiedMessages()` 函数。
*   **异构数据融合算法**：
    1. 分别 Fetch `/api/clipboard` (文本) 和 `/api/files` (文件)。
    2. 将两种不同格式的数据映射为统一的 `Message` 对象结构。
    3. 合并正在上传的任务队列 `uploadingFiles` (乐观 UI)。
    4. 将混合数组按照 `timestamp` (文本记录时间或文件的 `mtime`) 重新 `sort` 排序。
    5. 截取 `.slice(-100)` 防止内存溢出。
    6. 计算当前数组特征键值（`lastMessagesKey`），如果无变化则跳过渲染，有效降低 DOM 重绘开销。

### 3. 性能优化与安全性考虑
1. **流式传输**：文件上传与下载均通过 Node.js Stream 管道 (`pipe`) 处理，无需将大文件完全读入内存，保障服务端内存安全，充分压榨局域网带宽。
2. **DOM 性能**：采用 Diff 理念比对数据状态，仅在内容更新时重写 DOM。
3. **安全拦截**：在文件下载和删除 API 中，使用 `path.resolve` 严格校验路径前缀，防范目录遍历 (Path Traversal) 漏洞。

## 4. 工程与迭代原则 (Engineering & Iteration Principles)
1. **根因修复原则 (Root Cause Resolution)**：面对缺陷时，必须通过代码逻辑走查、日志分析与并发状态推演，定位到引发问题的最底层原因（Root Cause）。严禁基于表象进行猜测式修复，以避免让用户反复测试。
2. **正向设计原则 (Forward Design over Patching)**：修复问题时，应从系统全局和核心逻辑进行正向重新设计（如引入精准的状态锁机制）。绝不鼓励为了掩盖现象而“打补丁（Band-aid）”式的防御性编程，坚决拒绝引入新的技术债。
