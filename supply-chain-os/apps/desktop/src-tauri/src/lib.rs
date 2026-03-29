use tauri::Manager;
use tracing::info;
use protocol::{NodeDb, SourceChain, Identity};
use std::sync::Mutex;

pub mod commands;
pub mod daemon;

/// Global application state — one per Tauri process.
pub struct AppState {
    /// The node's local database (SQLite via rusqlite)
    pub db: Mutex<NodeDb>,
    /// The node's source chain (append-only event log)
    pub chain: Mutex<SourceChain>,
    /// The node's identity (DID keypair)
    pub identity: Mutex<Identity>,
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

            // Initialize database, identity, and chain
            let db = NodeDb::open(&db_path).expect("failed to open database");
            let identity = Identity::generate().expect("failed to generate identity");
            let chain = SourceChain::genesis(&identity).expect("failed to create genesis chain");

            info!("Node identity: {}", identity.did);

            app.manage(AppState {
                db: Mutex::new(db),
                chain: Mutex::new(chain),
                identity: Mutex::new(identity),
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
            commands::inventory::get_stock_history,
            commands::inventory::adjust_stock,
            commands::inventory::receive_stock,
            commands::inventory::transfer_stock,
            commands::inventory::check_reorder_alerts,
            commands::inventory::batch_stock_count,
            // Procurement
            commands::procurement::create_purchase_order,
            commands::procurement::confirm_purchase_order,
            commands::procurement::cancel_purchase_order,
            commands::procurement::record_shipment,
            commands::procurement::receive_shipment,
            commands::procurement::list_purchase_orders,
            commands::procurement::get_purchase_order,
            commands::procurement::get_supplier_scorecard,
            // Warehouse
            commands::warehouse::create_task,
            commands::warehouse::assign_task,
            commands::warehouse::complete_task,
            commands::warehouse::list_tasks,
            commands::warehouse::get_bin_contents,
            commands::warehouse::get_bin_map,
            commands::warehouse::start_cycle_count,
            commands::warehouse::complete_cycle_count,
            commands::warehouse::auto_put_tasks,
            // Routes
            commands::routes::create_route,
            commands::routes::optimize_route,
            commands::routes::assign_driver,
            commands::routes::list_routes,
            commands::routes::get_route_detail,
            commands::routes::complete_stop,
            commands::routes::confirm_delivery,
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
