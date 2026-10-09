const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const assetRoot=path.join(root,'assets/portfolio-20261009');
const appPath=path.join(root,"assets/portfolio-20261009/app.690328a2f0181c3af4fe54e37cf19a98eb12c3e1d9f9bc5568ea153f482ebf5e.js");
test('JavaScript parses; private evidence not served',()=>{new vm.Script(fs.readFileSync(appPath,'utf8'));assert.ok(!fs.existsSync(path.join(root,'CLAIM_SCOPE_PRIVATE.json')));});
test('Public HTML is indexable, canonical and uses exact-byte resources',()=>{for(const file of ['index.html',...['auxtho','moirion','agent-runner','ardamire','metdol'].map(x=>'products/'+x+'/index.html')]){const html=fs.readFileSync(path.join(root,file),'utf8');assert.match(html,/index,follow/);assert.doesNotMatch(html,/LOCAL DESIGN PREVIEW|Local preview|noindex,nofollow/);assert.match(html,/href="\/assets\/portfolio-20261009\/styles\.css\?sha256=[0-9a-f]{64}"/);assert.match(html,/src="\/assets\/portfolio-20261009\/app\.[0-9a-f]{64}\.js"/);assert.ok(html.includes('href="https://auxtho.com/'+file.replace(/index\.html$/,'')+'"'));}});
test('Existing approved video preserved byte-for-byte',()=>{const sum=crypto.createHash('sha256').update(fs.readFileSync(path.join(assetRoot,'walkthrough.mp4'))).digest('hex');assert.equal(sum,'2a2e109cc822ae0e5113b11104a3415363e4280fd58b3fe0e73b8ba871500492');});
test('All portfolio and proof imagery exists',()=>{for(const file of ['source.png','version.png','json.png','pdf.png','video-poster.png','logo-white.svg','metdol-phone.png'])assert.ok(fs.statSync(path.join(assetRoot,file)).size>0);});
test('No copied reference footage, remote fonts, outbound submission handler or external SDK',()=>{const css=fs.readFileSync(path.join(assetRoot,'styles.css'),'utf8'),js=fs.readFileSync(appPath,'utf8');assert.doesNotMatch(css,/@import|https?:/);assert.doesNotMatch(js,/fetch\(|XMLHttpRequest|\.submit\(|localStorage/);});

test('New actual media is preserved byte-for-byte',()=>{for(const [file,expected] of Object.entries({
 'agent-runner-work.png':'446c12de625dae541852534e383555e09c777b31c4917ef6d65ddbeedf2447b5',
 'agent-runner-office.png':'7a492606d9777507db1b861ca853cb980efd88a2deb141fda651bb765f775cda',
 'agent-runner-office.mp4':'deef130a53631a4c7c8fcf7cad2c723a133daa1d0a0278a07194a133c1883e8e',
 'ardamire-console-redacted.png':'adfbb9d12f1f5c1b4d47ee158a0dee209bbe08546ee8bfb536ef21d79c3b794b'
})){assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(assetRoot,file))).digest('hex'),expected);}});
test('Actual views retain separate-run, pending-review, internal-role and asset-origin labels',()=>{const js=fs.readFileSync(appPath,'utf8');for(const text of ['final decision were still pending','not a recording of one continuous task','캐릭터와 배경은 생성형 AI를 활용해 자체 제작·편집한 그래픽 에셋이다.','Auxtho 내부 운영 화면 · 자체 시험 사례 · 민감 정보 가림.','the file is released while the associated incident remains open','Ardamire — 문제가 발견된 파일부터 보류 사유와 회복 이력까지 연결합니다.'])assert.ok(js.includes(text),text);assert.match(js,/class="office-recording" controls playsinline preload="none"/);assert.match(js,/function bindImageDialog\(/);assert.doesNotMatch(js,/<video[^>]*autoplay/);});


test('Display punctuation removes only terminal marks and line-break endings',()=>{
 const js=fs.readFileSync(appPath,'utf8');
 const helper=js.split('\n').find(line=>line.startsWith('function displayCopy('));
 const clean=vm.runInNewContext(helper+';displayCopy');
 assert.equal(clean('AI software.<br>Human direction.'),'AI software<br>Human direction');
 assert.equal(clean('First sentence. Next, keep this comma.'),'First sentence. Next, keep this comma');
 assert.equal(clean('근거,<br>사람의 판단.'),'근거<br>사람의 판단');
 assert.equal(clean('Version 2.5, cost 9,531 bytes.'),'Version 2.5, cost 9,531 bytes');
 assert.equal(clean('Text, '),'Text ');
 assert.equal(clean('Visible.<span> </span>'),'Visible<span> </span>');
});
test('Tracking is relaxed without changing type sizes or media',()=>{
 const css=fs.readFileSync(path.join(assetRoot,'styles.css'),'utf8');
 assert.match(css,/letter-spacing:-0\.01625em/);
 assert.match(css,/font-family:var\(--sans\);letter-spacing:\.025em/);
 assert.doesNotMatch(css,/letter-spacing:\s*[^;}]*%/);
});


