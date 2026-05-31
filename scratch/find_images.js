const fs = require('fs');

function findImages(filePath) {
    const lines = fs.readFileSync(filePath, 'utf8').split('\n');
    console.log(`=== Images in ${filePath} ===`);
    lines.forEach((line, idx) => {
        if (line.includes('<img') || line.includes('photo_url')) {
            console.log(`${idx + 1}: ${line.trim()}`);
        }
    });
}

findImages('app/admin/page.js');
findImages('app/admin/roster/page.js');
