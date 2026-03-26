/**
 * Job: security-report-expiry
 * Runs: Every hour
 * Purpose: Expire community safety reports older than 72 hours
 */
export async function runSecurityReportExpiryJob() {
  // TODO:
  //   1. Update community_safety_reports
  //      SET is_active = false
  //      WHERE expires_at < now() AND is_active = true
  //   2. Log count of expired reports
  //   Note: Reports may be renewed if re-reported — they get a fresh 72h window
  console.log('Expiring old security reports...')
}
