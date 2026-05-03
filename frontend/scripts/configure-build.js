#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const buildConfigPath = path.join(__dirname, '../build-config.json');
const packageJsonPath = path.join(__dirname, '../package.json');

try {
  const buildConfig = JSON.parse(fs.readFileSync(buildConfigPath, 'utf8'));
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

  // Actualizar configuración del build
  packageJson.build.productName = buildConfig.appName;
  packageJson.build.appId = buildConfig.appId;
  packageJson.version = buildConfig.version;

  // Escribir cambios
  fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 4));
  console.log(`✓ Build configurado para: "${buildConfig.appName}"`);
} catch (error) {
  console.error('Error configurando build:', error.message);
  process.exit(1);
}
