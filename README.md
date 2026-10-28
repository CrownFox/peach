# Peach Game Maker

An editor for menu-driven games. Build menus, books, and collections, script them in Lua, play them in the editor, and export a game that runs in the browser.

## Features

- Project tree of menus, buttons, images, panels, scripts, collections, books, and composites
- Menu canvas with zoom, pan, and an inspector for each component
- Lua scripting
- In-editor play, including Back, Forward, and Restart
- Export to a static page: `index.html`, `player.js`, and the game's media

## Requirements

- [Node.js](https://nodejs.org/) 22.12 or newer
- npm

## Getting started

```bash
npm install
npm run dev
```

The first dev start downloads the Electron binary.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the editor |
| `npm run build` | Build the Electron app |
| `npm run preview` | Preview the production build |
| `npm test` | Run the tests |
| `npm run typecheck` | Check the editor and the Electron process |

## Scripting

Menus and components run Lua. A component with the script id `play` is reached from the menu that is open:

```lua
function onLoad()
  game.currentMenu.play.text = "Start"
end
```

`game.state` keeps values across menu changes. `game.saveSlot` and `game.loadSlot` store a play session. `game.customSaveSlot` stores tables you choose, in a separate set of slots.

## Project layout

```
src/main       Electron process: files, dialogs, export
src/preload    Bridge between Electron and the editor
src/renderer   Vue editor
src/shared     Game model, Lua host, and the exported player
src/player     Browser player page
```

## Stack

[Electron](https://www.electronjs.org/), [Vue](https://vuejs.org/), [TypeScript](https://www.typescriptlang.org/), and [Fengari](https://fengari.io/) for Lua.
