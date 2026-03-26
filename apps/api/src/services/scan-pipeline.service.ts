import crypto from 'crypto'
import { config } from '../utils/config'
import { supabase } from '../utils/supabase'

export interface GeoPoint { lat: number; lng: number }
export interface PlacementContext {
  type: 'avatar_space' | 'virtual_building' | 'journal_bg' | 'marketplace' | 'public_world'
  contextId: string
  position: { x: number; y: number; z: number }
  rotation: { rx: number; ry: number; rz: number }
  scale: { sx: number; sy: number; sz: number }
}

interface LumaAICapture {
  title: string
  source_type: 'upload'
}

interface LumaAIGenerateResponse {
  id: string
  state: 'pending' | 'processing' | 'completed' | 'failed'
  video?: { url: string }
  assets?: {
    video: string
    thumbnail: string
  }
}

// Style/region classification based on image metadata + location
const AFRICAN_REGIONS: Record<string, string[]> = {
  'NG': ['lagos', 'abuja', 'kano', 'ibadan', 'yoruba', 'igbo', 'hausa'],
  'GH': ['accra', 'kumasi', 'akan', 'ashanti'],
  'KE': ['nairobi', 'mombasa', 'swahili', 'kikuyu'],
  'ZA': ['johannesburg', 'cape_town', 'zulu', 'xhosa'],
  'ET': ['addis_ababa', 'amhara', 'oromo'],
  'SN': ['dakar', 'wolof', 'fulani'],
}

const STYLE_TAG_KEYWORDS: Record<string, string[]> = {
  'yoruba': ['wood', 'carving', 'bronze', 'beads', 'adire', 'aso-oke'],
  'igbo': ['pottery', 'bronze', 'mbari', 'uli'],
  'colonial': ['brick', 'arch', 'colonial', 'victorian'],
  'modern': ['glass', 'concrete', 'steel', 'modern'],
  'market': ['stall', 'market', 'kiosk', 'informal', 'street'],
  'traditional': ['mud', 'thatch', 'compound', 'courtyard'],
}

export class ScanPipelineService {
  /**
   * Process a multi-angle capture into a 3D world asset.
   *
   * Pipeline:
   *   1. Upload source images to R2 for permanent storage
   *   2. Submit to Luma AI for NeRF/photogrammetry reconstruction
   *   3. Poll until .glb mesh + textures are ready
   *   4. Generate LOD variants (high/medium/low)
   *   5. AI classification: type, style, region tags
   *   6. Generate thumbnail
   *   7. Store final record in world_scans
   */
  async processCapture(params: {
    userId: string
    captureImages: string[]   // base64 data URIs or pre-signed R2 URLs
    captureLocation: GeoPoint
    type: 'environment' | 'object' | 'art' | 'sculpture'
    name?: string
    description?: string
  }) {
    // 1. Upload source images to R2
    const uploadedImageUrls = await this.uploadImagesToR2(
      params.captureImages,
      params.userId
    )

    // 2. Insert a pending record immediately so client gets a scan ID
    const scanId = crypto.randomUUID()
    const { data: scanRecord, error: insertError } = await supabase
      .from('world_scans')
      .insert({
        id: scanId,
        scanner_id: params.userId,
        type: params.type,
        name: params.name ?? `${params.type} scan`,
        description: params.description ?? '',
        capture_images: uploadedImageUrls,
        capture_location: `POINT(${params.captureLocation.lng} ${params.captureLocation.lat})`,
        capture_date: new Date().toISOString(),
        visibility: 'private',
        is_approved: false,
        quality_score: null,
        processing_status: 'pending',
      })
      .select()
      .single()

    if (insertError) throw new Error(`Failed to create scan record: ${insertError.message}`)

    // 3. Submit to Luma AI for reconstruction (async — job picks it up)
    await this.submitToLumaAI(scanRecord.id, uploadedImageUrls)

    return scanRecord
  }

  /**
   * Upload images to Cloudflare R2.
   * Returns array of permanent public URLs.
   */
  private async uploadImagesToR2(
    images: string[],
    userId: string
  ): Promise<string[]> {
    const urls: string[] = []

    for (let i = 0; i < images.length; i++) {
      const imageData = images[i]
      const key = `scans/${userId}/${Date.now()}_${i}.jpg`

      // If it's a base64 data URI, decode it; otherwise treat as URL
      if (imageData.startsWith('data:')) {
        const base64 = imageData.split(',')[1]
        const buffer = Buffer.from(base64, 'base64')

        const res = await fetch(
          `${config.R2_PUBLIC_URL}/${key}`,
          {
            method: 'PUT',
            headers: {
              'Content-Type': 'image/jpeg',
              'Authorization': `Bearer ${config.R2_API_TOKEN}`,
              'Content-Length': String(buffer.length),
            },
            body: buffer,
          }
        )

        if (!res.ok) throw new Error(`R2 upload failed for image ${i}: ${res.statusText}`)
        urls.push(`${config.R2_PUBLIC_URL}/${key}`)
      } else {
        // Already a URL — assume it's accessible
        urls.push(imageData)
      }
    }

    return urls
  }

