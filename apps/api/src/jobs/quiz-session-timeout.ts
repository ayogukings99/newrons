/**
 * Job: quiz-session-timeout
 * Runs: Every 5 minutes
 * Purpose: Auto-end abandoned quiz sessions
 */
export async function runQuizSessionTimeoutJob() {
  // TODO:
  //   1. Find quiz_sessions where status = 'active' AND started_at < 2 hours ago
  //   2. For each: call QuizService.endSession to finalize scores + distribute rewards
  //   3. Log abandoned session IDs for analytics
  console.log('Timing out abandoned quiz sessions...')
}
