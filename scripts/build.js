const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const bundlePath = path.join(rootDir, 'bundle.js');
const pkgConfigPath = path.join(rootDir, 'lan-beamdrop.json');

console.log('====================================');
console.log('   LAN BeamDrop - 构建管线启动');
console.log('====================================\n');

try {
  // 第一步：使用 esbuild 解析 ESM 并合并代码
  console.log('[1/3] 正在使用 esbuild 抹平 ESM 依赖碎片...');
  execSync('npx esbuild server.js --bundle --minify --platform=node --outfile=bundle.js --format=cjs', { 
    stdio: 'inherit',
    cwd: rootDir
  });

  // 第二步：生成专用的 pkg 构建配置（不污染项目核心的 package.json）
  console.log('\n[2/3] 正在生成虚拟打包配置...');
  const pkgConfig = {
    name: "lan-beamdrop",
    bin: "bundle.js",
    pkg: {
      assets: ["public/**/*"]
    }
  };
  fs.writeFileSync(pkgConfigPath, JSON.stringify(pkgConfig, null, 2));

  // 第三步：调用 pkg 进行交叉编译
  console.log('\n[3/3] 正在封装各平台原生二进制文件 (这可能需要一分钟)...');
  execSync('npx pkg lan-beamdrop.json -C GZip -t node18-win-x64,node18-mac-x64,node18-linux-x64 --out-path dist', { 
    stdio: 'inherit',
    cwd: rootDir
  });

  console.log('\n✅ [成功] 所有二进制文件已输出至 dist/ 目录。');
} catch (error) {
  console.error('\n❌ [失败] 构建管线异常中止:', error.message);
  process.exit(1);
} finally {
  // 第四步：兜底清理（无论成功失败都会执行，绝不残留临时文件）
  console.log('\n[清理] 正在销毁中间产物...');
  if (fs.existsSync(bundlePath)) {
    fs.unlinkSync(bundlePath);
    console.log('  - 已删除 bundle.js');
  }
  if (fs.existsSync(pkgConfigPath)) {
    fs.unlinkSync(pkgConfigPath);
    console.log('  - 已删除 lan-beamdrop.json');
  }
}
