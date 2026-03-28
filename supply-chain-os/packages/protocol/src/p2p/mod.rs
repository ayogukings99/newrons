/// P2P transport module — libp2p peer sessions and DHT participation.
///
/// Responsibilities:
/// 1. **Peer discovery** — mDNS (local network) + Kademlia DHT (internet)
/// 2. **Peer sessions** — authenticated connections between trading partners
/// 3. **Event streaming** — send/receive cross-node events over sessions
/// 4. **DHT anchoring** — store event hashes (not payloads) in the shared DHT
///
/// Session handshake (see SUPPLY-CHAIN-ARCHITECTURE.md §4.3):
///   A → B: HELLO (my_did, my_pubkey, version)
///   B → A: HELLO_ACK (their_did, challenge_bytes)
///   A → B: CHALLENGE_RESPONSE (signature over challenge_bytes)
///   B → A: SESSION_ESTABLISHED
///
/// Only after SESSION_ESTABLISHED can event streams flow.

use serde::{Deserialize, Serialize};
use thiserror::Error;
use crate::identity::Identity;

#[derive(Debug, Error)]
pub enum P2pError {
    #[error("transport error: {0}")]
    Transport(String),
    #[error("handshake failed: {0}")]
    HandshakeFailed(String),
    #[error("peer not connected: {0}")]
    NotConnected(String),
    #[error("DHT error: {0}")]
    Dht(String),
    #[error("protocol version mismatch: {0}")]
    VersionMismatch(String),
}

// ─── Handshake Messages ──────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HelloMessage {
    pub my_did: String,
    pub my_pubkey_hex: String,
    pub protocol_version: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HelloAckMessage {
    pub their_did: String,
    /// Random 32-byte challenge for the initiating node to sign
    pub challenge_hex: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChallengeResponse {
    pub signature_hex: String,
}

// ─── Trust Levels ────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum TrustLevel {
    /// Discovered via DHT, no connection established
    Untrusted,
    /// Connection requested, waiting for confirmation
    Pending,
    /// Active trading partner — can exchange signed events
    Trading,
    /// Identity verified via on-chain proof or trusted third party
    Verified,
    /// Read access to relevant events for compliance / audit
    Auditor,
}

// ─── Peer Session ────────────────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct PeerSession {
    pub local_did: String,
    pub remote_did: String,
    pub trust_level: TrustLevel,
    pub established_at: i64,
    pub last_event_at: Option<i64>,
}

impl PeerSession {
    pub fn new(local_did: String, remote_did: String, trust_level: TrustLevel) -> Self {
        Self {
            local_did,
            remote_did,
            trust_level,
            established_at: chrono::Utc::now().timestamp_millis(),
            last_event_at: None,
        }
    }

    pub fn is_event_allowed(&self) -> bool {
        matches!(
            self.trust_level,
            TrustLevel::Trading | TrustLevel::Verified | TrustLevel::Auditor
        )
    }
}

// ─── P2P Node ────────────────────────────────────────────────────────────────

/// The libp2p swarm wrapper for a Sovereign Node.
///
/// In a full implementation this holds the `libp2p::Swarm` and its event loop.
/// Here we define the interface so the Tauri command layer and the protocol
/// core can be developed in parallel against a stable API.
pub struct P2pNode {
    pub local_did: String,
    sessions: Vec<PeerSession>,
}

impl P2pNode {
    pub fn new(local_did: String) -> Self {
        Self {
            local_did,
            sessions: Vec::new(),
        }
    }

    /// Initiate the handshake with a remote peer.
    ///
    /// Full flow:
    ///   1. Open libp2p connection to remote multiaddr
    ///   2. Send HELLO
    ///   3. Wait for HELLO_ACK, extract challenge
    ///   4. Sign challenge with local identity
    ///   5. Send CHALLENGE_RESPONSE
    ///   6. Wait for SESSION_ESTABLISHED
    pub async fn connect(
        &mut self,
        identity: &Identity,
        remote_did: &str,
        _multiaddr: &str,
    ) -> Result<PeerSession, P2pError> {
        // TODO: implement full libp2p handshake
        // Stub: create a PENDING session
        let session = PeerSession::new(
            identity.did.clone(),
            remote_did.to_string(),
            TrustLevel::Pending,
        );
        self.sessions.push(session.clone());
        Ok(session)
    }

    /// Send a serialized event to a connected peer.
    pub async fn send_event(
        &self,
        remote_did: &str,
        event_json: &str,
    ) -> Result<(), P2pError> {
        let session = self
            .sessions
            .iter()
            .find(|s| s.remote_did == remote_did)
            .ok_or_else(|| P2pError::NotConnected(remote_did.to_string()))?;

        if !session.is_event_allowed() {
            return Err(P2pError::HandshakeFailed(
                "trust level too low to send events".to_string(),
            ));
        }

        // TODO: serialize and send over libp2p stream
        tracing::debug!("→ event to {}: {} bytes", remote_did, event_json.len());
        Ok(())
    }

    /// Anchor an event hash in the DHT.
    ///
    /// Only the hash is stored in the DHT — not the payload.
    /// This provides a public, tamper-evident record without leaking payload data.
    pub async fn dht_anchor(&self, key: &str, hash: &str) -> Result<String, P2pError> {
        // TODO: libp2p Kademlia PUT
        let dht_key = format!("/scos/events/{}", key);
        tracing::debug!("DHT anchor: {} = {}", dht_key, hash);
        Ok(dht_key)
    }

    /// Look up a node's current multiaddr from the DHT.
    pub async fn dht_find_peer(&self, did: &str) -> Result<Option<String>, P2pError> {
        // TODO: libp2p Kademlia GET
        tracing::debug!("DHT lookup: {}", did);
        Ok(None)
    }

    pub fn active_sessions(&self) -> &[PeerSession] {
        &self.sessions
    }
}
