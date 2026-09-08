export type LinkActivation = Readonly<{
  button: number
  defaultPrevented: boolean
  altKey: boolean
  ctrlKey: boolean
  metaKey: boolean
  shiftKey: boolean
}>

export function shouldHandleSameDocumentLink(event: LinkActivation): boolean {
  return (
    !event.defaultPrevented &&
    event.button === 0 &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey
  )
}
