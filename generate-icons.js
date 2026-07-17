import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const PUBLIC_DIR = './public';
const LOGO_PNG = path.join(PUBLIC_DIR, 'logo.png');

async function main() {
  try {
    if (!fs.existsSync(LOGO_PNG)) {
      console.error('Error: logo.png does not exist in /public');
      process.exit(1);
    }

    console.log('Using logo.png as the single master branding asset...');

    const sizes = [
      { size: 72, name: 'icon-72.png' },
      { size: 96, name: 'icon-96.png' },
      { size: 128, name: 'icon-128.png' },
      { size: 144, name: 'icon-144.png' },
      { size: 152, name: 'icon-152.png' },
      { size: 180, name: 'icon-180.png' },
      { size: 192, name: 'icon-192.png' },
      { size: 384, name: 'icon-384.png' },
      { size: 512, name: 'icon-512.png' },
      { size: 512, name: 'icon.png' },
      { size: 32, name: 'favicon.png' }
    ];

    for (const item of sizes) {
      const destPath = path.join(PUBLIC_DIR, item.name);
      console.log(`Generating ${item.name} (${item.size}x${item.size})...`);
      
      // Temporary path to avoid any potential locking issues (though logo.png is not written to)
      const tempPath = destPath + '.tmp';
      await sharp(LOGO_PNG)
        .resize(item.size, item.size)
        .png()
        .toFile(tempPath);
      
      if (fs.existsSync(destPath)) {
        fs.unlinkSync(destPath);
      }
      fs.renameSync(tempPath, destPath);
    }

    console.log('All icons generated successfully!');
  } catch (error) {
    console.error('An error occurred during icon generation:', error);
    process.exit(1);
  }
}

main();
