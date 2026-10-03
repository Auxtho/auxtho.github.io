const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {classUsage,validate} = require('../scripts/release/validate-static-css.cjs');
const root = path.resolve(__dirname, '..');
const contract = JSON.parse(fs.readFileSync(path.join(root, 'scripts/release/static-css-contract.json'),'utf8'));
function fixture(callback) {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(),'auxtho-static-css-'));
  try {
    for (const relative of [...Object.keys(contract.exact_files_sha256),...Object.keys(contract.root_page_classes)]) {
      const destination = path.join(temporary,relative);
      fs.mkdirSync(path.dirname(destination),{recursive:true});
      fs.copyFileSync(path.join(root,relative),destination);
    }
    callback(temporary);
  } finally { fs.rmSync(temporary,{recursive:true,force:true}); }
}
test('static CSS preserves the exact reviewed stylesheet and source inputs',()=>{
  const before = fs.readFileSync(path.join(root,'assets/style.css'));
  assert.equal(validate(root,contract).mode,'reviewed-static-css');
  assert.deepEqual(fs.readFileSync(path.join(root,'assets/style.css')),before);
});
test('changed stylesheet, legacy input or config fails closed',()=>{
  for (const relative of Object.keys(contract.exact_files_sha256)) fixture(temporary=>{
    fs.appendFileSync(path.join(temporary,relative),'\n/* changed */\n');
    assert.throws(()=>validate(temporary,contract),/input\/output changed/);
  });
});
test('new class usage and new root HTML pages require review',()=>{
  fixture(temporary=>{
    const file = path.join(temporary,'index.html');
    fs.appendFileSync(file,'<div class="unreviewed-utility"></div>');
    assert.throws(()=>validate(temporary,contract),/class usage changed/);
  });
  fixture(temporary=>{
    fs.writeFileSync(path.join(temporary,'new.html'),'<p>New page</p>');
    assert.throws(()=>validate(temporary,contract),/coverage changed/);
  });
});
test('copy edits preserve the same static class coverage',()=>{
  assert.deepEqual(classUsage('<div class="b a">Old words</div>'),classUsage('<div class="a b">New words</div>'));
});
test('package removes the affected compiler chain without weakening the audit gate',()=>{
  const pkg = JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
  assert.equal(pkg.devDependencies.tailwindcss,undefined);
  assert.equal(pkg.scripts.build,'node scripts/release/validate-static-css.cjs');
  const lock = JSON.parse(fs.readFileSync(path.join(root,'package-lock.json'),'utf8'));
  for (const name of ['tailwindcss','braces','chokidar','micromatch','fast-glob','postcss-selector-parser']) {
    assert.equal(Object.keys(lock.packages).some(key=>key.endsWith(`/node_modules/${name}`)||key===`node_modules/${name}`),false,name);
  }
  assert.match(fs.readFileSync(path.join(root,'.github/workflows/site-ci.yml'),'utf8'),/npm audit --audit-level=high/);
});
