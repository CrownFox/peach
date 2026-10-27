export const FORMAT_VERSION = 2

export type AssetType = 'menu' | 'button' | 'image' | 'script' | 'panel' | 'collection' | 'book' | 'composite' | 'scene' | 'tileset'

export type ProjectMeta = {
  formatVersion: number
  name: string
  author: string
  icon: string | null
  entryMenuId: string | null
}

export type ButtonSlices = {
  left: number
  right: number
  top: number
  bottom: number
}

export type SliceFill = 'stretch' | 'tile'

export type ButtonMode = 'static' | 'nine-panel'

export type ImageAsset = {
  id: string
  type: 'image'
  name: string
  relativePath: string
  file: string | null
  width: number
  height: number
  format: string | null
}

export type ButtonAsset = {
  id: string
  type: 'button'
  name: string
  relativePath: string
  mode: ButtonMode
  slices: ButtonSlices
  edgeFill: SliceFill
  centerFill: SliceFill
  states: {
    default: string | null
    pressed: string | null
    disabled: string | null
  }
}

export type PanelAsset = {
  id: string
  type: 'panel'
  name: string
  relativePath: string
  imageId: string | null
  slices: ButtonSlices
  edgeFill: SliceFill
  centerFill: SliceFill
}

export type ChoiceOption = {
  id: string
  label: string
}

export type ToggleMode = 'one' | 'any'

export type ComponentBase = {
  id: string
  name: string
  x: number
  y: number
  width: number
  height: number
  handle: string
  scriptId: string | null
  script: string
  properties?: Record<string, string | boolean | number>
  tint: string
  visible: boolean
  z?: number
}

export type ImageFit = 'stretch' | 'tile'

export type ImageComponent = ComponentBase & {
  type: 'image'
  imageId: string | null
  fit: ImageFit
}

export type ButtonComponent = ComponentBase & {
  type: 'button'
  buttonId: string | null
  enabled: boolean
  text: string
  fontFamily: string
  fontSize: number
  color: string
}

export type PanelComponent = ComponentBase & {
  type: 'panel'
  panelId: string | null
}

export type LabelAlignX = 'left' | 'middle' | 'right'
export type LabelAlignY = 'top' | 'center' | 'bottom'

export type LabelComponent = ComponentBase & {
  type: 'label'
  text: string
  fontFamily: string
  fontSize: number
  color: string
  alignX: LabelAlignX
  alignY: LabelAlignY
  panelId: string | null
}

export type MeterComponent = ComponentBase & {
  type: 'meter'
  min: number
  max: number
  value: number
  fillColor: string
  panelId: string | null
}

export type TextComponent = ComponentBase & {
  type: 'text'
  value: string
  placeholder: string
  fontFamily: string
  fontSize: number
  color: string
  panelId: string | null
}

export type TextAreaComponent = ComponentBase & {
  type: 'textarea'
  value: string
  placeholder: string
  fontFamily: string
  fontSize: number
  color: string
  panelId: string | null
}

export type ToggleComponent = ComponentBase & {
  type: 'toggle'
  value: boolean
  text: string
  fontFamily: string
  fontSize: number
  color: string
  panelId: string | null
}

export type ToggleGroupComponent = ComponentBase & {
  type: 'toggleGroup'
  mode: ToggleMode
  options: ChoiceOption[]
  selected: string[]
  fontFamily: string
  fontSize: number
  color: string
  panelId: string | null
}

export type SliderComponent = ComponentBase & {
  type: 'slider'
  min: number
  max: number
  step: number
  value: number
  fillColor: string
  panelId: string | null
}

export type DropdownComponent = ComponentBase & {
  type: 'dropdown'
  options: ChoiceOption[]
  value: string
  fontFamily: string
  fontSize: number
  color: string
  panelId: string | null
}

export type PageAlign = 'start' | 'center' | 'end'

export type PageMarks = {
  bold: boolean
  italic: boolean
  underline: boolean
  strike: boolean
  color: string | null
  fontSize: number | null
  fontFamily: string | null
}

export type PageTextRun = { type: 'text'; text: string; marks: PageMarks }
export type PageImageRun = { type: 'image'; id: string; imageId: string | null }
export type PageEvaluateRun = { type: 'evaluate'; id: string; script: string }
export type PageTextInputRun = { type: 'textInput'; id: string; key: string; placeholder: string }
export type PageDropdownRun = { type: 'dropdown'; id: string; key: string; options: string[] }
export type PageRun = PageTextRun | PageImageRun | PageEvaluateRun | PageTextInputRun | PageDropdownRun
export type PageParagraph = { type: 'paragraph'; align: PageAlign; runs: PageRun[] }
export type PageConditional = { type: 'conditional'; id: string; script: string; blocks: PageParagraph[] }
export type PageBlock = PageParagraph | PageConditional

export const DEFAULT_TEXT_RATE = 40

export type PageViewerComponent = ComponentBase & {
  type: 'pageViewer'
  bookId: string | null
  pagePath: string
  fontFamily: string
  fontSize: number
  color: string
  panelId: string | null
  progressive: boolean
  rate: number
  scrollable: boolean
}

export type CompositeComponent = ComponentBase & {
  type: 'composite'
  compositeId: string | null
  enabled: boolean
}

export type SceneViewerComponent = ComponentBase & {
  type: 'sceneViewer'
  sceneId: string | null
  viewX: number
  viewY: number
  scale: number
  scaleWithViewer: boolean
}

export type TileSpan = { x: number; y: number; width: number; height: number }

export type TileCell = { x: number; y: number; tileX: number; tileY: number; tilesetId: string | null }

export type TileComponent = ComponentBase & {
  type: 'tile'
  tilesetId: string | null
  tileX: number
  tileY: number
}

