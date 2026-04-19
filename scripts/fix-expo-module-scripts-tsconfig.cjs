const fs = require('fs');
const path = require('path');

function main() {
  const packageDir = path.join(process.cwd(), 'node_modules', 'expo-module-scripts');
  const source = path.join(packageDir, 'tsconfig.base.json');
  const target = path.join(packageDir, 'tsconfig.base');
  const packageJsonPath = path.join(packageDir, 'package.json');
  const expoDeviceTsConfigPath = path.join(process.cwd(), 'node_modules', 'expo-device', 'tsconfig.json');

  if (!fs.existsSync(packageDir) || !fs.existsSync(source)) {
    return;
  }

  try {
    const content = fs.readFileSync(source, 'utf8');
    if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== content) {
      fs.writeFileSync(target, content, 'utf8');
    }

    if (fs.existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      const exportsField = packageJson.exports && typeof packageJson.exports === 'object'
        ? packageJson.exports
        : null;

      if (exportsField && !exportsField['./tsconfig.base']) {
        exportsField['./tsconfig.base'] = './tsconfig.base.json';
        fs.writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`, 'utf8');
      }
    }

    if (fs.existsSync(expoDeviceTsConfigPath)) {
      const rawTsConfig = fs.readFileSync(expoDeviceTsConfigPath, 'utf8');
      const normalizedTsConfig = rawTsConfig.replace(/^\s*\/\/.*$/gm, '');
      const expoDeviceTsConfig = JSON.parse(normalizedTsConfig);
      expoDeviceTsConfig.extends = '../expo-module-scripts/tsconfig.base.json';
      expoDeviceTsConfig.compilerOptions = {
        ...(expoDeviceTsConfig.compilerOptions || {}),
        rootDir: './src',
      };
      fs.writeFileSync(expoDeviceTsConfigPath, `${JSON.stringify(expoDeviceTsConfig, null, 2)}\n`, 'utf8');
    }
  } catch (error) {
    console.warn('[postinstall] Unable to patch expo-module-scripts tsconfig.base alias:', error.message);
  }
}

main();