test('New Moirion capture copies are unchanged and have correct media signatures',()=>{
 const expected={"moirion-mac-write-20261009.jpg":"8d35eb4ecc299b7064815f813be6a6be3a74443b6c0ff526d0a75b0029ac3e4c","moirion-mac-archive-20261009.jpg":"43ea1414966ddb2b91764bd943aa03d483334bd06466f3eb44e0ac7d1e219efd","moirion-mac-talk-20261009.jpg":"b242562cee3d5783d97ef082b88fceffa1d3c9ae75e3ee9e07cd2e09fcac6e25","moirion-iphone-welcome-20261009.png":"65bd275819cc17f911fb1b96d3c06e41003d78616d36fcf7ef5e2520a0fdc335","moirion-iphone-style-20261009.png":"6d0c0740445b42e4fa389082a4fef9066afd45c78c5746414cbe056662f19212","moirion-iphone-write-20261009.png":"2e9e28bed3a6300a9326aeddc493e6de2c616ce28c5d2881765aced0c98ddc2e","moirion-iphone-archive-20261009.png":"cb92c377940a42a7059442a82621ac2611b4df79959436f901a5f094a555e069","moirion-iphone-entry-20261009.png":"4d2416272019b928811833ac06ca9656e78901aa0354e0e4270afcd59ce06b8e","moirion-iphone-ondevice-20261009.png":"086b4f68eb84efe1bc649c9ce31aff94150aa71d1d24fa85a498db30ee77008d","moirion-iphone-calendar-20261009.png":"f6d3029441258e8c45a14d49f025e478e1c9f4fc26321d57960e792b58911a34"};
 for(const [file,hash] of Object.entries(expected)){const b=fs.readFileSync(path.join(assetRoot,file));assert.equal(crypto.createHash('sha256').update(b).digest('hex'),hash);if(file.endsWith('.jpg'))assert.equal(b.subarray(0,3).toString('hex'),'ffd8ff');else assert.equal(b.subarray(0,8).toString('hex'),'89504e470d0a1a0a');}
});
test('Moirion Apple on-device case and terminal Metdol illustration remain distinct',()=>{
 const js=fs.readFileSync(appPath,'utf8'),lines=js.split('\n');
 const data=JSON.parse(lines.find(l=>l.startsWith('const products=')).slice('const products='.length).replace(/;$/,''));
 assert.equal(data.find(p=>p.id==='metdol').image,null);
 assert.match(data.find(p=>p.id==='metdol').en.detail,/terminal-based implementation/);
 assert.match(data.find(p=>p.id==='moirion').en.boundary,/not paired with Metdol/);
 assert.match(js,/if\(p.id==='metdol'\)return metdolDiagram/);
 assert.match(js,/if\(p.id==='moirion'\)return moirionMedia/);
 assert.match(js,/Moirion on iPhone using Metdol/);
 assert.match(js,/function bindMoirionGalleries/);
});

test('Additional tracking leaves the body rule unchanged and targets non-body UI',()=>{
 const css=fs.readFileSync(path.join(assetRoot,'styles.css'),'utf8');
 assert.ok(css.includes("body{margin:0;background:var(--ink);color:var(--white);font-family:var(--sans);letter-spacing:.025em;-webkit-font-smoothing:antialiased}"));
 assert.match(css,/Additional non-body tracking/);
 assert.match(css,/letter-spacing:\.0375rem/);
 const scope=css.split('Additional non-body tracking.')[1];
 assert.doesNotMatch(scope,/hero-lead|detail-intro|gallery-description|workflow-step p/);
});

