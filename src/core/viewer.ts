import {
  hasOnlyFields,
  isPlainRecord,
  normalizeEmail,
  validLoginPassword,
  validNewPassword,
} from './admin'

export type ViewerCredentials = Readonly<{
  email: string
  password: string
}>

export type ViewerLibraryRow = Readonly<{
  publicId: string
  title: string
  description: string
  status: 'draft' | 'published'
  startsAt: string | null
  endsAt: string | null
}>

export type ViewerLibraryItem = Readonly<{
  publicId: string
  title: string
  description: string
  endsAt: string | null
}>

function parseCredentials(
  value: unknown,
  passwordValid: (value: unknown) => value is string,
): ViewerCredentials | null {
  if (!isPlainRecord(value) || !hasOnlyFields(value, ['email', 'password']))
    return null
  const email = normalizeEmail(value.email)
  return email && passwordValid(value.password)
    ? { email, password: value.password }
    : null
}

export function parseViewerRegistration(value: unknown) {
  return parseCredentials(value, validNewPassword)
}

export function parseViewerLogin(value: unknown) {
  return parseCredentials(value, validLoginPassword)
}

export function availableLibraryItems(
  rows: readonly ViewerLibraryRow[],
  now: number,
): ViewerLibraryItem[] {
  return rows
    .filter((row) => {
      const startsAt = row.startsAt === null ? null : Date.parse(row.startsAt)
      const endsAt = row.endsAt === null ? null : Date.parse(row.endsAt)
      return (
        row.status === 'published' &&
        (startsAt === null || (Number.isFinite(startsAt) && startsAt <= now)) &&
        (endsAt === null || (Number.isFinite(endsAt) && endsAt > now))
      )
    })
    .map(({ publicId, title, description, endsAt }) => ({
      publicId,
      title,
      description,
      endsAt,
    }))
}
