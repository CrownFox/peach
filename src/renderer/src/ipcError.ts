export function ipcError(error: unknown): string {
  const message = error instanceof Error ? error.message : 'Something went wrong.'
  return message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '')
}
