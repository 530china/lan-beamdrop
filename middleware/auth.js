const config = require('../config');
const { isLocalHostReq } = require('../utils/network');

const EXEMPT_PATHS = ['/login.html', '/api/auth/login', '/favicon.ico'];

function authMiddleware(req, res, next) {
  // 0. 本机访问永远拥有最高权限（防止宿主机被锁死）
  if (isLocalHostReq(req)) {
    return next();
  }

  // 1. 如果没有设置密码（裸奔模式），直接放行
  if (!config.accessPassword) {
    return next();
  }

  // 2. 放行白名单路径
  if (EXEMPT_PATHS.includes(req.path)) {
    return next();
  }

  // 3. 检查 URL 中是否携带了一次性授权 Token（扫码秒登）
  if (req.query.token && global.ACCESS_TOKEN && req.query.token === global.ACCESS_TOKEN) {
    res.cookie('beamdrop_auth', global.ACCESS_TOKEN, {
      httpOnly: true,
      maxAge: 30 * 24 * 60 * 60 * 1000 // 30天有效
    });
    // 重定向，去除 URL 中的 token 保持浏览器地址栏干净
    const cleanUrl = req.originalUrl.split('?')[0];
    return res.redirect(cleanUrl);
  }

  // 4. 检查 HttpOnly Cookie
  const authCookie = req.cookies ? req.cookies.beamdrop_auth : null;
  if (authCookie && global.ACCESS_TOKEN && authCookie === global.ACCESS_TOKEN) {
    return next(); // 已登录
  }

  // 5. 拦截未授权访问
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ success: false, error: 'Unauthorized', redirect: '/login.html' });
  } else if (req.path === '/' || req.path === '/index.html') {
    return res.redirect('/login.html');
  } else {
    return res.status(401).send('Unauthorized');
  }
}

module.exports = authMiddleware;
