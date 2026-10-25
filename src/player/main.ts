import { mountPlayer } from '../shared/mountPlayer'

const root = document.querySelector('#app')
if (root instanceof HTMLElement) {
  mountPlayer(root)
}
