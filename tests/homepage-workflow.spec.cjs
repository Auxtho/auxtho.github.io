const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {buildArtifact}=require('../scripts/release/public-artifact.cjs');
const root=path.resolve(__dirname,'..');
function rejectChangedAsset(choose){
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'auxtho-workflow-release-'));
 try{
  const source=path.join(tmp,'source');fs.cpSync(root,source,{recursive:true,filter:p=>!p.split(path.sep).includes('node_modules')});
  const target=choose(source);fs.appendFileSync(target,'\nchanged');
  assert.throws(()=>buildArtifact({sourceRoot:source,previousSourceRoot:root,outputRoot:path.join(tmp,'site'),provenanceRoot:path.join(tmp,'provenance'),sourceSha:'a'.repeat(40),previousSha:'b'.repeat(40),compatibleJson:JSON.stringify(['a'.repeat(40),'b'.repeat(40)]),mode:'candidate',retiredManifestPath:path.join(source,'scripts/release/retired-public-paths.json'),repository:'Auxtho/auxtho.github.io',runId:'LOCAL_NEGATIVE_TEST',runAttempt:'1',artifactName:'local-negative-test'}),/homepage workflow asset differs from exact reviewed bytes/);
 }finally{
  const resolved=path.resolve(tmp),parent=path.resolve(os.tmpdir());
  assert.equal(path.dirname(resolved),parent);assert.ok(path.basename(resolved).startsWith('auxtho-workflow-release-'));
  fs.rmSync(resolved,{recursive:true,force:true});
 }
}
test('Publication rejects a changed interactive workflow script before release',()=>rejectChangedAsset(source=>path.join(source,'assets/auxtho-workflow-20261026',fs.readdirSync(path.join(source,'assets/auxtho-workflow-20261026')).find(n=>/^flow\.[a-f0-9]{64}\.js$/.test(n)))));
test('Publication rejects a changed synthetic source PDF before release',()=>rejectChangedAsset(source=>path.join(source,'assets/auxtho-insurance-preview/insurance-demo-policy-v1.pdf')));
