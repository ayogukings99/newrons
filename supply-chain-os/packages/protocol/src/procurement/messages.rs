//! P2P Message types for cross-node procurement lifecycle.
//!
//! These messages are sent between trading partners (buyer ↔ supplier)
//! to exchange signed PO events over the P2P network.

use serde::{Deserialize, Serialize};
use crate::dag::ChainEvent;

/// Buyer sends this to supplier after creating a PO.
///
/// Contains the complete PO_ISSUED event signed by the buyer.
/// The supplier will validate the signature and respond with PoConfirmedMessage.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PoIssuedMessage {
    /// The PO_ISSUED event from the buyer's source chain
    pub event: ChainEvent,
    /// Sender's DID (should match event.author)
    pub sender_did: String,
}

/// Supplier sends this back to buyer after confirming the PO.
///
/// Contains the buyer's PO_ISSUED event with the supplier's signature attached.
/// Once received and persisted, the PO status transitions to CONFIRMED.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PoConfirmedMessage {
    /// The PO ID being confirmed
    pub po_id: String,
    /// Supplier's ed25519 signature over the PO_ISSUED event payload
    pub supplier_sig: String,
    /// The updated PO_ISSUED event (now dual-signed)
    pub event: ChainEvent,
}

/// Supplier sends this to buyer when shipment is dispatched.
///
/// Contains tracking information and a SHIPMENT_SENT event for on-chain record.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShipmentNotification {
    /// The PO ID being shipped
    pub po_id: String,
    /// Tracking number or URL (carrier-specific)
    pub tracking: String,
    /// The SHIPMENT_SENT event from the supplier's chain
    pub event: ChainEvent,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_po_issued_message_serialization() {
        let msg = PoIssuedMessage {
            event: ChainEvent {
                id: "evt-123".to_string(),
                version: "0.1.0".to_string(),
                event_type: crate::dag::EventType::PoIssued,
                author: "did:scn:buyer".to_string(),
                prev_hash: "abc".to_string(),
                payload: serde_json::json!({ "po_id": "PO-001" }),
                signature: "sig123".to_string(),
                timestamp: 123456789,
                counterparty: Some("did:scn:supplier".to_string()),
                their_sig: None,
                dht_anchor: None,
            },
            sender_did: "did:scn:buyer".to_string(),
        };

        let json = serde_json::to_string(&msg).unwrap();
        let _msg2: PoIssuedMessage = serde_json::from_str(&json).unwrap();
    }
}
