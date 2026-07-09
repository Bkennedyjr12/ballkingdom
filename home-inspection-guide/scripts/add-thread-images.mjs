import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { cleanInputName, ensureDirs, inputDir, slugify, supportedInputExtensions } from './pipeline-utils.mjs';

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', shell: false });
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(' ')} exited with ${code}`));
    });
  });
}

async function collectFiles(targetPath) {
  const stats = await fs.stat(targetPath);
  if (stats.isFile()) {
    return supportedInputExtensions.has(path.extname(targetPath).toLowerCase()) ? [targetPath] : [];
  }
  if (!stats.isDirectory()) return [];
  const entries = await fs.readdir(targetPath, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => collectFiles(path.join(targetPath, entry.name))));
  return nested.flat();
}

async function copyInputImage(file) {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.heic' || ext === '.heif') {
    const destination = path.join(inputDir, `${slugify(path.parse(file).name)}.jpg`);
    await run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', file, '-frames:v', '1', destination]);
    return destination;
  }
  const destination = path.join(inputDir, cleanInputName(file));
  await fs.copyFile(file, destination);
  return destination;
}

async function main() {
  await ensureDirs();
  const args = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
  const skipPdf = process.argv.includes('--no-pdf');

  if (args.length === 0) {
    console.error('Usage: npm run hi:add -- /path/to/photo-or-folder [...more] [--no-pdf]');
    process.exit(1);
  }

  const files = (await Promise.all(args.map((arg) => collectFiles(path.resolve(arg))))).flat();
  if (files.length === 0) {
    console.error('No supported image files found. Supported: jpg, jpeg, png, webp, tif, tiff, heic.');
    process.exit(1);
  }

  for (const file of files) {
    const destination = await copyInputImage(file);
    console.log(`Added ${file} -> ${destination}`);
  }

  await run('npm', ['run', 'hi:ingest']);
  await run('npm', ['run', 'hi:build']);
  if (!skipPdf) await run('npm', ['run', 'hi:pdf']);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
