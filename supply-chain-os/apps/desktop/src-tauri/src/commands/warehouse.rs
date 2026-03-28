use tauri::State;
use crate::AppState;

/// List warehouse tasks, optionally filtered by status.
#[tauri::command]
pub async fn list_tasks(
    status: Option<String>,
    state: State<'_, AppState>,
) -> Result<Vec<serde_json::Value>, String> {
    let _ = (status, state);
    Ok(vec![])
}

/// Mark a warehouse task as completed — emits TASK_COMPLETED event.
#[tauri::command]
pub async fn complete_task(
    task_id: String,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let _ = (task_id, state);
    Ok(serde_json::json!({ "status": "ok" }))
}

/// Get current contents of a bin.
#[tauri::command]
pub async fn get_bin_contents(
    bin_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<serde_json::Value>, String> {
    let _ = (bin_id, state);
    Ok(vec![])
}
