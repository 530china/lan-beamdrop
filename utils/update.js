const https = require('https');
const pkg = require('../package.json');

let cachedUpdate = null;
let lastCheckTime = 0;

/**
 * 比较版本号 (SemVer)
 * @param {string} latest - GitHub 获取的新版本号 (如 0.1.4)
 * @param {string} current - 本地版本号 (如 0.1.3)
 * @returns {boolean} - 如果 latest 大于 current 返回 true
 */
function isNewer(latest, current) {
  if (!latest || !current) return false;
  
  const l = latest.replace(/^v/, '').split('.').map(Number);
  const c = current.replace(/^v/, '').split('.').map(Number);
  
  for (let i = 0; i < 3; i++) {
    const lPart = l[i] || 0;
    const cPart = c[i] || 0;
    if (lPart > cPart) return true;
    if (lPart < cPart) return false;
  }
  return false;
}

/**
 * 检查 GitHub 上是否有新版本
 * @returns {Promise<Object>}
 */
function checkUpdate() {
  return new Promise((resolve) => {
    // 缓存 1 小时 (3600000 毫秒)，避免打满 GitHub API 限制
    if (Date.now() - lastCheckTime < 3600000 && cachedUpdate !== null) {
      return resolve(cachedUpdate);
    }

    const options = {
      hostname: 'api.github.com',
      path: '/repos/530china/lan-beamdrop/releases/latest',
      method: 'GET',
      headers: {
        'User-Agent': 'lan-beamdrop-updater',
        'Accept': 'application/vnd.github.v3+json'
      }
    };

    const handleFail = () => {
      cachedUpdate = { hasUpdate: false };
      lastCheckTime = Date.now();
      resolve(cachedUpdate);
    };

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const release = JSON.parse(data);
            if (release && release.tag_name) {
              const latestVer = release.tag_name.replace(/^v/, '');
              const currentVer = pkg.version;
              const hasUpdate = isNewer(latestVer, currentVer);

              cachedUpdate = {
                hasUpdate,
                latestVersion: latestVer,
                currentVersion: currentVer,
                releaseUrl: release.html_url || 'https://github.com/530china/lan-beamdrop/releases/latest'
              };
              lastCheckTime = Date.now();
              return resolve(cachedUpdate);
            }
          } catch (e) {
            // 解析失败不影响主流程
          }
        }
        handleFail();
      });
    });

    req.on('error', () => {
      handleFail(); // 网络报错静默失败，并缓存失败状态
    });

    // 超时控制：3秒内拉不到直接放弃，保证接口返回速度
    req.setTimeout(3000, () => {
      req.abort();
    });

    req.end();
  });
}

// 暴露出清空缓存的方法方便测试
function clearCache() {
  cachedUpdate = null;
  lastCheckTime = 0;
}

module.exports = { checkUpdate, isNewer, clearCache };
