#!/usr/bin/env node

/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * npm registry 배포 스크립트
 *
 * 사용법:
 *   node scripts/npm-release.js [--otp=123456] [--dry-run]
 *
 * 동작:
 *   1. core 패키지 배포
 *   2. CLI의 core 의존성을 file:../core → ^{version}으로 변경
 *   3. CLI 패키지 배포
 *   4. CLI의 core 의존성을 file:../core로 복원
 *
 * 사전 조건:
 *   - npm login 완료
 *   - npm run build 완료
 *   - @didim365 scope 접근 권한
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const rootDir = process.cwd();
const dryRun = process.argv.includes('--dry-run');
const otpArg = process.argv.find((a) => a.startsWith('--otp='));
const otp = otpArg ? otpArg.split('=')[1] : null;
const otpFlag = otp ? ` --otp=${otp}` : '';

function readPackageJson(packagePath) {
  const fullPath = path.resolve(rootDir, packagePath);
  return JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
}

function writePackageJson(packagePath, data) {
  const fullPath = path.resolve(rootDir, packagePath);
  fs.writeFileSync(fullPath, JSON.stringify(data, null, 2) + '\n');
}

function run(cmd) {
  console.log(`  $ ${cmd}`);
  if (!dryRun) {
    execSync(cmd, { cwd: rootDir, stdio: 'inherit' });
  }
}

// 1. 버전 확인
const corePkg = readPackageJson('packages/core/package.json');
const cliPkg = readPackageJson('packages/cli/package.json');
const coreVersion = corePkg.version;
const cliVersion = cliPkg.version;

console.log(`\n📦 npm release${dryRun ? ' (DRY RUN)' : ''}`);
console.log(`  core: ${corePkg.name}@${coreVersion}`);
console.log(`  cli:  ${cliPkg.name}@${cliVersion}\n`);

// 2. core 배포
console.log('🚀 Step 1: Publishing core...');
run(`npm publish --access public -w ${corePkg.name}${otpFlag}`);
console.log('✅ Core published.\n');

// 3. CLI의 core 의존성을 registry 버전으로 변경
console.log('🔧 Step 2: Updating CLI dependency to registry version...');
const cliPkgPath = 'packages/cli/package.json';
const cliPkgData = readPackageJson(cliPkgPath);
const originalCoreDep = cliPkgData.dependencies[corePkg.name];
cliPkgData.dependencies[corePkg.name] = `^${coreVersion}`;
writePackageJson(cliPkgPath, cliPkgData);
console.log(`  ${corePkg.name}: "${originalCoreDep}" → "^${coreVersion}"\n`);

// 4. CLI 배포
console.log('🚀 Step 3: Publishing CLI...');
try {
  run(`npm publish --access public -w ${cliPkg.name}`);
  console.log('✅ CLI published.\n');
} finally {
  // 5. 복원 (배포 성공/실패 관계없이)
  console.log('🔧 Step 4: Restoring CLI dependency to workspace reference...');
  const restorePkg = readPackageJson(cliPkgPath);
  restorePkg.dependencies[corePkg.name] = originalCoreDep;
  writePackageJson(cliPkgPath, restorePkg);
  console.log(`  ${corePkg.name}: "^${coreVersion}" → "${originalCoreDep}"\n`);
}

console.log(`🎉 Done! Install with:`);
console.log(`  npm install -g ${cliPkg.name}@${cliVersion}\n`);
