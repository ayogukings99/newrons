/**
 * Job: scan-reconstruction
 * Runs: On-demand (triggered when new scan is uploaded)
 * Purpose: Poll Luma AI for reconstruction completion, then store mesh + textures
 */
export async function runScanReconstructionJob(scanId: string) {
  // TODO:
  //   1. Fetch scan record from world_scans (status: 'processing')
  //   2. Poll Luma AI for reconstruction status
  //   3. On completion: download .glb mesh + UV textures
  //   4. Upload to R2 (mesh_url, texture_url)
  //   5. Generate LOD variants (high/medium/low poly)
  //   6. Generate thumbnail
  //   7. AI classify: type, style_tags, region_tag
  //   8. Update world_scans: status → 'ready', store all asset URLs
  console.log(`Processing scan reconstruction for scanId: ${scanId}`)
}
