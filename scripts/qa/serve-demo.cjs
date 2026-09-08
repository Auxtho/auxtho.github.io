const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.mp4':'video/mp4','.pdf':'application/pdf'};
function createServer() {
  return http.createServer((req,res) => {
    const publicPaths = new Set(JSON.parse(fs.readFileSync(path.join(root, 'scripts/release/public-files.json'))).paths);
    let pathname;
    try { pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname); } catch { res.writeHead(400).end(); return; }
    if (pathname.endsWith('/')) pathname += 'index.html';
    if (!publicPaths.has(pathname) || !['GET','HEAD'].includes(req.method)) {res.writeHead(404).end();return;}
    const file = path.resolve(root, '.' + pathname);
    if (!file.startsWith(root + path.sep)) {res.writeHead(403).end();return;}
    fs.readFile(file,(error,bytes) => {
      if(error){res.writeHead(404).end();return;}
      res.writeHead(200, {'Content-Type':types[path.extname(file)] || 'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
      res.end(req.method === 'HEAD' ? undefined : bytes);
    });
  });
}
if (require.main === module) {
  const port=Number(process.argv[2] || 4188);
  createServer().listen(port,'127.0.0.1',() => process.stdout.write('Local candidate: http://127.0.0.1:' + port + '/demo/singapore-source-review/\n'));
}
module.exports={createServer};
