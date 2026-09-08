const encoder = new TextEncoder()
const PASSWORD_ITERATIONS = 600_000
const HEX = /^[0-9a-f]+$/i

function toHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(
    '',
  )
}

function fromHex(value: string) {
  if (value.length % 2 !== 0 || !HEX.test(value))
    throw new Error('invalid encoding')
  const bytes = new Uint8Array(value.length / 2)
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16)
  }
  return bytes
}

async function pbkdf2(password: string, salt: Uint8Array<ArrayBuffer>) {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PASSWORD_ITERATIONS },
    key,
    256,
  )
  return new Uint8Array(bits)
}

export async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const hash = await pbkdf2(password, salt)
  return `pbkdf2-sha256$${PASSWORD_ITERATIONS}$${toHex(salt)}$${toHex(hash)}`
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array) {
  let difference = left.length ^ right.length
  const length = Math.max(left.length, right.length)
  for (let index = 0; index < length; index += 1) {
    difference |=
      (left[index % left.length] ?? 0) ^ (right[index % right.length] ?? 0)
  }
  return difference === 0
}

const dummyPasswordHash =
  'pbkdf2-sha256$600000$00000000000000000000000000000000$0000000000000000000000000000000000000000000000000000000000000000'

export async function verifyPassword(password: string, storedHash?: string) {
  const parts = (storedHash ?? dummyPasswordHash).split('$')
  if (
    parts.length !== 4 ||
    parts[0] !== 'pbkdf2-sha256' ||
    parts[1] !== String(PASSWORD_ITERATIONS)
  ) {
    throw new Error('invalid password hash')
  }
  const salt = fromHex(parts[2]!)
  const expected = fromHex(parts[3]!)
  const actual = await pbkdf2(password, salt)
  return storedHash !== undefined && constantTimeEqual(actual, expected)
}

export async function sha256Hex(value: string) {
  return toHex(
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', encoder.encode(value)),
    ),
  )
}

export function randomHex(byteLength: number) {
  return toHex(crypto.getRandomValues(new Uint8Array(byteLength)))
}

export function isStrongHexSecret(value: string | undefined): value is string {
  return (
    value !== undefined &&
    value.length >= 64 &&
    value.length % 2 === 0 &&
    HEX.test(value)
  )
}

export function constantTimeSecretEqual(
  expected: string,
  supplied: string | null,
) {
  const left = encoder.encode(expected.toLowerCase())
  const right = encoder.encode((supplied ?? '').toLowerCase())
  return constantTimeEqual(left, right)
}

export async function hmacHex(secretHex: string, value: string) {
  if (!isStrongHexSecret(secretHex))
    throw new Error('invalid HMAC configuration')
  const key = await crypto.subtle.importKey(
    'raw',
    fromHex(secretHex),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  return toHex(
    new Uint8Array(
      await crypto.subtle.sign('HMAC', key, encoder.encode(value)),
    ),
  )
}

const crockford = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

export function generateAccessCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  let normalized = ''
  for (const byte of bytes) normalized += crockford[byte & 31]
  return {
    normalized,
    rendered: normalized.match(/.{4}/g)!.join('-'),
  }
}
