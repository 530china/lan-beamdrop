const express = require('express');
const config = require('../config');
const router = express.Router();

/**
 * POST /api/auth/login
 * 验证手动输入的 PIN 码
 */
router.post('/login', (req, res) => {
  const { pin } = req.body;

  // 检查是否启用了密码保护
  if (!config.accessPassword) {
    return res.json({ success: true, message: '无需密码' });
  }

  // 验证 PIN（无论是随机生成的存在 global.CURRENT_PIN，还是固定密码 config.accessPassword）
  const expectedPin = global.CURRENT_PIN || config.accessPassword;

  if (String(pin) === String(expectedPin)) {
    // 验证成功，下发 Cookie（使用长期 Token 作为 Cookie 值）
    res.cookie('beamdrop_auth', global.ACCESS_TOKEN, {
      httpOnly: true,
      maxAge: 30 * 24 * 60 * 60 * 1000 // 30天有效
    });
    return res.json({ success: true, message: '登录成功' });
  } else {
    return res.status(401).json({ success: false, error: '配对码错误' });
  }
});

module.exports = router;
