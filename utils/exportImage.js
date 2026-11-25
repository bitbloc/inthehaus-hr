// Capture a DOM node as a PNG (back-office "save PNG" / "copy image for LINE", AGENTS.md §10).
// html2canvas cannot parse modern colour functions (oklch, oklab, color-mix) that the
// Brand v2 tokens use, so the cloned copy gets every colour resolved to rgba first.

const COLOR_PROPS = [
    'color', 'backgroundColor',
    'borderTopColor', 'borderRightColor', 'borderBottomColor', 'borderLeftColor',
    'outlineColor', 'textDecorationColor', 'caretColor', 'columnRuleColor', 'fill', 'stroke',
];
const MODERN = /oklch|oklab|color-mix|\blab\(|\blch\(|color\(/i;

function makeResolver() {
    const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
    ctx.canvas.width = 1;
    ctx.canvas.height = 1;
    const cache = new Map();
    return (value) => {
        if (cache.has(value)) return cache.get(value);
        ctx.clearRect(0, 0, 1, 1);
        ctx.fillStyle = 'rgba(0,0,0,0)';
        ctx.fillStyle = value;
        ctx.fillRect(0, 0, 1, 1);
        const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
        const out = `rgba(${r}, ${g}, ${b}, ${(a / 255).toFixed(3)})`;
        cache.set(value, out);
        return out;
    };
}

export async function captureNodeCanvas(node, { background = '#F6F2EA', scale = 2, width = 760 } = {}) {
    const html2canvas = (await import('html2canvas')).default;
    const resolve = makeResolver();
    return html2canvas(node, {
        scale,
        backgroundColor: background,
        useCORS: true,
        logging: false,
        // Same picture from a phone or a laptop: render the copy at document width
        windowWidth: Math.max(width + 40, 800),
        width,
        onclone: (doc, clone) => {
            const win = doc.defaultView;
            // html2canvas also reads the cloned document's <html>/<body> background
            [doc.documentElement, doc.body].forEach((el) => { if (el) { el.style.backgroundColor = background; el.style.color = '#1A1A1A'; } });
            [clone, ...clone.querySelectorAll('*')].forEach((el) => {
                const cs = win.getComputedStyle(el);
                COLOR_PROPS.forEach((p) => {
                    const v = cs[p];
                    if (v && MODERN.test(v)) el.style[p] = resolve(v);
                });
                if (cs.boxShadow && MODERN.test(cs.boxShadow)) el.style.boxShadow = 'none';
                if (cs.backgroundImage && MODERN.test(cs.backgroundImage)) el.style.backgroundImage = 'none';
            });
            clone.style.width = `${width}px`;
            clone.style.maxWidth = `${width}px`;
            clone.querySelectorAll('.overflow-x-auto').forEach((el) => { el.style.overflow = 'visible'; });
            clone.querySelectorAll('[data-export-hide]').forEach((el) => { el.style.display = 'none'; });
        },
    });
}

export async function downloadNodePng(node, filename, opts) {
    const canvas = await captureNodeCanvas(node, opts);
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = filename;
    a.click();
}

/** Copies the node as an image; returns false when the browser can't write images to the clipboard. */
export async function copyNodePng(node, opts) {
    if (!navigator.clipboard || typeof window.ClipboardItem === 'undefined') return false;
    const canvas = await captureNodeCanvas(node, opts);
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
    await navigator.clipboard.write([new window.ClipboardItem({ 'image/png': blob })]);
    return true;
}
