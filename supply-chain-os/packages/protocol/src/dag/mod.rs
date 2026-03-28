use serde::{Deserialize, Serialize};
use sha2::{Sha256, Digest};
use thiserror::Error;
use chrono::Utc;
use uuid::Uuid;

use crate::identity::Identity;

#[derive(Debug, Error)]
pub enum DagError {
    #[error("chain is empty — no genesis event")]
    EmptyChain,
    #[error("prev_hash mismatch at position {0}: expected {1}, got {2}")]
    HashMismatch(usize, String, String),
    #[error("invalid signature on event {0}")]
    InvalidSignature(String),
    #[error("serialization error: {0}")]
    Serialization(#[from] serde_json::Error),
}

// ─── Event Types ─────────────────────────────────────────────────────────────

/// All possible event types in the Supply Chain OS source chain.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum EventType {
    // System
    Genesis,
    NodeUpdated,

    // Inventory
    SkuCreated,
    SkuUpdated,
    StockReceived,
    StockAdjusted,
    StockTransferred,
    ReorderTriggered,

    // Procurement (dual-signed cross-node events)
    PoIssued,
    PoConfirmed,        // counterparty signs
    PoAmended,
    PoCancelled,
    ShipmentSent,       // supplier signs
    ShipmentReceived,   // buyer signs
    InvoiceSubmitted,
    InvoiceMatched,

    // Warehouse
    TaskCreated,
    TaskAssigned,
    TaskCompleted,
    BinUpdated,
    CycleCountStarted,
    CycleCountCompleted,

    // Logistics
    RouteCreated,
    RouteOptimized,
    StopCompleted,
    DeliveryConfirmed,  // POD — anchored to DHT

    // Quality Control
    InspectionStarted,
    ItemInspected,
    BatchPassed,
    BatchFailed,
    NcrRaised,          // sent P2P to supplier
    NcrResolved,

    // Forecasting
    ForecastRunCompleted,
    ModelUpdated,

    // Identity / Trust
    PeerConnected,      // dual-signed
    PeerTrustUpdated,
    PeerDisconnected,
}

// ─── Event Envelope ──────────────────────────────────────────────────────────

/// The immutable event envelope written to the source chain.
///
/// Every state change in the system is represented as a ChainEvent.
/// The local SQLite database is always a *projection* of these events —
/// it can be wiped and rebuilt from the chain at any time.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChainEvent {
    /// Unique event ID (UUIDv4)
    pub id: String,
    /// Protocol version at time of creation
    pub version: String,
    /// Event type discriminant
    pub event_type: EventType,
    /// DID of the node that authored this event
    pub author: String,
    /// SHA-256 of the previous event's canonical JSON (genesis has "0000...0000")
    pub prev_hash: String,
    /// Arbitrary JSON payload — schema varies by event_type
    pub payload: serde_json::Value,
    /// ed25519 signature over: event_type + prev_hash + payload (canonical JSON)
    pub signature: String,
    /// Unix milliseconds
    pub timestamp: i64,

    // ── Cross-node fields (populated only for dual-signed events) ──────────
    /// DID of the counterparty (for PO_ISSUED, SHIPMENT_SENT, etc.)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub counterparty: Option<String>,
    /// Counterparty's ed25519 signature
    #[serde(skip_serializing_if = "Option::is_none")]
    pub their_sig: Option<String>,
    /// DHT key where this event's hash is anchored (for cross-node events)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dht_anchor: Option<String>,
}

impl ChainEvent {
    /// Bytes that are signed/verified (canonical JSON of type + prev_hash + payload).
    pub fn signing_payload(
        event_type: &EventType,
        prev_hash: &str,
        payload: &serde_json::Value,
    ) -> Result<Vec<u8>, DagError> {
        let canonical = serde_json::json!({
            "event_type": event_type,
            "prev_hash": prev_hash,
            "payload": payload,
        });
        Ok(serde_json::to_vec(&canonical)?)
    }

    /// Compute the SHA-256 content hash of this event (used as next event's prev_hash).
    pub fn content_hash(&self) -> Result<String, DagError> {
        let canonical = serde_json::to_vec(self)?;
        let mut hasher = Sha256::new();
        hasher.update(&canonical);
        Ok(hex::encode(hasher.finalize()))
    }
}

// ─── Source Chain ─────────────────────────────────────────────────────────────

/// The append-only local event log for a Sovereign Node.
///
/// The chain is stored in SQLite (`source_chain` table) and loaded into
/// memory for signing/verification. The in-memory representation is a Vec
/// that mirrors the on-disk order — position 0 is always the GENESIS event.
pub struct SourceChain {
    events: Vec<ChainEvent>,
    pub author_did: String,
}

