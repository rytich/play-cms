declare namespace Cloudflare {
  interface Env {
    TEST_MIGRATIONS: import('cloudflare:test').D1Migration[]
    OLD_DATABASE: D1Database
    ROLLBACK_DATABASE: D1Database
    PLAY_BOOTSTRAP_TOKEN?: string
    PLAY_RATE_LIMIT_KEY?: string
    PLAY_ENCRYPTION_KEY?: string
    PLAY_CMS_P0_INVITE_PLAYBACK?: string
    PLAY_CMS_P0_FILMA_FILE_ID?: string
  }
}
