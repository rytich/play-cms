import { access, readFile } from 'node:fs/promises'

import { describe, expect, it } from 'vitest'

const requiredFiles = [
  'AGENTS.md',
  'CONTRIBUTING.md',
  'SECURITY.md',
  '.github/ISSUE_TEMPLATE/bug.yml',
  '.github/ISSUE_TEMPLATE/feature.yml',
  '.github/ISSUE_TEMPLATE/docs.yml',
  '.github/pull_request_template.md',
]

describe('repository contract', () => {
  it.each(requiredFiles)('contains %s', async (path) => {
    await expect(access(path)).resolves.toBeUndefined()
  })

  it('keeps AGENTS.md as an index to canonical documents', async () => {
    const agents = await readFile('AGENTS.md', 'utf8')

    expect(agents).toContain('CONTRIBUTING.md')
    expect(agents).toContain('docs/development/workflow.md')
    expect(agents).toContain('pnpm verify')
  })
})