  /**
   * Submit capture images to Luma AI for 3D reconstruction.
   * Luma AI NeRF returns a .glb mesh + texture.
   */
  private async submitToLumaAI(scanId: string, imageUrls: string[]): Promise<void> {
    const lumaRes = await fetch(`${config.LUMA_AI_API_URL}/captures`, {
      method: 'POST',
      headers: {
        'Authorization': `luma-api-key=${config.LUMA_AI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: `NEXUS scan ${scanId}`,
        source_type: 'upload',
        image_urls: imageUrls,
      } as LumaAICapture & { image_urls: string[] }),
    })

    if (!lumaRes.ok) {
      const err = await lumaRes.text()
      throw new Error(`Luma AI submission failed: ${err}`)
    }

    const lumaJob: LumaAIGenerateResponse = await lumaRes.json()

    // Store Luma job ID on the scan record for the background job to poll
    await supabase
      .from('world_scans')
      .update({ luma_job_id: lumaJob.id, processing_status: 'processing' })
      .eq('id', scanId)
  }

  /**
   * Poll Luma AI for reconstruction result and finalize the scan.
   * Called by scan-reconstruction.ts background job.
   */
  async pollAndFinalizeScan(scanId: string, lumaJobId: string): Promise<void> {
    const lumaRes = await fetch(
      `${config.LUMA_AI_API_URL}/captures/${lumaJobId}`,
      {
        headers: { 'Authorization': `luma-api-key=${config.LUMA_AI_API_KEY}` },
      }
    )

    if (!lumaRes.ok) throw new Error(`Luma AI poll failed: ${lumaRes.statusText}`)

    const job: LumaAIGenerateResponse = await lumaRes.json()

    if (job.state === 'failed') {
      await supabase
        .from('world_scans')
        .update({ processing_status: 'failed' })
        .eq('id', scanId)
      return
    }

    if (job.state !== 'completed' || !job.assets) return  // still processing

    const meshUrl = job.assets.video   // Luma returns .glb as video asset URL
    const thumbnailUrl = job.assets.thumbnail

    // Generate LOD variants (high/medium/low are the same until post-processing pipeline is added)
    const lodUrls = {
      high: meshUrl,
      medium: meshUrl,  // TODO: run through Draco compression for medium/low
      low: meshUrl,
    }

    // Fetch the world scan to get its type + location for classification
    const { data: scan } = await supabase
      .from('world_scans')
      .select('type, capture_location, scanner_id')
      .eq('id', scanId)
      .single()

    // AI classification — tags based on type and location
    const { styleTags, regionTag, qualityScore } = await this.classifyScan(
      scan?.type ?? 'object',
      scan?.capture_location,
      meshUrl
    )

    await supabase
      .from('world_scans')
      .update({
        mesh_url: meshUrl,
        thumbnail_url: thumbnailUrl,
        lod_urls: lodUrls,
        style_tags: styleTags,
        region_tag: regionTag,
        quality_score: qualityScore,
        processing_status: 'ready',
      })
      .eq('id', scanId)
  }

  /**
   * Classify a scan with style tags and region tag.
   * Uses heuristics based on type + coordinates. Future: vision model.
   */
  private async classifyScan(
    type: string,
    captureLocation: any,
    meshUrl: string
  ): Promise<{ styleTags: string[]; regionTag: string; qualityScore: number }> {
    const styleTags: string[] = [type]
    let regionTag = 'africa'

    // Extract country code from PostGIS point (future: reverse geocode API)
    // For now, default to 'NG' (largest NEXUS launch market)
    const countryCode = 'NG'
    const regionKeywords = AFRICAN_REGIONS[countryCode] ?? []
    regionTag = regionKeywords[0] ?? 'nigeria'

    // Add style tags based on type
    if (type === 'art' || type === 'sculpture') {
      styleTags.push('cultural_heritage')
    }
    if (type === 'environment') {
      styleTags.push('urban_africa')
    }

    // Quality score: heuristic (0-10) — will be replaced by mesh quality analysis
    const qualityScore = 7.5

    return { styleTags, regionTag, qualityScore }
  }

  /**
   * Place a scan asset into a NEXUS context (avatar space, building, public world, etc.)
   */
  async placeScan(scanId: string, userId: string, context: PlacementContext) {
    // Verify scan exists and user has access
    const { data: scan, error } = await supabase
      .from('world_scans')
      .select('id, scanner_id, visibility')
      .eq('id', scanId)
      .single()

    if (error || !scan) throw new Error('Scan not found')

    const canPlace =
      scan.scanner_id === userId ||
      scan.visibility === 'public_world' ||
      scan.visibility === 'marketplace'

    if (!canPlace) throw new Error('You do not have permission to place this scan')

    const { data: placement, error: placementError } = await supabase
      .from('world_asset_placements')
      .insert({
        user_id: userId,
        scan_id: scanId,
        placement_context: context.type,
        context_id: context.contextId,
        position: context.position,
        rotation: context.rotation,
        scale: context.scale,
      })
      .select()
      .single()

    if (placementError) throw new Error(`Placement failed: ${placementError.message}`)

    // Increment download count if placing someone else's asset
    if (scan.scanner_id !== userId) {
      await supabase.rpc('increment_scan_download_count', { scan_id: scanId })
    }

    return placement
  }

  /**
   * List public world assets within a geographic bounding box.
   * Used to populate the map view with nearby 3D objects.
   */
  async listPublicWorldAssets(boundingBox: {
    minLat: number; maxLat: number; minLng: number; maxLng: number
  }) {
    const { data, error } = await supabase
      .from('world_scans')
      .select(`
        id, name, description, type, thumbnail_url, mesh_url, lod_urls,
        style_tags, region_tag, quality_score, download_count,
        capture_location, scanner_id
      `)
      .eq('visibility', 'public_world')
      .eq('is_approved', true)
      .eq('processing_status', 'ready')
      .not('mesh_url', 'is', null)

    if (error) throw new Error(`Failed to list world assets: ${error.message}`)

    // Filter by bounding box in application layer (PostGIS ST_Within would be better
    // but requires raw SQL — use RPC in production)
    return (data ?? []).filter(scan => {
      const loc = scan.capture_location
      if (!loc) return false
      // loc is "POINT(lng lat)" string or {coordinates: [lng, lat]}
      return true  // TODO: parse geometry and filter by bbox
    })
  }

  /**
   * Get a user's scan library
   */
  async getUserScans(userId: string) {
    const { data, error } = await supabase
      .from('world_scans')
      .select('*')
      .eq('scanner_id', userId)
      .order('created_at', { ascending: false })

    if (error) throw new Error(error.message)
    return data ?? []
  }

  /**
   * Get a single scan by ID (respects visibility rules)
   */
  async getScan(scanId: string, requestingUserId?: string) {
    const { data: scan, error } = await supabase
      .from('world_scans')
      .select('*')
      .eq('id', scanId)
      .single()

    if (error || !scan) throw new Error('Scan not found')

    const canView =
      scan.scanner_id === requestingUserId ||
      scan.visibility !== 'private'

    if (!canView) throw new Error('Access denied')

    return scan
  }

  /**
   * Update scan visibility or metadata
   */
  async updateScan(scanId: string, userId: string, updates: {
    name?: string
    description?: string
    visibility?: 'private' | 'marketplace' | 'public_world'
    price?: number
    styleTags?: string[]
  }) {
    // Verify ownership
    const { data: scan } = await supabase
      .from('world_scans')
      .select('scanner_id')
      .eq('id', scanId)
      .single()

    if (!scan || scan.scanner_id !== userId) throw new Error('Not authorized')

    const { data, error } = await supabase
      .from('world_scans')
      .update({
        ...(updates.name && { name: updates.name }),
        ...(updates.description && { description: updates.description }),
        ...(updates.visibility && { visibility: updates.visibility }),
        ...(updates.price !== undefined && { price: updates.price }),
        ...(updates.styleTags && { style_tags: updates.styleTags }),
      })
      .eq('id', scanId)
      .select()
      .single()

    if (error) throw new Error(error.message)
    return data
  }

  /**
   * Submit a scan for public world approval.
   * Flags it for moderation review before it appears on the public map.
   */
  async submitForPublicApproval(scanId: string, userId: string): Promise<void> {
    const { data: scan } = await supabase
      .from('world_scans')
      .select('scanner_id, processing_status, mesh_url')
      .eq('id', scanId)
      .single()

    if (!scan) throw new Error('Scan not found')
    if (scan.scanner_id !== userId) throw new Error('Not authorized')
    if (scan.processing_status !== 'ready') throw new Error('Scan is still processing')
    if (!scan.mesh_url) throw new Error('Scan has no mesh yet')

    await supabase
      .from('world_scans')
      .update({ visibility: 'public_world', is_approved: false })
      .eq('id', scanId)

    // TODO: notify moderators via webhook or admin dashboard
  }
}

export const scanPipelineService = new ScanPipelineService()
