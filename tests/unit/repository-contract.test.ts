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
  '.agents/skills/play-cms-reviewer/SKILL.md',
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
    expect(agents).toContain('.agents/skills/play-cms-reviewer/SKILL.md')
  })

  it('discovers unit and integration TypeScript tests', async () => {
    const config = await readFile('vitest.config.ts', 'utf8')

    expect(config).toContain('tests/{unit,integration}/**/*.test.{ts,tsx}')
  })

  it('documents the Node.js minimum required by the toolchain', async () => {
    const packageJson = JSON.parse(await readFile('package.json', 'utf8')) as {
      engines: { node: string }
    }
    const readme = await readFile('README.md', 'utf8')

    expect(packageJson.engines.node).toBe('>=22.13.0')
    expect(readme).toContain('Node.js 22.13.0以上')
  })

  it('links the canonical workflow to its tracking issue', async () => {
    const workflow = await readFile('docs/development/workflow.md', 'utf8')

    expect(workflow).toContain('https://github.com/rytich/play-cms/issues/1')
  })
})
