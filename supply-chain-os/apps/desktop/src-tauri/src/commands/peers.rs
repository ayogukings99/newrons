use tauri::State;
use crate::AppState;

/// List all known peer relationships and their trust levels.
#[tauri::command]
pub async fn list_peers(
    state: State<'_, AppState>,
) -> Result<Vec<serde_json::Value>, String> {
    let _ = state;
    Ok(vec![])
}

/// Initiate a P2P connection to a remote peer node.
///
/// `invite_code` is a base58-encoded DID + multiaddr bundle generated
/// by the remote node's onboarding UI.
#[tauri::command]
pub async fn connect_peer(
    invite_code: String,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    // TODO: decode invite_code → (did, multiaddr)
    // Run P2P handshake via scos_protocol::p2p::P2pNode::connect()
    let _ = (invite_code, state);
    Ok(serde_json::json!({ "status": "pending" }))
}

/// Get the trust level for a specific peer DID.
#[tauri::command]
pub async fn get_peer_trust(
    peer_did: String,
    state: State<'_, AppState>,
) -> Result<Option<String>, String> {
    let _ = (peer_did, state);
    Ok(None)
}
