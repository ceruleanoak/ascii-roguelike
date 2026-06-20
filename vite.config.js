import { defineConfig } from 'vite';
import fs from 'fs';
import path from 'path';

function deathLedgerPlugin() {
  return {
    name: 'death-ledger',
    configureServer(server) {
      server.middlewares.use('/api/death-ledger', (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; res.end(); return; }
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
          try {
            const ledgerPath = path.resolve('claudedocs/death-ledger.jsonl');
            fs.appendFileSync(ledgerPath, body.trim() + '\n');
            res.statusCode = 200;
            res.setHeader('Content-Type', 'text/plain');
            res.end('OK');
          } catch (e) {
            res.statusCode = 500;
            res.end(e.message);
          }
        });
      });
    }
  };
}

// Dev-only draft store for tools/enemy-editor. CRUD over JSON files under
// tools/enemy-editor/templates/. Never runs in production (configureServer).
function enemyEditorPlugin() {
  const dir = path.resolve('tools/enemy-editor/templates');
  const safe = (name) => /^[a-z0-9-]+$/.test(name);
  return {
    name: 'enemy-editor-drafts',
    configureServer(server) {
      server.middlewares.use('/api/enemy-drafts', (req, res) => {
        const url = new URL(req.url, 'http://localhost');
        const name = decodeURIComponent(url.pathname.replace(/^\//, ''));
        const json = (code, obj) => {
          res.statusCode = code;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(obj));
        };
        try {
          if (req.method === 'GET' && !name) {
            const names = fs.existsSync(dir)
              ? fs.readdirSync(dir).filter(f => f.endsWith('.json')).map(f => f.slice(0, -5))
              : [];
            return json(200, names);
          }
          if (!safe(name)) { res.statusCode = 400; return res.end('bad name'); }
          const file = path.join(dir, `${name}.json`);
          if (req.method === 'GET') {
            if (!fs.existsSync(file)) { res.statusCode = 404; return res.end('not found'); }
            res.setHeader('Content-Type', 'application/json');
            return res.end(fs.readFileSync(file, 'utf8'));
          }
          if (req.method === 'POST') {
            let body = '';
            req.on('data', c => { body += c; });
            req.on('end', () => {
              fs.mkdirSync(dir, { recursive: true });
              fs.writeFileSync(file, body);
              json(200, { ok: true, name });
            });
            return;
          }
          if (req.method === 'DELETE') {
            if (fs.existsSync(file)) fs.unlinkSync(file);
            return json(200, { ok: true });
          }
          res.statusCode = 405; res.end();
        } catch (e) { res.statusCode = 500; res.end(e.message); }
      });
    }
  };
}

export default defineConfig({
  base: process.env.NODE_ENV === 'production' ? '/ascii-roguelike/' : '/',
  plugins: [deathLedgerPlugin(), enemyEditorPlugin()],
  server: {
    port: 3000,
    open: true
  },
  build: {
    outDir: 'dist',
    sourcemap: true
  }
});
