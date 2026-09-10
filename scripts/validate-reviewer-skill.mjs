import { error, log } from 'node:console'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { argv, exit } from 'node:process'

const expected = {
  schema: 'play-cms-reviewer/v1',
  frontmatterRequired: ['name', 'description'],
  requiredInputs: {
    always: [
      'baseSha',
      'headSha',
      'issueNumber',
      'pullRequestNumber',
      'taskNumber',
      'taskSummary',
      'approvedDesignPath',
      'approvedPlanPath',
      'reviewRound',
    ],
    webhookTriggered: ['webhookEvent', 'webhookAction', 'deliveryId'],
    reviewRequested: ['requestedReviewerLogin'],
  },
  reviewRounds: ['initial', 're-review'],
  reviewRoundRules: {
    initial: {
      scope: 'full-diff',
      assignStableFindingIds: true,
    },
    're-review': {
      source: 'verified-formal-knryt-review',
      carryFindingLedger: true,
      reverifyAgainstCurrentDiff: true,
    },
  },
  findingStatuses: ['new', 'resolved', 'still-open'],
  findingLedger: {
    sourceFields: ['reviewId', 'author', 'commitId', 'submittedAt'],
    legacyIdPrefix: 'legacy-F-',
    newBlockingReasons: [
      'fix-introduced',
      'new-evidence',
      'initial-miss-admissible-critical-important',
    ],
    initialMissRequires: ['lateDiscoveryReason', 'reviewerProcessFollowUp'],
  },
  webhookEvent: 'pull_request',
  allowedActions: [
    'opened',
    'synchronize',
    'reopened',
    'ready_for_review',
    'review_requested',
  ],
  reviewRequestedReviewer: 'knryt',
  deniedEvents: ['pull_request_review', 'issue_comment'],
  delivery: {
    states: ['received', 'running', 'succeeded', 'failed'],
    claimable: ['new', 'failed', 'lease-expired'],
    suppressed: ['running-with-valid-lease', 'succeeded'],
  },
  verdictSectionOrder: [
    'Review scope',
    'Strengths',
    'Finding ledger',
    'Critical',
    'Important',
    'Minor',
    'Plan/spec defects',
    'Operational stop',
    'Assessment',
  ],
  operationalStopWhenOnlyBlocker: 'no-pr-write',
}

function parseFrontmatter(source) {
  const match = source.match(/^---\n([\s\S]*?)\n---(?:\n|$)/)
  if (!match?.[1]) throw new Error('frontmatter: missing YAML block')

  const values = {}
  for (const line of match[1].split('\n')) {
    const entry = line.match(/^([a-zA-Z][a-zA-Z0-9_-]*):\s*(.+)$/)
    if (!entry) continue
    values[entry[1]] = entry[2].replace(/^(?:"([\s\S]*)"|'([\s\S]*)')$/, '$1$2')
  }
  return values
}

function parseContract(source) {
  const matches = [
    ...source.matchAll(
      /<!-- reviewer-contract:start -->\s*```json\s*([\s\S]*?)\s*```\s*<!-- reviewer-contract:end -->/g,
    ),
  ]
  if (matches.length !== 1 || !matches[0]?.[1]) {
    throw new Error('contract: expected exactly one reviewer contract block')
  }

  let contract
  try {
    contract = JSON.parse(matches[0][1])
  } catch {
    throw new Error('contract: invalid JSON')
  }
  if (!contract || typeof contract !== 'object' || Array.isArray(contract)) {
    throw new Error('contract: expected a JSON object')
  }
  return contract
}

function equalArray(actual, wanted) {
  return (
    Array.isArray(actual) &&
    actual.length === wanted.length &&
    actual.every((value, index) => value === wanted[index])
  )
}

