import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const PUBLIC_DIR = './public';
const LOGO_JPG = path.join(PUBLIC_DIR, 'logo.jpg');
const LOGO_PNG = path.join(PUBLIC_DIR, 'logo.png');

async function main() {
  try {
    if (!fs.existsSync(LOGO_JPG)) {
      console.error('Error: logo.jpg does not exist in /public');
      process.exit(1);
    }

    console.log('Converting logo.jpg to logo.png...');
    await sharp(LOGO_JPG)
      .png()
      .toFile(LOGO_PNG);
    console.log('Successfully created logo.png');

    const sizes = [
      { size: 72, name: 'icon-72.png' },
      { size: 96, name: 'icon-96.png' },
      { size: 128, name: 'icon-128.png' },
      { size: 144, name: 'icon-144.png' },
      { size: 152, name: 'icon-152.png' },
      { size: 192, name: 'icon-192.png' },
      { size: 384, name: 'icon-384.png' },
      { size: 512, name: 'icon-512.png' },
      { size: 512, name: 'icon.png' },
      { size: 32, name: 'favicon.png' }
    ];

    for (const item of sizes) {
      const destPath = path.join(PUBLIC_DIR, item.name);
      console.log(`Generating ${item.name} (${item.size}x${item.size})...`);
      await sharp(LOGO_PNG)
        .resize(item.size, item.size)
        .png()
        .toFile(destPath);
    }

    console.log('All icons generated successfully!');
  } catch (error) {
    console.error('An error occurred during icon generation:', error);
    process.exit(1);
  }
}

main();
