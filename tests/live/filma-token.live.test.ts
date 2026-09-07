import { expect, test } from 'vitest'

import {
  readFilmaLiveConfig,
  verifyFilmaTokenContract,
} from '../../src/adapters/filma/live-contract.js'

test('Filma token endpoint matches the redacted authentication contract', async () => {
  const result = await verifyFilmaTokenContract(
    readFilmaLiveConfig(process.env),
  )

  expect(result.status).toBe(200)
  expect(result.fields).toEqual(['organization_id', 'api_type'])
  expect(['readonly', 'fullaccess']).toContain(result.apiType)

  console.info(
    'Filma live contract verified:',
    JSON.stringify({ status: result.status, fields: result.fields }),
  )
})
