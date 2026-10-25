export type KeyName = { name: string; code: string }

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')
const NAMED: [string, string][] = [
  ['SPACE', 'Space'],
  ['ENTER', 'Enter'],
  ['NUMPAD_ENTER', 'NumpadEnter'],
  ['ESCAPE', 'Escape'],
  ['TAB', 'Tab'],
  ['BACKSPACE', 'Backspace'],
  ['DELETE', 'Delete'],
  ['INSERT', 'Insert'],
  ['HOME', 'Home'],
  ['END', 'End'],
  ['PAGEUP', 'PageUp'],
  ['PAGEDOWN', 'PageDown'],
  ['LEFT', 'ArrowLeft'],
  ['RIGHT', 'ArrowRight'],
  ['UP', 'ArrowUp'],
  ['DOWN', 'ArrowDown'],
  ['LSHIFT', 'ShiftLeft'],
  ['RSHIFT', 'ShiftRight'],
  ['LCTRL', 'ControlLeft'],
  ['RCTRL', 'ControlRight'],
  ['LALT', 'AltLeft'],
  ['RALT', 'AltRight'],
  ['LMETA', 'MetaLeft'],
  ['RMETA', 'MetaRight'],
  ['CAPSLOCK', 'CapsLock'],
  ['MINUS', 'Minus'],
  ['EQUAL', 'Equal'],
  ['LEFTBRACKET', 'BracketLeft'],
  ['RIGHTBRACKET', 'BracketRight'],
  ['BACKSLASH', 'Backslash'],
  ['SEMICOLON', 'Semicolon'],
  ['QUOTE', 'Quote'],
  ['COMMA', 'Comma'],
  ['PERIOD', 'Period'],
  ['SLASH', 'Slash'],
  ['BACKQUOTE', 'Backquote']
]

export const KEYS: KeyName[] = [
  ...LETTERS.map((letter) => ({ name: `BTN_${letter}`, code: `Key${letter}` })),
  ...Array.from({ length: 10 }, (_, index) => ({ name: `BTN_${index}`, code: `Digit${index}` })),
  ...Array.from({ length: 10 }, (_, index) => ({ name: `BTN_NUMPAD${index}`, code: `Numpad${index}` })),
  ...Array.from({ length: 12 }, (_, index) => ({ name: `BTN_F${index + 1}`, code: `F${index + 1}` })),
  ...NAMED.map(([name, code]) => ({ name: `BTN_${name}`, code }))
]

export function keyAction(
  type: string,
  repeat: boolean,
  code: string,
  typing: boolean
): { code: string; edge: 'down' | 'up'; fire: boolean } | null {
  if (typing || !code) return null
  if (type === 'keyup') return { code, edge: 'up', fire: true }
  if (type !== 'keydown') return null
  return { code, edge: 'down', fire: !repeat }
}

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  if (target.closest('input, textarea, select')) return true
  const editable = target.closest('[contenteditable]')
  return editable instanceof HTMLElement && editable.isContentEditable
}
