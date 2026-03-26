/**
 * Job: nfc-offline-sync
 * Runs: On-demand (triggered when device reconnects to internet)
 * Purpose: Process queued offline tap transactions in order
 */
export async function runNFCOfflineSyncJob(userId: string, queuedTaps: any[]) {
  // TODO:
  //   1. Sort taps by offline_created_at (chronological)
  //   2. For each tap: check for duplicates (idempotency key)
  //   3. Validate sender balance at time of sync
  //   4. Process each tap via NFCPaymentService.processTagRead
  //   5. Mark synced, record synced_at
  //   6. Return results (success/fail per tap)
  console.log(`Syncing ${queuedTaps.length} offline taps for user ${userId}`)
}