export type TilemapComponent = ComponentBase & {
  type: 'tilemap'
  tilesetId: string | null
  tileWidth: number
  tileHeight: number
  cells: TileCell[]
}

export type ColliderComponent = ComponentBase & {
  type: 'collider'
  shape: 'square' | 'circle'
  tags: string[]
  enabled: boolean
}

export type ZFieldComponent = ComponentBase & {
  type: 'zField'
  children: MenuComponent[]
}

export type MenuComponent =
  | ImageComponent
  | ButtonComponent
  | PanelComponent
  | LabelComponent
  | MeterComponent
  | TextComponent
  | TextAreaComponent
  | ToggleComponent
  | ToggleGroupComponent
  | SliderComponent
  | DropdownComponent
  | PageViewerComponent
  | CompositeComponent
  | SceneViewerComponent
  | TileComponent
  | TilemapComponent
  | ColliderComponent
  | ZFieldComponent

export const DEFAULT_MENU_WIDTH = 880
export const DEFAULT_MENU_HEIGHT = 495
export const MIN_MENU_WIDTH = 320
export const MIN_MENU_HEIGHT = 180
export const MIN_COMPOSITE_SIZE = 32

export type MenuAsset = {
  id: string
  type: 'menu'
  name: string
  relativePath: string
  width: number
  height: number
  gridSize: number
  snapToGrid: boolean
  scriptId: string | null
  script: string
  components: MenuComponent[]
}

export type CompositeAsset = {
  id: string
  type: 'composite'
  name: string
  relativePath: string
  width: number
  height: number
  originX: number
  originY: number
  gridSize: number
  snapToGrid: boolean
  scriptId: string | null
  script: string
  components: MenuComponent[]
}

export type SceneAsset = {
  id: string
  type: 'scene'
  name: string
  relativePath: string
  width: number
  height: number
  gridSize: number
  snapToGrid: boolean
  scriptId: string | null
  script: string
  components: MenuComponent[]
  persistent: boolean
}

export type TilesetAsset = {
  id: string
  type: 'tileset'
  name: string
  relativePath: string
  imageId: string | null
  tileWidth: number
  tileHeight: number
  merges: TileSpan[]
}

export type CanvasAsset = MenuAsset | CompositeAsset | SceneAsset

export type ScriptAsset = {
  id: string
  type: 'script'
  name: string
  relativePath: string
  source: string
}

export type CollectionFieldType = 'text' | 'boolean'

export type CollectionField = {
  id: string
  name: string
  type: CollectionFieldType
  presets: string[]
  enforcePresets: boolean
}

export type CollectionEntry = {
  id: string
  values: Record<string, string | boolean>
}

export type CollectionAsset = {
  id: string
  type: 'collection'
  name: string
  relativePath: string
  fields: CollectionField[]
  masterKeyId: string | null
  entries: CollectionEntry[]
}

export type BookPage = {
  id: string
  name: string
  values: Record<string, string | boolean>
  blocks: PageBlock[]
  script: string
}

export type BookChapter = {
  id: string
  name: string
  pages: BookPage[]
}

export type BookAsset = {
  id: string
  type: 'book'
  name: string
  relativePath: string
  fields: PageField[]
  chapters: BookChapter[]
}

export type PageFieldType = 'text' | 'boolean' | 'bookPage' | AssetType

export type PageField = {
  id: string
  name: string
  type: PageFieldType
  default: string | boolean
}

export type Asset = MenuAsset | ButtonAsset | ImageAsset | ScriptAsset | PanelAsset | CollectionAsset | BookAsset | CompositeAsset | SceneAsset | TilesetAsset

export type WorkspaceWindow = {
  assetId: string
  x: number
  y: number
  width: number
  height: number
  z: number
}

export type Workspace = {
  expanded: string[]
  windows: WorkspaceWindow[]
  openMenuIds: string[]
  openCompositeIds: string[]
  openSceneIds: string[]
  openCollectionIds: string[]
  openBookIds: string[]
  openPageTabs: string[]
  openScriptTabs: string[]
  activeTab: string
}

export type ProjectSnapshot = {
  projectDir: string
  meta: ProjectMeta
  folders: string[]
  assets: Asset[]
  workspace: Workspace
  warnings: string[]
}

export type MutationResult = {
  snapshot: ProjectSnapshot
  createdPath?: string
  createdId?: string
}

export type ExportResult = {
  directory: string
  warnings: string[]
}

export type TreeNode = {
  kind: 'folder' | 'asset'
  name: string
  relativePath: string
  assetId?: string
  assetType?: AssetType
  children: TreeNode[]
}

export function isMenu(asset: Asset): asset is MenuAsset {
  return asset.type === 'menu'
}

export function isComposite(asset: Asset): asset is CompositeAsset {
  return asset.type === 'composite'
}

export function isScene(asset: Asset): asset is SceneAsset {
  return asset.type === 'scene'
}

export function isCanvas(asset: Asset): asset is CanvasAsset {
  return asset.type === 'menu' || asset.type === 'composite' || asset.type === 'scene'
}

export function isButton(asset: Asset): asset is ButtonAsset {
  return asset.type === 'button'
}

export function isImage(asset: Asset): asset is ImageAsset {
  return asset.type === 'image'
}

export function isScript(asset: Asset): asset is ScriptAsset {
  return asset.type === 'script'
}

export function isPanel(asset: Asset): asset is PanelAsset {
  return asset.type === 'panel'
}

export function isCollection(asset: Asset): asset is CollectionAsset {
  return asset.type === 'collection'
}

export function isBook(asset: Asset): asset is BookAsset {
  return asset.type === 'book'
}
