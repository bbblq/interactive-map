const fs = require('fs');
let content = fs.readFileSync('public/admin.js', 'utf8');
const replacement = `container.innerHTML = Object.entries(iconTypes).map(([key, type]) => \`
        <label style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px; cursor: pointer; padding: 8px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-card);">
            <input type="checkbox" name="viewCategories" value="\${key}" style="width: auto; margin: 0; flex-shrink: 0;">
            <div style="width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; color: \${type.color || 'var(--primary-color)'};">
                \${type.icon || ''}
            </div>
            <span style="flex-grow: 1;">\${escapeHtml(type.name)}</span>
        </label>
    \`).join('');`;
content = content.replace(/container\.innerHTML = Object\.entries\(iconTypes\)\.map\(\(\[key, type\]\) => `[\s\S]*?`\)\.join\('');/, replacement);
fs.writeFileSync('public/admin.js', content, 'utf8');
console.log("Replaced successfully");