test('Public package preserves reviewed portfolio bytes and excludes private preparation',()=>{
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'scripts/release/public-files.json'),'utf8'));
 for(const item of manifest.paths)assert.doesNotMatch(item,/PRIVATE|received\/|qa\/|attachments\/|preview\.test|serve\.mjs/);
 const js=fs.readFileSync(appPath,'utf8');
 assert.doesNotMatch(js,/Local preview|로컬 디자인|preview-bar/);
 for(const route of ['/privacy.html','/terms.html','/evidence-notes.html','/proof/workflow-overview/'])assert.ok(js.includes(route),route);
 const expected={"assets/portfolio-20261009/agent-runner-office.mp4":"deef130a53631a4c7c8fcf7cad2c723a133daa1d0a0278a07194a133c1883e8e","assets/portfolio-20261009/agent-runner-office.png":"7a492606d9777507db1b861ca853cb980efd88a2deb141fda651bb765f775cda","assets/portfolio-20261009/agent-runner-work.png":"446c12de625dae541852534e383555e09c777b31c4917ef6d65ddbeedf2447b5","assets/portfolio-20261009/ardamire-console-redacted.png":"adfbb9d12f1f5c1b4d47ee158a0dee209bbe08546ee8bfb536ef21d79c3b794b","assets/portfolio-20261009/json.png":"c44f79af68559b78f277e268e99e5d9062d0dbc2aac92d70cf3028937ed20685","assets/portfolio-20261009/logo-white.svg":"a3b6cb0ab2461fcd6e4a98f147c0a04416801d3caadc77539a02bba8ab19426f","assets/portfolio-20261009/metdol-phone.png":"682fc33a3a82405e2858408306469b9bec91531a7a829b9007a4df1b47db8603","assets/portfolio-20261009/moirion-iphone-archive-20261009.png":"cb92c377940a42a7059442a82621ac2611b4df79959436f901a5f094a555e069","assets/portfolio-20261009/moirion-iphone-calendar-20261009.png":"f6d3029441258e8c45a14d49f025e478e1c9f4fc26321d57960e792b58911a34","assets/portfolio-20261009/moirion-iphone-entry-20261009.png":"4d2416272019b928811833ac06ca9656e78901aa0354e0e4270afcd59ce06b8e","assets/portfolio-20261009/moirion-iphone-ondevice-20261009.png":"086b4f68eb84efe1bc649c9ce31aff94150aa71d1d24fa85a498db30ee77008d","assets/portfolio-20261009/moirion-iphone-style-20261009.png":"6d0c0740445b42e4fa389082a4fef9066afd45c78c5746414cbe056662f19212","assets/portfolio-20261009/moirion-iphone-welcome-20261009.png":"65bd275819cc17f911fb1b96d3c06e41003d78616d36fcf7ef5e2520a0fdc335","assets/portfolio-20261009/moirion-iphone-write-20261009.png":"2e9e28bed3a6300a9326aeddc493e6de2c616ce28c5d2881765aced0c98ddc2e","assets/portfolio-20261009/moirion-mac-archive-20261009.jpg":"43ea1414966ddb2b91764bd943aa03d483334bd06466f3eb44e0ac7d1e219efd","assets/portfolio-20261009/moirion-mac-talk-20261009.jpg":"b242562cee3d5783d97ef082b88fceffa1d3c9ae75e3ee9e07cd2e09fcac6e25","assets/portfolio-20261009/moirion-mac-write-20261009.jpg":"8d35eb4ecc299b7064815f813be6a6be3a74443b6c0ff526d0a75b0029ac3e4c","assets/portfolio-20261009/pdf.png":"7f204be25135d986daa45cfd2d3f809d4dc4f9542c569420d97d658b0ed6df91","assets/portfolio-20261009/source.png":"fa4400c231bb2a3ebc697566392abe5c2511c91a7f0bb69b0c49f0fe7489bf8c","assets/portfolio-20261009/version.png":"488ba192f7541b9fd0531a6492ff9b43013158e8cd486fd6dd06219a4c2e2c46","assets/portfolio-20261009/video-poster.png":"ab0a9da8695a942fb458aa79dfee4bea848600e77df50bfa7f3a9ca33ee1970d","assets/portfolio-20261009/walkthrough.mp4":"2a2e109cc822ae0e5113b11104a3415363e4280fd58b3fe0e73b8ba871500492","assets/portfolio-20261009/app.690328a2f0181c3af4fe54e37cf19a98eb12c3e1d9f9bc5568ea153f482ebf5e.js":"690328a2f0181c3af4fe54e37cf19a98eb12c3e1d9f9bc5568ea153f482ebf5e","assets/portfolio-20261009/styles.css":"6ae3320dde4f6d4c825a13808feac1425caf03637f4e2233500b35d27b2265e3"};
 for(const [relative,hash] of Object.entries(expected))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,relative))).digest('hex'),hash,relative);
});
test('Portfolio gates reject changes to reviewed code, style, screenshot and film',()=>{
 const os=require('node:os'),{buildArtifact}=require('../scripts/release/public-artifact.cjs');
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'scripts/release/public-files.json'),'utf8'));
 for(const selected of ["assets/portfolio-20261009/app.690328a2f0181c3af4fe54e37cf19a98eb12c3e1d9f9bc5568ea153f482ebf5e.js",'assets/portfolio-20261009/styles.css','assets/portfolio-20261009/ardamire-console-redacted.png','assets/portfolio-20261009/walkthrough.mp4']){
  const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'auxtho-portfolio-gate-'));
  try{
   const source=path.join(temporary,'source');fs.mkdirSync(source);
   for(const relative of [...manifest.paths.map(p=>p.slice(1)),'scripts/release/public-files.json']){const target=path.join(source,relative);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(root,relative),target);}
   fs.appendFileSync(path.join(source,selected),'changed');
   assert.throws(()=>buildArtifact({sourceRoot:source,previousSourceRoot:source,outputRoot:path.join(temporary,'site'),provenanceRoot:path.join(temporary,'provenance'),sourceSha:'a'.repeat(40),previousSha:'1'.repeat(40),compatibleJson:JSON.stringify(['1'.repeat(40),'a'.repeat(40)]),mode:'candidate',retiredManifestPath:path.join(root,'scripts/release/retired-public-paths.json'),artifactName:'github-pages-candidate',repository:'Auxtho/auxtho.github.io',runId:'local',runAttempt:'1'}),/portfolio file differs from its exact reviewed bytes/);
  }finally{fs.rmSync(temporary,{recursive:true,force:true});}
 }
});
