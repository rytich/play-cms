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
    const specification = await readFile(
      'docs/superpowers/specs/2026-09-03-foundation-design.md',
      'utf8',
    )

    expect(packageJson.engines.node).toBe('^22.13.0 || >=24.0.0')
    expect(readme).toContain('Node.js 22.13.0系または24以上')
    expect(specification).toContain('Node.js 22.13.0以上の22.x、または24以上')
  })

  it('states the current unlicensed repository status without claiming open source', async () => {
    const readme = await readFile('README.md', 'utf8')

    expect(readme).toContain('ライセンスは未決定')
    expect(readme).toContain('利用・改変・再配布の許諾はまだ付与していません')
    expect(readme).not.toContain('オープンソース動画CMS')
  })

  it('links the canonical workflow to its tracking issue', async () => {
    const workflow = await readFile('docs/development/workflow.md', 'utf8')

    expect(workflow).toContain('https://github.com/rytich/play-cms/issues/1')
  })

  it('documents staged build and CI merge gates before Tasks 7 and 8', async () => {
    const specification = await readFile(
      'docs/superpowers/specs/2026-09-03-foundation-design.md',
      'utf8',
    )
    const plan = await readFile(
      'docs/superpowers/plans/2026-09-03-foundation-implementation.md',
      'utf8',
    )
    const contributing = await readFile('CONTRIBUTING.md', 'utf8')

    expect(specification).toContain('Task 7で導入するまでは')
    expect(specification).toContain('Task 8でCIを導入するまでは')
    expect(plan).toContain('Task 8でCIを導入するまでは')
    expect(contributing).toContain('Task 7で導入するまでは')
    expect(contributing).toContain('Task 8でCIを導入するまでは')
  })

  it('distinguishes custom labels from the reused GitHub default label', async () => {
    const specification = await readFile(
      'docs/superpowers/specs/2026-09-03-foundation-design.md',
      'utf8',
    )

    expect(specification).toContain('カスタムラベル9件')
    expect(specification).toContain('GitHub既定の`good first issue`を再利用')
  })

  it('keeps the Task 1 plan synchronized with the repository contract', async () => {
    const plan = await readFile(
      'docs/superpowers/plans/2026-09-03-foundation-implementation.md',
      'utf8',
    )

    expect(plan).toContain('.prettierignore')
    expect(plan).toContain('.agents/skills/play-cms-reviewer/SKILL.md')
    expect(plan).toContain('format:check')
  })

  it('binds every automated merge to the exact reviewed head', async () => {
    const policyPaths = [
      '.agents/skills/play-cms-reviewer/SKILL.md',
      'CONTRIBUTING.md',
      'docs/development/workflow.md',
      'docs/superpowers/specs/2026-09-03-foundation-design.md',
    ]

    for (const path of policyPaths) {
      const policy = await readFile(path, 'utf8')

      expect(policy).toContain('--match-head-commit <reviewed-head-sha>')
    }
  })

  it('requires successful CI for the reviewed head after Task 8', async () => {
    const reviewerSkill = await readFile(
      '.agents/skills/play-cms-reviewer/SKILL.md',
      'utf8',
    )
    const japanesePolicyPaths = [
      'CONTRIBUTING.md',
      'docs/development/workflow.md',
      'docs/superpowers/specs/2026-09-03-foundation-design.md',
    ]

    expect(reviewerSkill).toContain(
      'all expected CI checks for the reviewed head are present and successful',
    )
    for (const path of japanesePolicyPaths) {
      const policy = await readFile(path, 'utf8')

      expect(policy).toContain('review対象headのCIチェックが存在し、すべて成功')
    }
  })

  it('uses one explicit merge-commit command for automated merges', async () => {
    const policyPaths = [
      '.agents/skills/play-cms-reviewer/SKILL.md',
      'CONTRIBUTING.md',
      'docs/development/workflow.md',
      'docs/superpowers/specs/2026-09-03-foundation-design.md',
    ]

    for (const path of policyPaths) {
      const policy = await readFile(path, 'utf8')

      expect(policy).toContain(
        'gh pr merge <pr-number> --merge --match-head-commit <reviewed-head-sha>',
      )
    }
  })
})
