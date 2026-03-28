use tauri::Manager;
use tracing::info;

mod commands;
mod daemon;

/// Global application state — one per Tauri process.
pub struct AppState {
    /// The node's local database (SQLite via rusqlite)
    pub db_path: String,
    /// The node's DID (loaded from secure store at startup)
    pub node_did: tokio::sync::Mutex<Option<String>>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter("scos=debug,info")
        .init();

    info!("Supply Chain OS desktop node starting");

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            // Resolve the app data directory for the SQLite database
            let app_dir = app
                .path()
                .app_data_dir()
                .expect("failed to resolve app data dir");
            std::fs::create_dir_all(&app_dir).expect("failed to create app data dir");
            let db_path = app_dir.join("node.sqlite").to_string_lossy().to_string();

            info!("Node DB path: {}", db_path);

            app.manage(AppState {
                db_path,
                node_did: tokio::sync::Mutex::new(None),
            });

            // Spawn background sync daemon
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                daemon::run_sync_daemon(handle).await;
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Identity
            commands::identity::get_or_create_identity,
            commands::identity::get_node_profile,
            // Inventory
            commands::inventory::list_skus,
            commands::inventory::create_sku,
            commands::inventory::get_stock_levels,
            commands::inventory::adjust_stock,
            // Procurement
            commands::procurement::create_purchase_order,
            commands::procurement::list_purchase_orders,
            commands::procurement::get_purchase_order,
            // Warehouse
            commands::warehouse::list_tasks,
            commands::warehouse::complete_task,
            commands::warehouse::get_bin_contents,
            // Peers
            commands::peers::list_peers,
            commands::peers::connect_peer,
            commands::peers::get_peer_trust,
            // Chain
            commands::chain::get_chain_events,
            commands::chain::get_chain_head,
        ])
        .run(tauri::generate_context!())
        .expect("error running Supply Chain OS desktop node");
}
