import { build } from 'esbuild';
import { mkdir, copyFile } from 'node:fs/promises';
await build({ absWorkingDir: process.cwd(), tsconfigRaw: {}, entryPoints: ['./src/cloud.js'], bundle: true, platform: 'browser', format: 'iife', outfile: 'cloud.bundle.js', target: 'chrome110', minify: true });
await mkdir('www', { recursive: true });
for (const file of ['index.html', 'firebase-config.js', 'cloud.bundle.js']) await copyFile(file, `www/${file}`);
console.log('웹 코드 및 안드로이드 앱용 www 생성 완료');
