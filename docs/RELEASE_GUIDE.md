# LAN BeamDrop 本地发版指南 (Release Workflow)

为了确保前端页面展示的 `vX.X.X` 版本号与 GitHub 仓库的 Tag 完全一致，强烈建议采用 Node.js 官方推荐的 `npm version` 工作流进行本地自动化发版。

## 为什么不建议手动去 GitHub 打 Tag？
因为前端界面的版本号来源于代码仓库根目录的 `package.json` 文件的 `"version"` 字段。
在 GitHub 网页端手动打 Tag，**并不会**自动修改代码库里的 `package.json`。这会导致远程仓库的 Tag 是 `v0.2.1`，但本地代码库依然停留在 `0.1.1` 的脱节现象。

## ⭐️ 标准操作步骤 (纯净极客流)

当你在本地开发完成，所有代码都已经 `git commit` 后，准备发布新版本时，请按照以下步骤操作：

### 1. 自动更迭版本号
在终端执行以下四条命令之一，npm 会自动帮你修改 `package.json`、生成 Commit，并且打好同名的 Git Tag。

- **精确指定版本号 (最常用)**:
  如果你已经明确知道要发布的版本号（例如刚刚的 `v0.2.1`），直接运行：
  ```bash
  npm version 0.2.1
  # npm 会自动把 package.json 改为 0.2.1，并打好 v0.2.1 的 Git Tag
  ```

- **修复了几个小 Bug 时 (Patch)**:
  ```bash
  npm version patch
  # 自动从 0.1.1 升级到 0.1.2
  ```

- **增加了向下兼容的新功能时 (Minor)**:
  ```bash
  npm version minor
  # 自动从 0.1.1 升级到 0.2.0
  ```

- **底层架构重构，不向下兼容时 (Major)**:
  ```bash
  npm version major
  # 自动从 0.1.1 升级到 1.0.0
  ```

### 2. 将代码与 Tag 一同推送到远程
执行完上述命令后，本地已经准备就绪。只需将带有 Tag 的 Commit 推送到 GitHub：
```bash
git push --follow-tags
```
*(注意：务必带上 `--follow-tags` 参数，否则仅仅会推送代码，不会推送刚刚打好的 Tag。)*

### 3. 去 GitHub 完善 Release Notes
推送完成后，去 GitHub 仓库的 `Releases` 页面，你会看到刚刚推上去的 Tag 已经存在。点击它，选择 `Create release from tag`，填写你的更新日志，然后点击发布即可！

---
通过这种机制，`package.json` 中的版本号永远会与代码提交历史以及 Git Tag 严丝合缝地绑定在一起，再也不会出现前端展示版本落后的乌龙了。
