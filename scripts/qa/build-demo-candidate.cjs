const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '../..');
const relative = '/assets/demo/singapore-source-review/';
const directory = path.join(root, relative.slice(1));
const hash = (b) => crypto.createHash('sha256').update(b).digest('hex');
const script = fs.readFileSync(path.join(root, 'src/demo-complete-path.js'));
const scriptName = 'complete-path.' + hash(script) + '.js';
fs.writeFileSync(path.join(directory, scriptName), script);
const pagePath = path.join(root, 'demo/singapore-source-review/index.html');
let html = fs.readFileSync(pagePath, 'utf8');
html = html.replace(/\/assets\/demo\/singapore-source-review\/complete-path(?:\.[a-f0-9]{64})?\.js/g, relative + scriptName);
for (const name of ['complete-path.css', 'evidence-manifest.json']) {
  const digest = hash(fs.readFileSync(path.join(directory, name)));
  const pattern = new RegExp(relative + name.replace('.', '\\.') + '(?:\\?sha256=[a-f0-9]{64})?', 'g');
  html = html.replace(pattern, relative + name + '?sha256=' + digest);
}
fs.writeFileSync(pagePath, html);
const manifestPath = path.join(root, 'scripts/release/public-files.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath));
manifest.paths = manifest.paths.filter((p) => !/\/complete-path\.[a-f0-9]{64}\.js$/.test(p)
  && p !== relative + 'interactive-demo.06caa9cd1045d21b35f32ab9bd16dd406416887b95e6652e8fcbd6b4eb088ef2.js'
  && p !== relative + 'guided-demo.css');
manifest.paths = [...new Set([...manifest.paths, relative + scriptName, relative + 'complete-path.css', relative + 'evidence-manifest.json'])].sort();
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
// Remove only obsolete bundles produced by this builder, never original proof assets.
for (const name of fs.readdirSync(directory)) {
  if (/^complete-path\.[a-f0-9]{64}\.js$/.test(name) && name !== scriptName) fs.unlinkSync(path.join(directory, name));
}
process.stdout.write('complete-path assets pinned: ' + scriptName + '\n');
