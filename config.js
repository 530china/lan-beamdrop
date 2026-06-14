const os = require('os');
const path = require('path');

module.exports = {
  // 服务端口
  port: 8765,

  // PC 端共享目录（文件上传到此、文件列表从此读取）
  shareDir: path.join(os.homedir(), 'LANBeamDrop'),

  // 设备名称（默认使用电脑主机名）
  deviceName: os.hostname(),

  // 最大上传文件大小（bytes）— 2GB
  maxFileSize: 2 * 1024 * 1024 * 1024,

  // mDNS 服务类型
  mdnsServiceType: 'lanbeamdrop',

  // 剪切板轮询间隔（毫秒）
  clipboardPollInterval: 2000,
};
