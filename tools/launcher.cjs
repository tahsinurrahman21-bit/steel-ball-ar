// Steel Ball AR launcher: serves the app folder on http://localhost and opens the browser.
//
// Built into a single SteelBallAR.exe (Node.js "single executable application") for the
// GitHub Release, so players do not need to install Node.js. It can also be run directly:
//   node tools/launcher.cjs [port] [--no-open]
//
// Only listens on 127.0.0.1, so nothing is reachable from other computers.
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { exec } = require('node:child_process');

let isSea = false;
try { isSea = require('node:sea').isSea(); } catch { /* older Node: not a SEA */ }

// The exe serves the folder it sits in; the script serves the repository root.
const root = path.resolve(isSea ? path.dirname(process.execPath) : path.join(__dirname, '..'));
// Under node: argv = [node, script, ...args]. In the exe, argv[1] may repeat the exe path.
const args = process.argv.slice(1).filter((a, i) =>
  !(i === 0 && (a === process.execPath || a === __filename || /launcher\.cjs$/.test(a))));
const firstPort = Number(args.find((a) => /^\d+$/.test(a)) || process.env.PORT || 5173);
const openBrowser = !args.includes('--no-open');

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.wasm': 'application/wasm', '.task': 'application/octet-stream',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json',
  '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8',
};

function fail(msg) {
  console.error(`\n  ${msg}\n`);
  if (isSea) { console.error('  Press Enter to close this window.'); process.stdin.resume(); process.stdin.on('data', () => process.exit(1)); }
  else process.exit(1);
}

const appFound = fs.existsSync(path.join(root, 'index.html')) && fs.existsSync(path.join(root, 'node_modules'));
if (!appFound) {
  fail(`Cannot find the app files next to the launcher (looked in ${root}).\n` +
       '  Unzip the whole release folder first, then run SteelBallAR.exe from inside it.');
}

function handler(req, res) {
  let rel;
  try { rel = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { rel = '/'; }
  let file = path.normalize(path.join(root, rel));
  if (file !== root && !file.startsWith(root + path.sep)) { res.writeHead(403).end('Forbidden'); return; }
  let st;
  try {
    st = fs.statSync(file);
    if (st.isDirectory()) { file = path.join(file, 'index.html'); st = fs.statSync(file); }
  } catch { res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found'); return; }
  const head = {
    'content-type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
    'cache-control': 'no-store', 'accept-ranges': 'bytes',
  };
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
  if (range) {
    const start = range[1] ? Number(range[1]) : 0;
    const end = range[2] ? Math.min(Number(range[2]), st.size - 1) : st.size - 1;
    if (start > end || start >= st.size) { res.writeHead(416, { 'content-range': `bytes */${st.size}` }).end(); return; }
    res.writeHead(206, { ...head, 'content-range': `bytes ${start}-${end}/${st.size}`, 'content-length': end - start + 1 });
    fs.createReadStream(file, { start, end }).pipe(res);
  } else {
    res.writeHead(200, { ...head, 'content-length': st.size });
    fs.createReadStream(file).pipe(res);
  }
}

function open(url) {
  const cmd = process.platform === 'win32' ? `start "" "${url}"`
            : process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`;
  exec(cmd, () => { /* if it fails, the URL is printed anyway */ });
}

function listen(port, triesLeft) {
  const server = http.createServer(handler);
  server.once('error', (e) => {
    if (e.code === 'EADDRINUSE' && triesLeft > 0) listen(port + 1, triesLeft - 1);
    else fail(`Could not start the local server: ${e.message}`);
  });
  server.listen(port, '127.0.0.1', () => {
    const url = `http://localhost:${port}/`;
    console.log('\n  Steel Ball AR is running.');
    console.log(`  Open ${url} in Chrome or Edge if it did not open by itself.`);
    console.log('  Keep this window open while you play. Close it to stop.\n');
    if (openBrowser) open(url);
  });
}

if (appFound) listen(firstPort, 20);
