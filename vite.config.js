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

export default defineConfig({
  base: process.env.NODE_ENV === 'production' ? '/ascii-roguelike/' : '/',
  plugins: [deathLedgerPlugin()],
  server: {
    port: 3000,
    open: true
  },
  build: {
    outDir: 'dist',
    sourcemap: true
  }
});