impl SourceChain {
    /// Create a brand-new chain with a GENESIS event.
    pub fn genesis(identity: &Identity) -> Result<Self, DagError> {
        let genesis_prev = "0".repeat(64);
        let payload = serde_json::json!({
            "did": identity.did,
            "protocol_version": crate::PROTOCOL_VERSION,
        });
        let signing_bytes =
            ChainEvent::signing_payload(&EventType::Genesis, &genesis_prev, &payload)?;
        let sig_bytes = identity.sign(&signing_bytes);

        let event = ChainEvent {
            id: Uuid::new_v4().to_string(),
            version: crate::PROTOCOL_VERSION.to_string(),
            event_type: EventType::Genesis,
            author: identity.did.clone(),
            prev_hash: genesis_prev,
            payload,
            signature: hex::encode(sig_bytes),
            timestamp: Utc::now().timestamp_millis(),
            counterparty: None,
            their_sig: None,
            dht_anchor: None,
        };

        Ok(Self {
            events: vec![event],
            author_did: identity.did.clone(),
        })
    }

    /// Reconstruct chain from stored events (loaded from SQLite at startup).
    pub fn from_events(events: Vec<ChainEvent>) -> Result<Self, DagError> {
        if events.is_empty() {
            return Err(DagError::EmptyChain);
        }
        let author_did = events[0].author.clone();
        let chain = Self { events, author_did };
        chain.verify_integrity()?;
        Ok(chain)
    }

    /// Append a new event to the chain.
    ///
    /// The identity must match the chain author (sovereign — only you write to your own chain).
    pub fn append(
        &mut self,
        identity: &Identity,
        event_type: EventType,
        payload: serde_json::Value,
        counterparty: Option<String>,
    ) -> Result<&ChainEvent, DagError> {
        let prev_hash = self
            .events
            .last()
            .ok_or(DagError::EmptyChain)?
            .content_hash()?;

        let signing_bytes =
            ChainEvent::signing_payload(&event_type, &prev_hash, &payload)?;
        let sig_bytes = identity.sign(&signing_bytes);

        let event = ChainEvent {
            id: Uuid::new_v4().to_string(),
            version: crate::PROTOCOL_VERSION.to_string(),
            event_type,
            author: identity.did.clone(),
            prev_hash,
            payload,
            signature: hex::encode(sig_bytes),
            timestamp: Utc::now().timestamp_millis(),
            counterparty,
            their_sig: None,
            dht_anchor: None,
        };

        self.events.push(event);
        Ok(self.events.last().unwrap())
    }

    /// Add the counterparty's signature to the most recently appended cross-node event.
    pub fn attach_counterparty_sig(
        &mut self,
        event_id: &str,
        their_sig: String,
        dht_anchor: Option<String>,
    ) -> Result<(), DagError> {
        let event = self
            .events
            .iter_mut()
            .find(|e| e.id == event_id)
            .ok_or_else(|| DagError::InvalidSignature(event_id.to_string()))?;
        event.their_sig = Some(their_sig);
        event.dht_anchor = dht_anchor;
        Ok(())
    }

    /// Read-only slice of all events.
    pub fn events(&self) -> &[ChainEvent] {
        &self.events
    }

    /// The hash of the latest event (used as prev_hash for the next append).
    pub fn head_hash(&self) -> Result<String, DagError> {
        self.events
            .last()
            .ok_or(DagError::EmptyChain)?
            .content_hash()
    }

    /// Full chain integrity check: hash linkage + signature verification.
    pub fn verify_integrity(&self) -> Result<(), DagError> {
        for (i, event) in self.events.iter().enumerate() {
            // Verify prev_hash linkage
            if i > 0 {
                let expected = self.events[i - 1].content_hash()?;
                if event.prev_hash != expected {
                    return Err(DagError::HashMismatch(
                        i,
                        expected,
                        event.prev_hash.clone(),
                    ));
                }
            }
            // Verify author signature
            let signing_bytes = ChainEvent::signing_payload(
                &event.event_type,
                &event.prev_hash,
                &event.payload,
            )?;
            let sig_bytes = hex::decode(&event.signature)
                .map_err(|_| DagError::InvalidSignature(event.id.clone()))?;
            Identity::verify_signature(&event.author, &signing_bytes, &sig_bytes)
                .map_err(|_| DagError::InvalidSignature(event.id.clone()))?;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::identity::Identity;

    #[test]
    fn test_genesis_and_append() {
        let id = Identity::generate().unwrap();
        let mut chain = SourceChain::genesis(&id).unwrap();
        assert_eq!(chain.events().len(), 1);
        assert_eq!(chain.events()[0].event_type, EventType::Genesis);

        chain
            .append(
                &id,
                EventType::SkuCreated,
                serde_json::json!({ "id": "SKU-001", "name": "Widget A" }),
                None,
            )
            .unwrap();

        assert_eq!(chain.events().len(), 2);
        chain.verify_integrity().expect("chain should be valid");
    }
}
