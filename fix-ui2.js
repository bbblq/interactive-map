const fs = require('fs');
let content = fs.readFileSync('public/admin.js', 'utf8');

const targetStr = `    // Render checkboxes based on iconTypes
    container.innerHTML = Object.entries(iconTypes).map(([key, type]) => \`
        <label style="display: block; margin-bottom: 5px; cursor: pointer;">
            <input type="checkbox" name="viewCategories" value="\${key}">
            \${escapeHtml(type.name)}
        </label>
    \`).join('');`;

const newStr = `    // Render checkboxes based on iconTypes
    container.innerHTML = Object.entries(iconTypes).map(([key, type]) => \`
        <label style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px; cursor: pointer; padding: 8px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-card);">
            <input type="checkbox" name="viewCategories" value="\${key}" style="width: auto; margin: 0; flex-shrink: 0;">
            <div style="width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; color: \${type.color || 'var(--primary-color)'};">
                \${type.icon || ''}
            </div>
            <span style="flex-grow: 1;">\${escapeHtml(type.name)}</span>
        </label>
    \`).join('');`;

if (content.includes(targetStr)) {
    content = content.replace(targetStr, newStr);
    fs.writeFileSync('public/admin.js', content, 'utf8');
    console.log("Replaced successfully!");
} else {
    console.log("Target string not found. Wait, let me search without exact whitespace.");
    const parts = content.split('container.innerHTML = Object.entries(iconTypes).map(([key, type]) => `');
    if (parts.length > 1) {
        const parts2 = parts[1].split('`).join(\'\');');
        content = parts[0] + 'container.innerHTML = Object.entries(iconTypes).map(([key, type]) => `\n' + 
        '        <label style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px; cursor: pointer; padding: 8px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-card);">\n' +
        '            <input type="checkbox" name="viewCategories" value="${key}" style="width: auto; margin: 0; flex-shrink: 0;">\n' +
        '            <div style="width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; color: ${type.color || \'var(--primary-color)\' };">\n' +
        '                ${type.icon || \'\'}\n' +
        '            </div>\n' +
        '            <span style="flex-grow: 1;">${escapeHtml(type.name)}</span>\n' +
        '        </label>\n' +
        '    `).join(\'\');' + parts2[1];
        fs.writeFileSync('public/admin.js', content, 'utf8');
        console.log("Replaced successfully via split!");
    } else {
        console.log("Could not find the target string.");
    }
}
