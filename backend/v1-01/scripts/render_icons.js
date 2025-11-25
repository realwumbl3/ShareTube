const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const SIZES = [16, 32, 48, 128];
const INPUT_FILE = path.join(__dirname, '../extension/icons/icon.svg');
const OUTPUT_DIR = path.join(__dirname, '../extension/icons');

async function renderIcons() {
    console.log('🎨 Rendering icons...');
    
    if (!fs.existsSync(INPUT_FILE)) {
        console.error(`❌ Source icon not found at: ${INPUT_FILE}`);
        process.exit(1);
    }

    for (const size of SIZES) {
        const filename = `icon-${size}.png`;
        const outputPath = path.join(OUTPUT_DIR, filename);
        
        try {
            await sharp(INPUT_FILE)
                .resize(size, size)
                .png()
                .toFile(outputPath);
            console.log(`✅ Generated ${filename}`);
        } catch (err) {
            console.error(`❌ Error generating ${filename}:`, err.message);
        }
    }
    console.log('✨ Done!');
}

renderIcons();



