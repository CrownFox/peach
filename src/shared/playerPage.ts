export function embedGamePage(html: string, game: unknown): string {
  const payload = JSON.stringify(game).replaceAll('<', '\\u003c')
  if (!html.includes('__PEACH_GAME__')) throw new Error('The player page is missing its game slot.')
  return html.replace('__PEACH_GAME__', payload)
}
