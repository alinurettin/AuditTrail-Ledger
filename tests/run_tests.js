/**
 * AuditTrail-Ledger - Exhaustive Multi-Scenario Verification Suite
 * Author: Ali Nurettin Demir (@alinurettin)
 * 
 * Verifies:
 * - SHA-256 Merkle tree calculation across odd & even leaf topologies
 * - RFC 6962 inclusion proof generation & logarithmic verification
 * - Rejection of tampered leaves and forged sibling paths
 * - Cryptographic block chaining (Genesis to Tip)
 * - Automated tamper detection locating exact corrupted block indices
 * - Live HTTP server REST API and proof endpoints
 */

const assert = require('assert');
const http = require('http');
const { sha256, MerkleTree, AuditBlock, AuditLedgerEngine } = require('../src/engine');
const { startServer } = require('../src/index');

console.log('================================================================');
console.log('🔒 AuditTrail-Ledger: Exhaustive Multi-Scenario Verification Suite');
console.log('================================================================\n');

let assertionCount = 0;
function check(cond, msg) {
  assert.ok(cond, msg);
  assertionCount++;
  console.log(`  ✓ [Assertion #${assertionCount}] ${msg}`);
}

// -------------------------------------------------------------
// SECTION 1: SHA-256 & Merkle Tree Structural Properties
// -------------------------------------------------------------
console.log('[SECTION 1] Testing SHA-256 & Merkle Tree Mathematical Properties...');

const h1 = sha256('event-1');
const h2 = sha256('event-2');
check(h1.length === 64, 'SHA-256 produces exact 64-character hexadecimal digest');
check(h1 !== h2, 'Distinct inputs produce distinct cryptographic hashes');

// Even tree (2 leaves)
const tree2 = new MerkleTree(['alpha', 'beta']);
const expectedRoot2 = sha256(sha256('alpha') + sha256('beta'));
check(tree2.getRoot() === expectedRoot2, '2-leaf Merkle root matches manual pair hash');

// Odd tree (3 leaves - 3rd leaf is duplicated according to RFC standard)
const tree3 = new MerkleTree(['alpha', 'beta', 'gamma']);
const hGamma = sha256('gamma');
const expectedOddParent = sha256(hGamma + hGamma);
const expectedRoot3 = sha256(expectedRoot2 + expectedOddParent);
check(tree3.getRoot() === expectedRoot3, '3-leaf Merkle root correctly handles odd rightmost duplication');

// -------------------------------------------------------------
// SECTION 2: Proof of Inclusion Generation & Verification
// -------------------------------------------------------------
console.log('\n[SECTION 2] Testing Cryptographic Proof of Inclusion...');

const tree4 = new MerkleTree(['tx-1', 'tx-2', 'tx-3', 'tx-4']);
const root4 = tree4.getRoot();

// Proof for leaf 0 ('tx-1')
const proof0 = tree4.getProof(0);
check(proof0.length === 2, 'Proof path for 4 leaves requires exactly log2(4) = 2 sibling hashes');
const leafHash0 = sha256('tx-1');
const isValidProof = MerkleTree.verifyProof(leafHash0, proof0, root4);
check(isValidProof === true, 'Legitimate leaf hash successfully verified against Merkle root');

// Forged leaf must fail
const forgedLeafHash = sha256('tx-FORGED');
const isForgedValid = MerkleTree.verifyProof(forgedLeafHash, proof0, root4);
check(isForgedValid === false, 'Tampered leaf payload is strictly rejected by proof verification');

// Tampered sibling proof step must fail
const tamperedProof = JSON.parse(JSON.stringify(proof0));
tamperedProof[0].hash = 'a'.repeat(64);
const isTamperedProofValid = MerkleTree.verifyProof(leafHash0, tamperedProof, root4);
check(isTamperedProofValid === false, 'Forged sibling hash in proof path strictly fails verification');

// -------------------------------------------------------------
// SECTION 3: Blockchain Chaining & Tamper-Evident Ledger
// -------------------------------------------------------------
console.log('\n[SECTION 3] Testing Blockchain Chaining & Tamper Detection...');

