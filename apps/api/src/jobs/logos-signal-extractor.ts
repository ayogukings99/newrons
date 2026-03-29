/**
 * LOGOS Signal Extractor Job
 *
 * Background job that runs every 6 hours to extract demand signals from
 * LOGOS community knowledge graphs.
 *
 * Scheduled via: cron job, task scheduler, or manual trigger via API
 *
 * Flow:
 *   1. Get all public LOGOS graphs updated in the last 6 hours
 *   2. For each graph, fetch recent nodes
 *   3. Extract demand signals using Claude classification
 *   4. Upsert into demand_signals table
 *   5. Log results and metrics
 *
 * Monitoring:
 *   - Track extraction count, success/failure rates
 *   - Alert on anomalies (zero signals extracted unexpectedly)
 *   - Store job history in logs
 */

import { logosIntelligenceService } from '../services/integration/logos-intelligence.service'
import { supabaseAdmin } from '../lib/supabase'

interface ExtractionResult {
  jobId: string
  status: 'success' | 'failure'
  startedAt: Date
  completedAt: Date
  signalsExtracted: number
  graphsProcessed: number
  errors: string[]
}

/**
 * Run the LOGOS signal extraction job.
 * Called by cron scheduler or API endpoint.
 */
export async function runLogosSignalExtraction(): Promise<ExtractionResult> {
  const jobId = `logos-extract-${Date.now()}`
  const startedAt = new Date()
  const errors: string[] = []

  console.log(`[${jobId}] Starting LOGOS signal extraction job`)

  try {
    // Get all public graphs updated in the last 6 hours
    const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000)

    const { data: recentGraphs, error: graphError } = await supabaseAdmin
      .from('logos_graphs')
      .select('id, title, node_ids')
      .eq('is_public', true)
      .gte('created_at', sixHoursAgo.toISOString())

    if (graphError || !recentGraphs) {
      const msg = `Failed to fetch recent graphs: ${graphError?.message}`
      errors.push(msg)
      console.error(`[${jobId}] ${msg}`)
    }

    let totalSignalsExtracted = 0
    let graphsProcessed = 0

    // For each graph, extract signals
    if (recentGraphs && recentGraphs.length > 0) {
      console.log(`[${jobId}] Processing ${recentGraphs.length} recent graphs`)

      for (const graph of recentGraphs) {
        try {
          console.log(`[${jobId}] Extracting signals from graph: ${graph.title} (${graph.id})`)

          const signals = await logosIntelligenceService.extractDemandSignals({
            graphIds: [graph.id],
            since: sixHoursAgo,
          })

          totalSignalsExtracted += signals.length
          graphsProcessed++

          console.log(`[${jobId}]   → Extracted ${signals.length} signals from ${graph.title}`)

          // Log extraction details
          if (signals.length > 0) {
            console.log(`[${jobId}]   → Sample signals:`)
            signals.slice(0, 3).forEach(s => {
              console.log(
                `[${jobId}]      - ${s.skuExternalId} (${s.locationCode || 'global'}): ` +
                `${s.signalType} × ${s.magnitude.toFixed(2)} (confidence: ${(s.confidence * 100).toFixed(0)}%)`
              )
            })
          }
        } catch (err: any) {
          const msg = `Failed to extract signals from graph ${graph.id}: ${err.message}`
          errors.push(msg)
          console.error(`[${jobId}] ${msg}`)
        }
      }
    } else {
      console.log(`[${jobId}] No recent graphs found, skipping extraction`)
    }

    const completedAt = new Date()
    const durationMs = completedAt.getTime() - startedAt.getTime()

    const result: ExtractionResult = {
      jobId,
      status: errors.length === 0 ? 'success' : 'failure',
      startedAt,
      completedAt,
      signalsExtracted: totalSignalsExtracted,
      graphsProcessed,
      errors,
    }

    // Log job result
    console.log(
      `[${jobId}] Extraction complete in ${durationMs}ms: ` +
      `${graphsProcessed} graphs, ${totalSignalsExtracted} signals, ` +
      `${errors.length} errors`
    )

    // Store job history in database (optional)
    try {
      await storeJobHistory(result)
    } catch (err: any) {
      console.error(`[${jobId}] Failed to store job history: ${err.message}`)
    }

    return result
  } catch (err: any) {
    const completedAt = new Date()
    console.error(`[${jobId}] Job failed:`, err)

    return {
      jobId,
      status: 'failure',
      startedAt,
      completedAt,
      signalsExtracted: 0,
      graphsProcessed: 0,
      errors: [err.message],
    }
  }
}

/**
 * Store job execution history for audit and monitoring.
 * Optional: create a logos_extraction_jobs table to track all runs.
 */
async function storeJobHistory(result: ExtractionResult): Promise<void> {
  // This would require a logos_extraction_jobs table:
  // CREATE TABLE logos_extraction_jobs (
  //   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  //   job_id TEXT NOT NULL UNIQUE,
  //   status TEXT NOT NULL,
  //   signals_extracted INT,
  //   graphs_processed INT,
  //   errors JSONB,
  //   started_at TIMESTAMPTZ,
  //   completed_at TIMESTAMPTZ,
  //   created_at TIMESTAMPTZ DEFAULT NOW()
  // );

  // For now, just log to console
  // In production, consider storing to database or external monitoring service
}

/**
 * Cron job entry point for scheduling frameworks.
 * Example with node-cron:
 *
 *   import cron from 'node-cron'
 *   cron.schedule('0 *\/6 * * *', () => {
 *     runLogosSignalExtraction().catch(err => {
 *       console.error('LOGOS extraction job failed:', err)
 *     })
 *   })
 *
 * Or with Fastify plugin:
 *
 *   app.register(async (fastify) => {
 *     // Run on startup and every 6 hours
 *     await runLogosSignalExtraction()
 *     setInterval(() => {
 *       runLogosSignalExtraction().catch(err => {
 *         fastify.log.error('LOGOS extraction job failed:', err)
 *       })
 *     }, 6 * 60 * 60 * 1000)
 *   })
 */
