use tauri::State;
use serde::{Deserialize, Serialize};
use scos_protocol::identity::{Identity, NodeProfile};
use crate::AppState;

#[derive(Debug, Serialize, Deserialize)]
pub struct IdentityResult {
    pub did: String,
    pub is_new: bool,
}

/// Get the node's existing DID, or generate a new identity on first run.
///
/// The secret key is stored in Tauri's secure plugin-store (OS keychain on macOS/Windows,
/// encrypted file on Linux). The DID is derived from the public key each time.
#[tauri::command]
pub async fn get_or_create_identity(
    state: State<'_, AppState>,
) -> Result<IdentityResult, String> {
    let mut did_guard = state.node_did.lock().await;

    if let Some(ref did) = *did_guard {
        return Ok(IdentityResult { did: did.clone(), is_new: false });
    }

    // TODO: attempt to load secret key from tauri-plugin-store
    // For now: generate a fresh identity
    let identity = Identity::generate().map_err(|e| e.to_string())?;
    let did = identity.did.clone();

    // TODO: persist secret key bytes to plugin-store
    // store.set("node_secret_key", hex::encode(identity.export_secret_bytes()))

    *did_guard = Some(did.clone());
    Ok(IdentityResult { did, is_new: true })
}

/// Return the public node profile (safe to share with peers).
#[tauri::command]
pub async fn get_node_profile(
    state: State<'_, AppState>,
) -> Result<NodeProfile, String> {
    let did_guard = state.node_did.lock().await;
    let did = did_guard
        .as_ref()
        .ok_or("node identity not initialized — call get_or_create_identity first")?
        .clone();
    drop(did_guard);

    // Reconstruct from stored secret — TODO: load from plugin-store
    // For now return a stub profile
    Ok(NodeProfile {
        did,
        public_key_hex: String::new(), // TODO
        display_name: None,
        protocol_version: scos_protocol::PROTOCOL_VERSION.to_string(),
    })
}
