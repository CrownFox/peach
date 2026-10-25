declare module 'fengari/src/lua.js' {
  const api: Record<string, any>
  export default api
}

declare module 'fengari/src/lauxlib.js' {
  const api: Record<string, any>
  export default api
}

declare module 'fengari/src/fengaricore.js' {
  export function to_luastring(value: string): Uint8Array
}

declare module 'fengari/src/lbaselib.js' {
  export function luaopen_base(L: unknown): number
}

declare module 'fengari/src/lstrlib.js' {
  export function luaopen_string(L: unknown): number
}

declare module 'fengari/src/ltablib.js' {
  export function luaopen_table(L: unknown): number
}

declare module 'fengari/src/lmathlib.js' {
  export function luaopen_math(L: unknown): number
}

declare module 'fengari/src/lutf8lib.js' {
  export function luaopen_utf8(L: unknown): number
}
