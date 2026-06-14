const fs = require('fs');
let content = fs.readFileSync('public/admin.js', 'utf8');

const targetStr2 = `            const checkboxes = form.querySelectorAll('input[name="viewCategories"]');
            checkboxes.forEach(cb => {
                if ((view.categories || []).includes(cb.value)) {
                    cb.checked = true;
                }
            });`;

const newStr2 = `            const checkboxes = form.querySelectorAll('input[name="viewCategories"]');
            checkboxes.forEach(cb => {
                if ((view.categories || []).includes(cb.value)) {
                    cb.checked = true;
                    if(cb.parentElement.classList.contains('icon-category-card')) {
                        cb.parentElement.classList.add('selected');
                    }
                }
            });`;

const parts = content.split('container.innerHTML = Object.entries(iconTypes)');
if (parts.length > 1) {
    const parts2 = parts[1].split('}).join(\'\');');
    content = parts[0] + 'container.innerHTML = Object.entries(iconTypes)' + 
        '        .sort((a, b) => (a[1].order || 999) - (b[1].order || 999))\n' +
        '        .map(([key, type]) => {\n' +
        '        const color = type.color || \'#9e9e9e\';\n' +
        '        const iconHtml = getMarkerIconSVG(key);\n' +
        '        return `\n' +
        '            <div class="icon-category-card" data-value="${key}" onclick="this.classList.toggle(\\\'selected\\\'); const cb = this.querySelector(\\\'input\\\'); cb.checked = !cb.checked;">\n' +
        '                <input type="checkbox" name="viewCategories" value="${key}" style="display: none;">\n' +
        '                <div class="icon-category-icon" style="background: ${color}1a; color: ${color};">${iconHtml}</div>\n' +
        '                <div class="icon-category-name" style="font-size: 12px; color: var(--text-secondary); margin-top: 4px; text-align: center;">${escapeHtml(type.name)}</div>\n' +
        '            </div>\n' +
        '        `;\n' +
        '    }).join(\'\');' + parts2[1];
    
    content = content.replace(targetStr2, newStr2);
    fs.writeFileSync('public/admin.js', content, 'utf8');
    console.log("Replaced successfully via split!");
} else {
    console.log("Could not find the target string.");
}
