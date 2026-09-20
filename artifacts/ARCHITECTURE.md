# 📐 System Architecture Specification: AuditTrail-Ledger v2.0.0
- **Project:** AuditTrail-Ledger
- **Author:** Expert Software Architect
- **Status:** APPROVED & IN PRODUCTION
- **Version:** 2.0.0

## 1. High-Level Component Topology

```mermaid
flowchart TD
    Client["🌐 Enterprise Audit Producer"] -->|POST /api/events| Gateway["⚡ HTTP Server Entrypoint (src/index.js)"]
    Gateway --> MemPool["📥 Memory Pool (Pending Events)"]
    
    subgraph Engine["Cryptographic Core Engine (src/engine.js)"]
        direction TB
        Miner["Block Sealer"]
        Merkle["RFC 6962 SHA-256 Merkle Tree"]
        Hasher["Block Header Hash Generator"]
    end
    
    MemPool --> Miner
    Miner --> Merkle
    Merkle --> Hasher
    
    subgraph Ledger["Cryptographic Block Chain"]
        direction LR
        Genesis["Genesis Block #0"] <---> B1["Block #1"] <---> B2["Block #2"]
    end
    
    Hasher --> Ledger
    Ledger --> Verifier["🛡️ Automated Tamper-Detection Engine"]
```

## 2. Merkle Proof Verification Pathway

```mermaid
sequenceDiagram
    autonumber
    actor Auditor as Compliance Auditor / Client
    participant API as HTTP API Server (src/index.js)
    participant Core as Merkle Tree Kernel (src/engine.js)

    Auditor->>API: POST /api/proof { blockIndex: 1, eventIndex: 0 }
    API->>Core: getProofForEvent(1, 0)
    Core->>Core: Extract Sibling Hashes (O(log n))
    Core-->>API: { leafHash, proof, merkleRoot }
    API-->>Auditor: Return Proof Path
    Auditor->>API: POST /api/verify { leafHash, proof, merkleRoot }
    API->>Core: MerkleTree.verifyProof(...)
    Core-->>API: true (Cryptographically Authentic)
    API-->>Auditor: 200 OK { isValid: true }
```
