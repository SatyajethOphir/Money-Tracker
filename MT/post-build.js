import fs from 'fs';
import path from 'path';

const DIST_SW_PATH = path.join(process.cwd(), 'dist', 'sw.js');

async function main() {
  try {
    if (!fs.existsSync(DIST_SW_PATH)) {
      console.error(`Error: Built Service Worker not found at ${DIST_SW_PATH}`);
      process.exit(1);
    }

    let swContent = fs.readFileSync(DIST_SW_PATH, 'utf8');

    // Generate a unique version/timestamp for this build
    const buildTimestamp = Date.now().toString();
    console.log(`Injecting build timestamp into Service Worker: ${buildTimestamp}`);

    // Replace the BUILD_TIMESTAMP placeholder
    swContent = swContent.replace('BUILD_TIMESTAMP', buildTimestamp);

    fs.writeFileSync(DIST_SW_PATH, swContent, 'utf8');
    console.log('Successfully injected cache version and updated sw.js in dist!');
  } catch (err) {
    console.error('An error occurred in post-build script:', err);
    process.exit(1);
  }
}

main();
