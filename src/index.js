/**
 * AuditTrail-Ledger - Production Cryptographic Audit Server
 * Author: Ali Nurettin Demir (@alinurettin)
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { AuditLedgerEngine, MerkleTree } = require('./engine');

const ledger = new AuditLedgerEngine();

// Seed initial audit events and seal block 1
ledger.recordEvent({ action: 'SYSTEM_BOOT', module: 'AuthService', actor: 'root', ip: '10.0.0.1' });
ledger.recordEvent({ action: 'SECRET_ROTATION', module: 'KmsVault', actor: 'sec-ops', keyId: 'key-99' });
ledger.recordEvent({ action: 'PRIVILEGE_GRANT', module: 'RbacManager', actor: 'admin', user: 'dev-10' });
ledger.sealBlock();

const PORT = parseInt(process.env.PORT, 10) || 6015;
const publicDir = path.join(__dirname, '..', 'public');
const startTime = Date.now();

function requestHandler(req, res) {
  const reqUrl = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
  const pathname = reqUrl.pathname;

  // CORS
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    return res.end();
  }

  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', () => {
    // 1. Health Status
    if (pathname === '/api/health') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
      return res.end(JSON.stringify({
        status: 'UP',
        service: 'AuditTrail-Ledger',
        uptimeSeconds: Math.floor((Date.now() - startTime) / 1000),
        timestamp: new Date().toISOString()
      }));
    }

    // 2. Stats & Ledger Telemetry
    if (pathname === '/api/stats') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
      return res.end(JSON.stringify({
        success: true,
        service: 'AuditTrail-Ledger',
        stats: ledger.getStats(),
        chainSummary: ledger.chain.map(b => ({
          index: b.index,
          timestamp: b.timestamp,
          eventsCount: b.events.length,
          merkleRoot: b.merkleRoot,
          blockHash: b.blockHash,
          previousHash: b.previousHash
        }))
      }));
    }

    // 3. Record Audit Event
    if (req.method === 'POST' && pathname === '/api/events') {
      try {
        const parsed = JSON.parse(body || '{}');
        const evt = ledger.recordEvent(parsed);
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        return res.end(JSON.stringify({ success: true, event: evt, pendingCount: ledger.pendingEvents.length }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: e.message }));
      }
    }

    // 4. Mine / Seal Block
    if (req.method === 'POST' && pathname === '/api/blocks/mine') {
      const block = ledger.sealBlock();
      if (!block) {
        res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        return res.end(JSON.stringify({ success: false, error: 'No pending events to seal into block' }));
      }
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      return res.end(JSON.stringify({
        success: true,
        block: {
          index: block.index,
          blockHash: block.blockHash,
          merkleRoot: block.merkleRoot,
          eventsCount: block.events.length
        }
      }));
    }

    // 5. Generate Inclusion Proof
    if (req.method === 'POST' && pathname === '/api/proof') {
      try {
        const parsed = JSON.parse(body || '{}');
        const proofObj = ledger.getProofForEvent(parsed.blockIndex || 1, parsed.eventIndex || 0);
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        return res.end(JSON.stringify({ success: true, proofObj }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: e.message }));
      }
    }

    // 6. Verify Inclusion Proof
    if (req.method === 'POST' && pathname === '/api/verify') {
      try {
        const parsed = JSON.parse(body || '{}');
        const isValid = MerkleTree.verifyProof(parsed.leafHash, parsed.proof, parsed.merkleRoot);
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        return res.end(JSON.stringify({ success: true, isValid }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: e.message }));
      }
    }

    // 7. Verify Ledger Integrity
    if (pathname === '/api/audit/verify') {
      const integrity = ledger.verifyLedgerIntegrity();
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      return res.end(JSON.stringify({ success: true, integrity }));
    }

    // 8. Static Web UI
    let filePath = path.join(publicDir, pathname === '/' ? 'index.html' : pathname);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      const mimeTypes = {
        '.html': 'text/html; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.js': 'application/javascript; charset=utf-8',
        '.json': 'application/json; charset=utf-8'
      };
      res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'text/plain' });
      return res.end(fs.readFileSync(filePath));
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Endpoint not found' }));
  });
}

function startServer(portToUse = PORT, callback) {
  const server = http.createServer(requestHandler);
  server.listen(portToUse, callback);
  return server;
}

if (require.main === module) {
  startServer(PORT, () => {
    console.log(`🔒 AuditTrail-Ledger live at http://localhost:${PORT}`);
  });
}

module.exports = { startServer, ledger };
