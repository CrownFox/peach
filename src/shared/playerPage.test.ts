import { describe, expect, it } from 'vitest'
import { embedGamePage } from './playerPage'

describe('exported player page', () => {
  it('embeds the game so the page can be opened as a file', () => {
    const page = embedGamePage('<script id="peach-game" type="application/json">__PEACH_GAME__</script>', {
      name: 'Demo',
      assets: [{ script: '</script><script>alert(1)</script>' }]
    })
    expect(page).not.toContain('__PEACH_GAME__')
    expect(page).not.toContain('</script><script>')
    const payload = page.match(/<script id="peach-game" type="application\/json">(.*)<\/script>/)?.[1] ?? ''
    expect(JSON.parse(payload)).toMatchObject({ name: 'Demo' })
  })
})