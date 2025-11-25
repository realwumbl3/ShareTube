const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const SIZES = [16, 32, 48, 128];
const INPUT_DIR = path.join(__dirname, '../extension/icons/attempts');
const OUTPUT_DIR = path.join(__dirname, '../extension/icons/attempts/rendered');

async function renderAttempts() {
    console.log('🎨 Rendering icon attempts...');

    if (!fs.existsSync(INPUT_DIR)) {
        console.error(`❌ Input directory not found at: ${INPUT_DIR}`);
        process.exit(1);
    }

    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    const files = fs.readdirSync(INPUT_DIR).filter(file => file.endsWith('.svg'));

    if (files.length === 0) {
        console.log('⚠️ No SVG files found in attempts directory.');
        return;
    }

    for (const file of files) {
        const name = path.parse(file).name;
        console.log(`\nProcessing ${name}...`);
        const inputPath = path.join(INPUT_DIR, file);
        const attemptOutputDir = path.join(OUTPUT_DIR, name);

        if (!fs.existsSync(attemptOutputDir)) {
            fs.mkdirSync(attemptOutputDir, { recursive: true });
        }

        // Copy the source SVG to the output folder
        fs.copyFileSync(inputPath, path.join(attemptOutputDir, 'icon.svg'));

        for (const size of SIZES) {
            const filename = `icon-${size}.png`;
            const outputPath = path.join(attemptOutputDir, filename);
            
            try {
                await sharp(inputPath)
                    .resize(size, size)
                    .png()
                    .toFile(outputPath);
                // console.log(`  ✅ Generated ${filename}`);
            } catch (err) {
                console.error(`  ❌ Error generating ${filename}:`, err.message);
            }
        }
        console.log(`  ✅ Rendered all sizes for ${name}`);
    }
    console.log('\n✨ Done!');
}

renderAttempts();

