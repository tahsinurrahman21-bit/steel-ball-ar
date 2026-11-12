// Zero-dependency static server for local development.
// Usage: node tools/serve.mjs [port]
import { createServer } from 'node:http';
import { createReadStream, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const port = Number(process.argv[2] || process.env.PORT || 5173);
// --captures: accept POST /__capture/<name>.jpg|png and save it under captures/ (for demo videos)
const captures = process.argv.includes('--captures');
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.wasm': 'application/wasm', '.task': 'application/octet-stream',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json',
};

createServer((req, res) => {
  if (captures && req.method === 'POST' && req.url.startsWith('/__capture/')) {
    const name = req.url.slice('/__capture/'.length);
    if (!/^[\w-]{1,48}\.(jpg|png)$/.test(name)) { res.writeHead(400).end('bad name'); return; }
    const chunks = []; let size = 0;
    req.on('data', (c) => { size += c.length; if (size > 8e6) req.destroy(); else chunks.push(c); });
    req.on('end', () => {
      mkdirSync(join(root, 'captures'), { recursive: true });
      writeFileSync(join(root, 'captures', name), Buffer.concat(chunks));
      res.writeHead(204).end();
    });
    return;
  }
  let path;
  try { path = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { path = '/'; }
  let file = normalize(join(root, path));
  if (file !== root && !file.startsWith(root + sep)) { res.writeHead(403).end('Forbidden'); return; }
  let st;
  try {
    st = statSync(file);
    if (st.isDirectory()) { file = join(file, 'index.html'); st = statSync(file); }
  } catch { res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found'); return; }
  const head = {
    'content-type': types[extname(file).toLowerCase()] || 'application/octet-stream',
    'cache-control': 'no-store', 'accept-ranges': 'bytes',
  };
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
  if (range) { // media elements need range requests to seek
    const start = range[1] ? Number(range[1]) : 0;
    const end = range[2] ? Math.min(Number(range[2]), st.size - 1) : st.size - 1;
    if (start > end || start >= st.size) { res.writeHead(416, { 'content-range': `bytes */${st.size}` }).end(); return; }
    res.writeHead(206, { ...head, 'content-range': `bytes ${start}-${end}/${st.size}`, 'content-length': end - start + 1 });
    createReadStream(file, { start, end }).pipe(res);
  } else {
    res.writeHead(200, { ...head, 'content-length': st.size });
    createReadStream(file).pipe(res);
  }
}).listen(port, '127.0.0.1', () => {
  console.log(`Steel Ball AR  ->  http://localhost:${port}/${captures ? '  (frame capture on)' : ''}`);
});
