/// Supply Chain OS — Sovereign Node Protocol Core
///
/// This crate is the shared Rust library that powers both the Tauri desktop
/// node and (via WASM/FFI) the Expo mobile node. It contains:
///
/// - `identity` — DID keypair generation, signing, verification
/// - `dag`      — Source chain (append-only event log), event envelope
/// - `sync`     — CRDT merge via Automerge (own-device sync)
/// - `p2p`      — libp2p transport, peer sessions, DHT participation
/// - `db`       — SQLite schema init, event projection engine

pub mod identity;
pub mod dag;
pub mod sync;
pub mod p2p;
pub mod db;

pub use identity::Identity;
pub use dag::{SourceChain, ChainEvent, EventType};
pub use db::NodeDb;

/// Protocol version — bump on breaking event-format changes
pub const PROTOCOL_VERSION: &str = "0.1.0";
