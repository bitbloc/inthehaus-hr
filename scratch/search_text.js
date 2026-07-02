const fs = require('fs');
const path = require('path');

function searchDir(dir, query) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      if (file !== 'node_modules' && file !== '.next' && file !== '.git') {
        searchDir(fullPath, query);
      }
    } else if (stat.isFile() && (file.endsWith('.js') || file.endsWith('.jsx') || file.endsWith('.ts') || file.endsWith('.tsx') || file.endsWith('.sql') || file.endsWith('.txt') || file.endsWith('.md'))) {
      const content = fs.readFileSync(fullPath, 'utf8');
      if (content.includes(query)) {
        console.log(`Found in: ${fullPath}`);
        const lines = content.split('\n');
        lines.forEach((line, idx) => {
          if (line.includes(query)) {
            console.log(`  Line ${idx + 1}: ${line.trim()}`);
          }
        });
      }
    }
  }
}

const root = path.join(__dirname, '..');
console.log('Searching for "ขวด"...');
searchDir(root, 'ขวด');
console.log('Searching for "ยังไม่เปิด"...');
searchDir(root, 'ยังไม่เปิด');
console.log('Searching for "RPC"...');
searchDir(root, 'RPC');
console.log('Searching for "นับสต็อกได้"...');
searchDir(root, 'นับสต็อกได้');
