const fs = require('fs');
const code = fs.readFileSync('app/admin/page.js', 'utf8');

// A simple stack-based JSX tag checker
let pos = 0;
const stack = [];
const lines = code.split('\n');

for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Find JSX tags using regex
    const matches = line.matchAll(/<(\/?)([a-zA-Z0-9_\.-]+)([^>]*?)>/g);
    for (const match of matches) {
        const isClosing = !!match[1];
        const tagName = match[2];
        const rest = match[3];
        const isSelfClosing = rest.endsWith('/') || ['img', 'input', 'br', 'hr'].includes(tagName.toLowerCase());

        // Skip comments or non-JSX elements
        if (tagName.startsWith('!') || rest.includes('//')) continue;

        if (isSelfClosing) {
            continue;
        }

        if (isClosing) {
            if (stack.length === 0) {
                console.log(`Unmatched closing tag: </${tagName}> at line ${i + 1}`);
            } else {
                const popped = stack.pop();
                if (popped.name !== tagName) {
                    console.log(`Mismatch: Opened <${popped.name}> at line ${popped.line} but closed with </${tagName}> at line ${i + 1}`);
                }
            }
        } else {
            stack.push({ name: tagName, line: i + 1 });
        }
    }
}

console.log('Remaining open tags in stack:', stack.map(s => `${s.name} (line ${s.line})`));
