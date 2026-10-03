const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const parse5 = require('parse5');

const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function classUsage(document) {
  const classes = new Set();
  function visit(node) {
    for (const attribute of node.attrs || []) {
      if (attribute.name === 'class') {
        for (const token of attribute.value.split(/\s+/).filter(Boolean)) classes.add(token);
      }
    }
    for (const child of node.childNodes || []) visit(child);
    if (node.content) visit(node.content);
  }
  visit(parse5.parse(document));
  return [...classes].sort();
}
function validate(root, contract) {
  if (contract.schema_version !== 1 || contract.mode !== 'reviewed-static-css') throw new Error('Invalid static CSS contract');
  for (const [relative, expected] of Object.entries(contract.exact_files_sha256)) {
    if (digest(fs.readFileSync(path.join(root, relative))) !== expected) {
      throw new Error(`Reviewed static CSS input/output changed: ${relative}. A reviewed stylesheet update is required; do not refresh the contract automatically.`);
    }
  }
  const pages = fs.readdirSync(root).filter(name => name.endsWith('.html')).sort();
  if (JSON.stringify(pages) !== JSON.stringify(Object.keys(contract.root_page_classes).sort())) {
    throw new Error('Root HTML page coverage changed; review the static CSS contract');
  }
  for (const relative of pages) {
    const actual = classUsage(fs.readFileSync(path.join(root, relative), 'utf8'));
    if (JSON.stringify(actual) !== JSON.stringify(contract.root_page_classes[relative])) {
      throw new Error(`Root HTML class usage changed: ${relative}. Review utility styles before updating the contract.`);
    }
  }
  return {mode:contract.mode,pages:pages.length,css_sha256:contract.exact_files_sha256['assets/style.css']};
}
if (require.main === module) {
  try {
    const root = path.resolve(__dirname, '../..');
    const contract = JSON.parse(fs.readFileSync(path.join(__dirname, 'static-css-contract.json'), 'utf8'));
    process.stdout.write(`static-css-contract ${JSON.stringify(validate(root, contract))}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
module.exports = {classUsage,validate};
