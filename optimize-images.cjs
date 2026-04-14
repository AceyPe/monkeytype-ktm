/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const TARGET_DIR = process.argv[2] || './public/img';

/**
 * Recursively walk a directory and return file paths
 */
function walkDir(dir, fileList = []) {
  const files = fs.readdirSync(dir, { withFileTypes: true });

  for (const file of files) {
    const fullPath = path.join(dir, file.name);

    if (file.isDirectory()) {
      walkDir(fullPath, fileList);
    } else {
      fileList.push(fullPath);
    }
  }

  return fileList;
}

if (!fs.existsSync(TARGET_DIR)) {
  console.error(`Directory not found: ${TARGET_DIR}`);
  process.exit(1);
}

const validExts = ['.jpg', '.jpeg', '.png'];

const files = walkDir(TARGET_DIR).filter((file) =>
  validExts.includes(path.extname(file).toLowerCase())
);

for (const file of files) {
  const output = file.replace(/\.[^/.]+$/, '.webp');

  if (fs.existsSync(output)) {
    console.log(`Skipping: ${output} already exists`);
    continue;
  }

  const ffmpeg = spawn('ffmpeg', [
    '-loglevel',
    'error',
    '-i',
    file,
    '-vcodec',
    'libwebp',
    '-lossless',
    '0',
    '-q:v',
    '70',
    '-preset',
    'default',
    output,
  ]);

  ffmpeg.on('close', (code) => {
    if (code === 0) {
      console.log(`Converted: ${file}`);
    } else {
      console.error(`Failed to convert: ${file}`);
    }
  });
}
