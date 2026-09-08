declare namespace Cloudflare {
  interface Env {
    TEST_MIGRATIONS: import('cloudflare:test').D1Migration[]
    PLAY_BOOTSTRAP_TOKEN?: string
    PLAY_RATE_LIMIT_KEY?: string
  }
}
