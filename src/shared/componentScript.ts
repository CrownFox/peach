import type { MenuComponent } from './types'

const colorNote = '-- self.visible  true or false. False hides this component.\n-- self.color    a color such as "#ff8800". White "#ffffff" leaves this unchanged.\n'

const buttonScript = `${colorNote}-- Called when this button is clicked.
-- self.text           the label
-- self.enabled        true or false. False shows the disabled image and ignores clicks.
-- self.button         a button path, such as "ui/Continue"
-- self.defaultImage   an image path
-- self.pressedImage   an image path
-- self.disabledImage  an image path
-- self:click()        runs onInteract
function onInteract()

end
`

const imageScript = `${colorNote}-- Called when this image is clicked.
-- self.image    an image path, such as "ui/Portrait"
-- self:click()  runs onInteract
function onInteract()

end
`

function onChangeScript(comment: string): string {
  return `${colorNote}${comment}
function onChange()

end
`
}

export function componentScriptTemplate(type: MenuComponent['type']): string {
  if (type === 'button') return buttonScript
  if (type === 'image') return imageScript
  if (type === 'panel') return `${colorNote}-- self.panel   a panel path, such as "ui/Frame"\n`
  if (type === 'label') return `${colorNote}-- self.text    the label\n-- self.panel   a panel path, such as "ui/Frame"\n`
  if (type === 'meter') {
    return `${colorNote}-- self.value   a number\n-- self.min\n-- self.max\n-- self.panel   a panel path, such as "ui/Frame"\n`
  }
  if (type === 'text' || type === 'textarea') {
    return onChangeScript('-- onChange runs when the player edits this value.\n-- self.value   the text\n-- self.panel   a panel path, such as "ui/Frame"')
  }
  if (type === 'toggle') {
    return onChangeScript('-- onChange runs when the player switches this toggle.\n-- self.value   true or false\n-- self.text    the label\n-- self.panel   a panel path, such as "ui/Frame"')
  }
  if (type === 'toggleGroup') {
    return onChangeScript('-- onChange runs when the player changes the selection.\n-- self.value   the selected option id, or a list of ids when the mode is Any\n-- self.panel   a panel path, such as "ui/Frame"')
  }
  if (type === 'slider') {
    return onChangeScript('-- onChange runs when the player moves this slider.\n-- self.value   a number\n-- self.min\n-- self.max\n-- self.panel   a panel path, such as "ui/Frame"')
  }
  if (type === 'pageViewer') {
    return onChangeScript('-- onChange runs when the player edits a text field or dropdown on the page.\n-- self:loadPage(book, "Chapter/Page")\n-- game.loadPage(self, bookPage)\n-- self:get("field")\n-- self:getInput("key")\n-- self.book    a book path\n-- self.page    a chapter/page path\n-- self.panel   a panel path\n-- self.progressive   true streams the page in\n-- self.scrollable   true scrolls. false hides the rest of the page\n-- self.rate   characters per second\n-- self.finished   true when the stream has finished\n-- self:start()  self:stop()  self:resume()  self:finish()')
  }
  if (type === 'composite') return `${colorNote}-- A placed composite uses the onLoad on its composite asset.\n`
  return onChangeScript('-- onChange runs when the player picks an option.\n-- self.value   the selected option id\n-- self.panel   a panel path, such as "ui/Frame"')
}
