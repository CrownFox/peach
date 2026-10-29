const HANDLE = /^[A-Za-z_][A-Za-z0-9_]*$/

export function isScriptHandle(value: string): boolean {
  return value !== 'new' && HANDLE.test(value)
}
