/**
 * Job: scan-reconstruction
 * Runs: Every 60 seconds (polls all scans with processing_status = 'processing')
 * Purpose: Poll Luma AI for reconstruction completion, finalize mesh + assets
 */
import { supabase } from '../utils/supabase'
import { scanPipelineService } from '../services/scan-pipeline.service'

export async function runScanReconstructionJob(scanId?: string): Promise<void> {
  // If a specific scanId is given, process just that one
  if (scanId) {
    await processOneScan(scanId)
    return
  }

  // Otherwise, pick up all scans currently processing
  const { data: pendingScans, error } = await supabase
    .from('world_scans')
    .select('id, luma_job_id, processing_status, created_at')
    .in('processing_status', ['processing'])
    .not('luma_job_id', 'is', null)
    .order('created_at', { ascending: true })
    .limit(50)

  if (error) {
    console.error('[scan-reconstruction] Failed to fetch pending scans:', error.message)
    return
  }

  if (!pendingScans || pendingScans.length === 0) return

  console.log(`[scan-reconstruction] Polling ${pendingScans.length} active scan(s)`)

  // Process in parallel, capped at 10 concurrent to avoid rate-limiting Luma AI
  const batchSize = 10
  for (let i = 0; i < pendingScans.length; i += batchSize) {
    const batch = pendingScans.slice(i, i + batchSize)
    await Promise.allSettled(
      batch.map(scan => processOneScan(scan.id, scan.luma_job_id))
    )
  }

  // Also expire scans that have been processing for more than 30 minutes
  // (Luma AI failures may not explicitly notify us)
  const thirtyMinsAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString()
  const { error: expireError } = await supabase
    .from('world_scans')
    .update({ processing_status: 'failed' })
    .eq('processing_status', 'processing')
    .lt('created_at', thirtyMinsAgo)

  if (expireError) {
    console.error('[scan-reconstruction] Failed to expire stale scans:', expireError.message)
  }
}

async function processOneScan(scanId: string, lumaJobId?: string): Promise<void> {
  try {
    // Fetch luma_job_id if not passed in
    let jobId = lumaJobId
    if (!jobId) {
      const { data: scan } = await supabase
        .from('world_scans')
        .select('luma_job_id')
        .eq('id', scanId)
        .single()
      jobId = scan?.luma_job_id
    }

    if (!jobId) {
      console.warn(`[scan-reconstruction] Scan ${scanId} has no Luma job ID — skipping`)
      return
    }

    await scanPipelineService.pollAndFinalizeScan(scanId, jobId)
    console.log(`[scan-reconstruction] Scan ${scanId} finalized successfully`)
  } catch (err: any) {
    console.error(`[scan-reconstruction] Error processing scan ${scanId}:`, err.message)
  }
}
