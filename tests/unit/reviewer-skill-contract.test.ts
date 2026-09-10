import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { cwd, execPath } from 'node:process'
import { spawnSync } from 'node:child_process'

import { afterEach, describe, expect, it } from 'vitest'

const skillPath = '.agents/skills/play-cms-reviewer/SKILL.md'
const validatorPath = join(cwd(), 'scripts/validate-reviewer-skill.mjs')
const temporaryDirectories: string[] = []

async function runValidator(source: string) {
  const directory = await mkdtemp(join(tmpdir(), 'play-cms-reviewer-contract-'))
  temporaryDirectories.push(directory)
  const fixturePath = join(directory, 'SKILL.md')
  await writeFile(fixturePath, source, { mode: 0o600 })

  return spawnSync(execPath, [validatorPath, fixturePath], {
    cwd: cwd(),
    encoding: 'utf8',
  })
}

function mutateContract(
  source: string,
  mutate: (contract: Record<string, unknown>) => void,
) {
  const pattern =
    /<!-- reviewer-contract:start -->\s*```json\s*([\s\S]*?)\s*```\s*<!-- reviewer-contract:end -->/
  const match = source.match(pattern)
  if (!match?.[1]) throw new Error('reviewer contract block missing')

  const contract = JSON.parse(match[1]) as Record<string, unknown>
  mutate(contract)

  return source.replace(
    pattern,
    `<!-- reviewer-contract:start -->\n\n\`\`\`json\n${JSON.stringify(contract, null, 2)}\n\`\`\`\n\n<!-- reviewer-contract:end -->`,
  )
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  )
})

describe('play-cms reviewer skill contract', () => {
  it('runs the dedicated validator from pnpm verify', async () => {
    const packageJson = JSON.parse(await readFile('package.json', 'utf8')) as {
      scripts: Record<string, string>
    }

    expect(packageJson.scripts['validate:reviewer-skill']).toBe(
      'node scripts/validate-reviewer-skill.mjs',
    )
    expect(packageJson.scripts.verify?.split(' && ')).toContain(
      'pnpm validate:reviewer-skill',
    )
  })

  it('accepts the repository reviewer skill', async () => {
    const source = await readFile(skillPath, 'utf8')

    const result = await runValidator(source)

    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toContain('Reviewer skill contract is valid')
  })

  it('rejects an invalid frontmatter identity', async () => {
    const source = await readFile(skillPath, 'utf8')
    const mutated = source.replace(
      'name: play-cms-reviewer',
      'name: another-reviewer',
    )

    const result = await runValidator(mutated)

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('frontmatter.name')
  })

  it('rejects a non-object JSON contract', async () => {
    const source = await readFile(skillPath, 'utf8')
    const mutated = source.replace(
      /<!-- reviewer-contract:start -->\s*```json\s*[\s\S]*?\s*```\s*<!-- reviewer-contract:end -->/,
      '<!-- reviewer-contract:start -->\n\n```json\nnull\n```\n\n<!-- reviewer-contract:end -->',
    )

    const result = await runValidator(mutated)

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('contract: expected a JSON object')
  })

  it('rejects an omitted pull_request action', async () => {
    const source = await readFile(skillPath, 'utf8')
    const mutated = mutateContract(source, (contract) => {
      const webhook = contract.webhook as { allowedActions: string[] }
      webhook.allowedActions = webhook.allowedActions.filter(
        (action) => action !== 'ready_for_review',
      )
    })

    const result = await runValidator(mutated)

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('contract.webhook.allowedActions')
  })

  it('rejects an omitted conditional webhook input', async () => {
    const source = await readFile(skillPath, 'utf8')
    const mutated = mutateContract(source, (contract) => {
      const requiredInputs = contract.requiredInputs as {
        webhookTriggered: string[]
      }
      requiredInputs.webhookTriggered = requiredInputs.webhookTriggered.filter(
        (input) => input !== 'deliveryId',
      )
    })

    const result = await runValidator(mutated)

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('contract.requiredInputs.webhookTriggered')
  })

  it('rejects a different reviewer for review_requested', async () => {
    const source = await readFile(skillPath, 'utf8')
    const mutated = mutateContract(source, (contract) => {
      const webhook = contract.webhook as {
        reviewRequestedReviewer: string
      }
      webhook.reviewRequestedReviewer = 'someone-else'
    })

    const result = await runValidator(mutated)

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('contract.webhook.reviewRequestedReviewer')
  })

  it('rejects an invalid verdict section order', async () => {
    const source = await readFile(skillPath, 'utf8')
    const mutated = mutateContract(source, (contract) => {
      const order = contract.verdictSectionOrder as string[]
      ;[order[0], order[1]] = [order[1]!, order[0]!]
    })

    const result = await runValidator(mutated)

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('contract.verdictSectionOrder')
  })

  it('rejects weakened re-review source and revalidation rules', async () => {
    const source = await readFile(skillPath, 'utf8')
    const mutated = mutateContract(source, (contract) => {
      const rules = contract.reviewRoundRules as {
        're-review': { reverifyAgainstCurrentDiff: boolean }
      }
      rules['re-review'].reverifyAgainstCurrentDiff = false
    })

    const result = await runValidator(mutated)

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('contract.reviewRoundRules.re-review')
  })

  it('rejects a ledger that omits the initial-miss process follow-up', async () => {
    const source = await readFile(skillPath, 'utf8')
    const mutated = mutateContract(source, (contract) => {
      const ledger = contract.findingLedger as {
        initialMissRequires: string[]
      }
      ledger.initialMissRequires = ledger.initialMissRequires.filter(
        (field) => field !== 'reviewerProcessFollowUp',
      )
    })

    const result = await runValidator(mutated)

    expect(result.status).toBe(1)
    expect(result.stderr).toContain(
      'contract.findingLedger.initialMissRequires',
    )
  })

  it('rejects delivery recovery without an expired-lease claim', async () => {
    const source = await readFile(skillPath, 'utf8')
    const mutated = mutateContract(source, (contract) => {
      const delivery = contract.delivery as { claimable: string[] }
      delivery.claimable = delivery.claimable.filter(
        (state) => state !== 'lease-expired',
      )
    })

    const result = await runValidator(mutated)

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('contract.delivery.claimable')
  })

  it('rejects an Operational stop that permits a PR write', async () => {
    const source = await readFile(skillPath, 'utf8')
    const mutated = mutateContract(source, (contract) => {
      const operationalStop = contract.operationalStop as {
        whenOnlyBlocker: string
      }
      operationalStop.whenOnlyBlocker = 'comment'
    })

    const result = await runValidator(mutated)

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('contract.operationalStop.whenOnlyBlocker')
  })
})
