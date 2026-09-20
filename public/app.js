// AuditTrail-Ledger Controller & Merkle Visualizer
const blocksContainer = document.getElementById('blocksContainer');
const proofConsole = document.getElementById('proofConsole');

async function loadLedger() {
  try {
    const res = await fetch('/api/stats');
    const data = await res.json();
    if (data.stats) {
      document.getElementById('mBlocks').textContent = data.stats.totalBlocks;
      document.getElementById('mEvents').textContent = data.stats.totalEvents;
      document.getElementById('mPending').textContent = data.stats.pendingEventsCount;
      const valid = data.stats.integrity;
      const badge = document.getElementById('integrityBadge');
      const mInteg = document.getElementById('mIntegrity');
      if (valid) {
        badge.className = 'status-badge';
        badge.textContent = '🟢 Cryptographically Verified';
        mInteg.className = 'val green';
        mInteg.textContent = 'VALID';
      } else {
        badge.className = 'status-badge error';
        badge.textContent = '🔴 TAMPER DETECTED';
        mInteg.className = 'val red';
        mInteg.textContent = 'CORRUPTED';
      }
    }

    renderBlocks(data.chainSummary || []);
  } catch (e) {
    console.error('Failed to load ledger', e);
  }
}

function renderBlocks(blocks) {
  blocksContainer.innerHTML = '';
  blocks.forEach((b) => {
    const card = document.createElement('div');
    card.className = 'block-card';
    card.innerHTML = `
      <div class="block-header">
        <span class="block-idx">Block #${b.index}</span>
        <span class="block-time">${new Date(b.timestamp).toLocaleTimeString()}</span>
      </div>
      <div><span style="color:#6b7280; font-size:0.7rem;">PREV HASH:</span><div class="block-hash">${b.previousHash}</div></div>
      <div><span style="color:#6b7280; font-size:0.7rem;">MERKLE ROOT:</span><div class="merkle-root">${b.merkleRoot}</div></div>
      <div><span style="color:#6b7280; font-size:0.7rem;">BLOCK HASH:</span><div class="block-hash">${b.blockHash}</div></div>
      <div class="events-list">
        <span style="color:#9ca3af; font-size:0.75rem; font-weight:bold;">Events (${b.eventsCount}):</span>
        <div class="event-item">
          <span>Event Leaf 0</span>
          <button class="btn-xs" onclick="inspectProof(${b.index}, 0)">View Proof</button>
        </div>
      </div>
    `;
    blocksContainer.appendChild(card);
  });
}

window.inspectProof = async function(blockIndex, eventIndex) {
  proofConsole.innerHTML = '<p class="hint">Computing Merkle inclusion proof...</p>';
  try {
    const res = await fetch('/api/proof', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blockIndex, eventIndex })
    });
    const data = await res.json();
    if (data.proofObj) {
      // Verify proof
      const vRes = await fetch('/api/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data.proofObj)
      });
      const vData = await vRes.json();

      proofConsole.innerHTML = `
        <div style="color:${vData.isValid ? '#34d399' : '#f87171'}; font-weight:bold; margin-bottom:0.5rem;">
          ${vData.isValid ? '✓ PROOF OF INCLUSION: VALID' : '✗ PROOF INVALID'}
        </div>
        <div><strong>Leaf Hash:</strong> ${data.proofObj.leafHash}</div>
        <div><strong>Merkle Root:</strong> ${data.proofObj.merkleRoot}</div>
        <div><strong>Proof Sibling Steps:</strong> ${data.proofObj.proof.length}</div>
        <pre>${JSON.stringify(data.proofObj.proof, null, 2)}</pre>
      `;
    }
  } catch (err) {
    proofConsole.innerHTML = `<span style="color:#ef4444">Error: ${err.message}</span>`;
  }
};

// Record Form Handler
document.getElementById('recordForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const action = document.getElementById('evtAction').value;
  const actor = document.getElementById('evtActor').value;
  let details = document.getElementById('evtDetails').value;
  try { details = JSON.parse(details); } catch (ignore) {}

  try {
    const res = await fetch('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, actor, details })
    });
    const data = await res.json();
    if (data.success) {
      proofConsole.innerHTML = `<span style="color:#34d399">✓ Recorded event to pending pool (Pending: ${data.pendingCount})</span>`;
      document.getElementById('evtAction').value = '';
      document.getElementById('evtActor').value = '';
      document.getElementById('evtDetails').value = '';
      loadLedger();
    }
  } catch (err) {
    alert('Failed to record event: ' + err.message);
  }
});

// Seal Block Handler
document.getElementById('btnSealBlock').addEventListener('click', async () => {
  try {
    const res = await fetch('/api/blocks/mine', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      alert(`Block #${data.block.index} sealed with ${data.block.eventsCount} events!`);
      loadLedger();
    } else {
      alert(`Could not seal block: ${data.error}`);
    }
  } catch (e) {
    alert('Error sealing block: ' + e.message);
  }
});

// Verify Full Chain
document.getElementById('btnVerifyChain').addEventListener('click', async () => {
  try {
    const res = await fetch('/api/audit/verify');
    const data = await res.json();
    if (data.integrity.isValid) {
      alert(`✅ Ledger Integrity Verified! All ${data.integrity.totalBlocks} blocks are cryptographically sound.`);
    } else {
      alert(`❌ Tamper Detected at block #${data.integrity.corruptedBlockIndex}: ${data.integrity.reason}`);
    }
    loadLedger();
  } catch (e) {
    alert('Verification failed: ' + e.message);
  }
});

// Initial load
loadLedger();
setInterval(loadLedger, 4000);