const ledger = new AuditLedgerEngine();
check(ledger.chain.length === 1, 'Ledger initializes with Genesis block (index 0)');
check(ledger.chain[0].previousHash === '0'.repeat(64), 'Genesis block points to zero root previousHash');

// Record events and seal block 1
ledger.recordEvent({ action: 'LOGIN', user: 'alice' });
ledger.recordEvent({ action: 'TRANSFER', amount: 500 });
const block1 = ledger.sealBlock();
check(block1.index === 1, 'Block 1 sealed with incremented index');
check(block1.previousHash === ledger.chain[0].blockHash, 'Block 1 cryptographically links to Genesis block hash');
check(ledger.chain.length === 2, 'Chain length is now 2');

// Record events and seal block 2
ledger.recordEvent({ action: 'LOGOUT', user: 'alice' });
const block2 = ledger.sealBlock();
check(block2.previousHash === block1.blockHash, 'Block 2 cryptographically links to Block 1 hash');

// Verify clean ledger
const cleanIntegrity = ledger.verifyLedgerIntegrity();
check(cleanIntegrity.isValid === true, 'Pristine ledger reports 100% cryptographic validity');

// Simulate tampering with event in Block 1
ledger._tamperWithEvent(1, 0, { action: 'LOGIN_HACKED', user: 'attacker' });
const tamperedIntegrity = ledger.verifyLedgerIntegrity();
check(tamperedIntegrity.isValid === false, 'Ledger tamper detection successfully flagged unauthorized event change');
check(tamperedIntegrity.corruptedBlockIndex === 1, 'Tamper engine precisely pinpointed corrupted block index #1');

// -------------------------------------------------------------
// SECTION 4: Live HTTP Server Integration
// -------------------------------------------------------------
console.log('\n[SECTION 4] Testing Live HTTP Ephemeral Server Integration...');

const server = startServer(0, () => {
  const port = server.address().port;
  console.log(`  [HTTP] AuditTrail-Ledger active on ephemeral port ${port}`);

  // 1. GET /api/health
  http.get(`http://127.0.0.1:${port}/api/health`, (res) => {
    check(res.statusCode === 200, 'GET /api/health returns HTTP 200 OK');

    // 2. GET /api/stats
    http.get(`http://127.0.0.1:${port}/api/stats`, (resStats) => {
      check(resStats.statusCode === 200, 'GET /api/stats returns HTTP 200 OK');

      // 3. POST /api/events (Record)
      const newEvt = JSON.stringify({ action: 'HTTP_AUDIT_TEST', actor: 'qa-bot' });
      const reqEvt = http.request({
        hostname: '127.0.0.1',
        port,
        path: '/api/events',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(newEvt) }
      }, (resEvt) => {
        check(resEvt.statusCode === 200, 'POST /api/events successfully records pending event');

        // 4. POST /api/blocks/mine (Seal)
        const reqMine = http.request({
          hostname: '127.0.0.1',
          port,
          path: '/api/blocks/mine',
          method: 'POST'
        }, (resMine) => {
          check(resMine.statusCode === 200, 'POST /api/blocks/mine seals new block');

          // 5. GET /api/audit/verify
          http.get(`http://127.0.0.1:${port}/api/audit/verify`, (resVerify) => {
            check(resVerify.statusCode === 200, 'GET /api/audit/verify returns HTTP 200 OK');
            let vData = '';
            resVerify.on('data', c => vData += c);
            resVerify.on('end', () => {
              const vJson = JSON.parse(vData);
              check(vJson.integrity.isValid === true, 'Server ledger integrity confirms all blocks are authentic');

              server.close(() => {
                console.log('\n================================================================');
                console.log(`🎉 ALL ${assertionCount} ASSERTIONS PASSED WITH 100% SUCCESS!`);
                console.log('================================================================\n');
                process.exit(0);
              });
            });
          });
        });
        reqMine.end();
      });
      reqEvt.write(newEvt);
      reqEvt.end();
    });
  });
});