function validate(source) {
  const failures = []
  let frontmatter
  let contract

  try {
    frontmatter = parseFrontmatter(source)
  } catch (cause) {
    failures.push(cause.message)
  }
  try {
    contract = parseContract(source)
  } catch (cause) {
    failures.push(cause.message)
  }
  if (!frontmatter || !contract) return failures

  const checks = [
    ['frontmatter.name', frontmatter.name === 'play-cms-reviewer'],
    [
      'frontmatter.description',
      typeof frontmatter.description === 'string' &&
        frontmatter.description.startsWith('Use when '),
    ],
    ['contract.schema', contract.schema === expected.schema],
    [
      'contract.frontmatter.required',
      equalArray(contract.frontmatter?.required, expected.frontmatterRequired),
    ],
    [
      'contract.frontmatter.name',
      contract.frontmatter?.name === frontmatter.name,
    ],
    [
      'contract.frontmatter.descriptionPrefix',
      contract.frontmatter?.descriptionPrefix === 'Use when ',
    ],
    [
      'contract.requiredInputs.always',
      equalArray(
        contract.requiredInputs?.always,
        expected.requiredInputs.always,
      ),
    ],
    [
      'contract.requiredInputs.webhookTriggered',
      equalArray(
        contract.requiredInputs?.webhookTriggered,
        expected.requiredInputs.webhookTriggered,
      ),
    ],
    [
      'contract.requiredInputs.reviewRequested',
      equalArray(
        contract.requiredInputs?.reviewRequested,
        expected.requiredInputs.reviewRequested,
      ),
    ],
    [
      'contract.reviewRounds',
      equalArray(contract.reviewRounds, expected.reviewRounds),
    ],
    [
      'contract.reviewRoundRules.initial',
      contract.reviewRoundRules?.initial?.scope ===
        expected.reviewRoundRules.initial.scope &&
        contract.reviewRoundRules?.initial?.assignStableFindingIds === true,
    ],
    [
      'contract.reviewRoundRules.re-review',
      contract.reviewRoundRules?.['re-review']?.source ===
        expected.reviewRoundRules['re-review'].source &&
        contract.reviewRoundRules?.['re-review']?.carryFindingLedger === true &&
        contract.reviewRoundRules?.['re-review']?.reverifyAgainstCurrentDiff ===
          true,
    ],
    [
      'contract.findingStatuses',
      equalArray(contract.findingStatuses, expected.findingStatuses),
    ],
    [
      'contract.findingLedger.sourceFields',
      equalArray(
        contract.findingLedger?.sourceFields,
        expected.findingLedger.sourceFields,
      ),
    ],
    [
      'contract.findingLedger.legacyIdPrefix',
      contract.findingLedger?.legacyIdPrefix ===
        expected.findingLedger.legacyIdPrefix,
    ],
    [
      'contract.findingLedger.newBlockingReasons',
      equalArray(
        contract.findingLedger?.newBlockingReasons,
        expected.findingLedger.newBlockingReasons,
      ),
    ],
    [
      'contract.findingLedger.initialMissRequires',
      equalArray(
        contract.findingLedger?.initialMissRequires,
        expected.findingLedger.initialMissRequires,
      ),
    ],
    [
      'contract.webhook.event',
      contract.webhook?.event === expected.webhookEvent,
    ],
    [
      'contract.webhook.allowedActions',
      equalArray(contract.webhook?.allowedActions, expected.allowedActions),
    ],
    [
      'contract.webhook.reviewRequestedReviewer',
      contract.webhook?.reviewRequestedReviewer ===
        expected.reviewRequestedReviewer,
    ],
    [
      'contract.webhook.deniedEvents',
      equalArray(contract.webhook?.deniedEvents, expected.deniedEvents),
    ],
    [
      'contract.delivery.states',
      equalArray(contract.delivery?.states, expected.delivery.states),
    ],
    [
      'contract.delivery.claimable',
      equalArray(contract.delivery?.claimable, expected.delivery.claimable),
    ],
    [
      'contract.delivery.suppressed',
      equalArray(contract.delivery?.suppressed, expected.delivery.suppressed),
    ],
    [
      'contract.verdictSectionOrder',
      equalArray(contract.verdictSectionOrder, expected.verdictSectionOrder),
    ],
    [
      'contract.operationalStop.whenOnlyBlocker',
      contract.operationalStop?.whenOnlyBlocker ===
        expected.operationalStopWhenOnlyBlocker,
    ],
  ]

  for (const [path, passes] of checks) {
    if (!passes) failures.push(`${path}: invalid contract value`)
  }
  return failures
}

const skillPath = resolve(
  argv[2] ?? '.agents/skills/play-cms-reviewer/SKILL.md',
)

try {
  const failures = validate(await readFile(skillPath, 'utf8'))
  if (failures.length > 0) {
    for (const failure of failures) error(`Reviewer skill contract: ${failure}`)
    exit(1)
  }
  log(`Reviewer skill contract is valid: ${skillPath}`)
} catch (cause) {
  error(
    `Reviewer skill contract: ${cause instanceof Error ? cause.message : 'validation failed'}`,
  )
  exit(1)
}
