export const SCENE_CSS = `
.scene-root { position: absolute; inset: 0; overflow: hidden; z-index: 0; }
.scene-node { position: absolute; box-sizing: border-box; container-type: size; }
.scene-node > .body { position: absolute; inset: 0; }
.scene-node.kind-collider { pointer-events: none; }
.scene-node.kind-collider > .body { border: 2px solid #e8946a; background: rgba(232, 148, 106, 0.16); box-sizing: border-box; }
.scene-node.kind-collider.is-circle > .body { border-radius: 50%; }
.scene-node.is-flip-x > .body { transform: scaleX(-1); }
.scene-node.is-flip-y > .body { transform: scaleY(-1); }
.scene-node.is-flip-x.is-flip-y > .body { transform: scale(-1, -1); }
.scene-node.is-crisp, .scene-node.is-crisp .picture, .scene-node.is-crisp .label { image-rendering: pixelated; }
.scene-node .face { position: absolute; inset: 0; box-sizing: border-box; pointer-events: none; }
.scene-node .face .nine, .scene-node .face .tile, .scene-node .face .sheet { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; image-rendering: pixelated; }
.scene-node .picture { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: fill; pointer-events: none; display: none; }
.scene-node.has-crop { overflow: hidden; }
.scene-node.has-crop .picture { object-fit: fill; max-width: none; }
.scene-node .missing {
  position: absolute; inset: 0; display: none; align-items: center; justify-content: center;
  border: 1px dashed #8a7b70; color: #b3a69a; background: rgba(255,255,255,0.03);
  font: 12px "Segoe UI", sans-serif; text-align: center; padding: 6px; pointer-events: none;
}
.scene-node .label {
  position: absolute; inset: 0; display: none; flex-direction: column; align-items: stretch; justify-content: center;
  text-align: center; pointer-events: none; overflow: hidden; line-height: 1.15;
  padding: 4%; white-space: pre-wrap; overflow-wrap: anywhere;
}
.scene-node .meter {
  position: absolute; left: 8%; right: 8%; top: 30%; height: 40%;
  background: rgba(255,255,255,0.08); pointer-events: none; overflow: hidden;
}
.scene-node .meter-fill { height: 100%; width: 0; }
.scene-node .control { position: absolute; inset: 0; display: flex; min-width: 0; min-height: 0; }
.scene-node .control .field,
.scene-node .control .area,
.scene-node .control .range,
.scene-node .control .menu,
.scene-node .control .choice {
  width: 100%; height: 100%; box-sizing: border-box; margin: 0;
  background: transparent; border: 0; color: inherit; font: inherit; padding: 6%;
}
.scene-node .control .area { resize: none; }
.scene-node .control .options { position: absolute; inset: 0; display: flex; flex-direction: column; overflow: auto; }
.scene-node .control .options .choice { flex: 1 0 auto; height: auto; text-align: left; cursor: pointer; }
.scene-node .control .choice[data-on="true"] { background: rgba(232, 148, 106, 0.28); }
.scene-node .control .range { padding: 0 4%; accent-color: #e8946a; }
.scene-root.is-interactive .scene-node.kind-button { cursor: pointer; }
.scene-node .page-view {
  position: absolute; inset: 0; overflow: auto; box-sizing: border-box;
  padding: 4% 5%; line-height: 1.45; white-space: pre-wrap; overflow-wrap: anywhere;
}
.scene-node .page-view p { margin: 0 0 0.65em; }
.scene-node .page-view img { height: 1.4em; width: auto; vertical-align: middle; }
.scene-node .page-view .page-input,
.scene-node .page-view .page-drop {
  display: inline-block; min-width: 6em; margin: 0 0.15em; padding: 0.05em 0.35em;
  border: 1px solid currentColor; border-radius: 0.3em; background: rgba(0,0,0,0.18); color: inherit; font: inherit;
}
.scene-node .page-view .page-note {
  display: inline-block; padding: 0 0.4em; border-radius: 0.4em; background: rgba(196, 181, 224, 0.28); font-size: 0.85em;
}
.scene-node .page-view .page-condition {
  margin: 0 0 0.7em; padding: 0.4em 0.6em; border-left: 3px solid #e0b15a; background: rgba(224, 177, 90, 0.08);
}
.scene-node .page-missing { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: #b3a69a; font: 13px "Segoe UI", sans-serif; }
.modal-layer { position: absolute; inset: 0; z-index: 2; display: flex; align-items: center; justify-content: center; background: rgba(0, 0, 0, 0.5); }
.modal-stage { position: relative; flex: none; background: transparent; }
`

export function installSceneStyles(): void {
  if (typeof document === 'undefined') return
  let style = document.querySelector<HTMLStyleElement>('style[data-peach-scene]')
  if (!style) {
    style = document.createElement('style')
    style.dataset.peachScene = 'true'
    document.head.append(style)
  }
  if (style.textContent !== SCENE_CSS) style.textContent = SCENE_CSS
}
