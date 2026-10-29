import editorWorker from 'monaco-editor/editor/editor.worker.js?worker'
import { editor, languages } from 'monaco-editor/editor/editor.api.js'
// The API build leaves out the suggestion widget and Enter-to-indent. These imports register them.
import 'monaco-editor/editor/contrib/suggest/browser/suggestController.js'
import 'monaco-editor/editor/contrib/indentation/browser/indentation.js'
import { inputStyleCompletions } from '@shared/inputStyleComplete'
import { scriptSuggestions, type ScriptHints, type Suggestion } from '@shared/scriptSuggest'

export type { ScriptHints }

let hints: ScriptHints = { handles: [], self: 'any' }
let ready = false

export function setScriptHints(next: ScriptHints): void {
  hints = next
}

export function monacoApi(): { editor: typeof editor; languages: typeof languages } {
  ensureMonaco()
  return { editor, languages }
}

function ensureMonaco(): void {
  if (ready) return
  ready = true
  const target = window as Window & { MonacoEnvironment?: { getWorker: () => Worker } }
  target.MonacoEnvironment = {
    getWorker() {
      return new editorWorker()
    }
  }
  editor.defineTheme('peach', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'keyword', foreground: 'e8946a' },
      { token: 'comment', foreground: '7d7268' },
      { token: 'string', foreground: 'e6c27a' },
      { token: 'number', foreground: '8fb573' },
      { token: 'attribute.name', foreground: '8ec8ff' }
    ],
    colors: {
      'editor.background': '#14110f',
      'editor.foreground': '#f6f1ea',
      'editorLineNumber.foreground': '#7d7268',
      'editorCursor.foreground': '#e8946a',
      'editor.selectionBackground': '#3a2a22',
      'editorSuggestWidget.background': '#26211c',
      'editorSuggestWidget.foreground': '#f6f1ea',
      'editorSuggestWidget.border': '#3d342c',
      'editorSuggestWidget.selectedBackground': '#3a2a22',
      'editorSuggestWidget.selectedForeground': '#f6f1ea',
      'editorSuggestWidget.highlightForeground': '#e8946a',
      'editorSuggestWidget.focusHighlightForeground': '#e8946a'
    }
  })
  languages.register({ id: 'lua' })
  languages.setLanguageConfiguration('lua', {
    comments: { lineComment: '--', blockComment: ['--[[', ']]'] },
    wordPattern: /[A-Za-z_][A-Za-z0-9_]*/
  })
  languages.setMonarchTokensProvider('lua', luaTokens)
  registerInputStyleLanguage()
  languages.registerCompletionItemProvider('lua', {
    triggerCharacters: ['.', ':'],
    provideCompletionItems(model, position) {
      const line = model.getLineContent(position.lineNumber)
      const word = model.getWordUntilPosition(position)
      const before = line.slice(0, word.startColumn - 1)
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn
      }
      const source = hints.suggestProperties ? model.getValue() : ''
      return {
        suggestions: scriptSuggestions(before, hints, source).map((item) => toCompletion(item, range))
      }
    }
  })
}

function registerInputStyleLanguage(): void {
  languages.register({ id: 'peach-css' })
  languages.setLanguageConfiguration('peach-css', {
    comments: { blockComment: ['/*', '*/'] },
    brackets: [['{', '}'], ['[', ']'], ['(', ')']],
    autoClosingPairs: [
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: '"', close: '"' },
      { open: "'", close: "'" }
    ],
    surroundingPairs: [
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: '"', close: '"' },
      { open: "'", close: "'" }
    ],
    wordPattern: /(&:[A-Za-z]+|[#.]?[A-Za-z0-9_-]+)/,
    indentationRules: {
      increaseIndentPattern: /\{[^}]*$/,
      decreaseIndentPattern: /^\s*\}/
    },
    onEnterRules: [
      {
        beforeText: /\{\s*$/,
        action: { indentAction: languages.IndentAction.Indent }
      }
    ]
  })
  languages.setMonarchTokensProvider('peach-css', {
    tokenizer: {
      root: [
        [/\/\*/, 'comment', '@comment'],
        [/&:(?:hover|focus|disabled)/, 'keyword'],
        [/"([^"\\]|\\.)*"/, 'string'],
        [/'([^'\\]|\\.)*'/, 'string'],
        [/#[0-9a-fA-F]+\b/, 'number'],
        [/-?\d+(\.\d+)?(px|em|rem|%|vh|vw|ch|ex)?/, 'number'],
        [/[a-zA-Z_-][\w-]*(?=\s*:)/, 'attribute.name'],
        [/[{}()]/, 'delimiter.bracket'],
        [/[;:,]/, 'delimiter']
      ],
      comment: [
        [/\*\//, 'comment', '@pop'],
        [/./, 'comment']
      ]
    }
  })
  languages.registerCompletionItemProvider('peach-css', {
    triggerCharacters: [':', '&', '-'],
    provideCompletionItems(model, position) {
      const before = model.getValue().slice(0, model.getOffsetAt(position))
      const lineAfter = model.getLineContent(position.lineNumber).slice(position.column - 1)
      const word = model.getWordUntilPosition(position)
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn
      }
      return {
        suggestions: inputStyleCompletions(before, lineAfter).map((item) => ({
          label: item.label,
          kind: item.kind === 'property'
            ? languages.CompletionItemKind.Property
            : item.kind === 'value'
              ? languages.CompletionItemKind.Value
              : languages.CompletionItemKind.Snippet,
          insertText: item.insertText,
          detail: item.detail,
          range,
          sortText: `${item.kind === 'block' ? '0' : item.kind === 'property' ? '1' : '2'}${item.label}`,
          insertTextRules: item.snippet ? languages.CompletionItemInsertTextRule.InsertAsSnippet : undefined
        }))
      }
    }
  })
}

function toCompletion(item: Suggestion, range: languages.CompletionItem['range']): languages.CompletionItem {
  return {
    label: item.label,
    kind: completionKind(item.kind),
    insertText: item.insertText,
    detail: item.detail,
    range,
    insertTextRules: item.insertText.includes('$') ? languages.CompletionItemInsertTextRule.InsertAsSnippet : undefined
  }
}

function completionKind(kind: Suggestion['kind']): languages.CompletionItemKind {
  if (kind === 'field') return languages.CompletionItemKind.Field
  if (kind === 'keyword') return languages.CompletionItemKind.Keyword
  if (kind === 'snippet') return languages.CompletionItemKind.Snippet
  return languages.CompletionItemKind.Function
}

const luaTokens: languages.IMonarchLanguage = {
  keywords: ['and', 'break', 'do', 'else', 'elseif', 'end', 'false', 'for', 'function', 'goto', 'if', 'in', 'local', 'nil', 'not', 'or', 'repeat', 'return', 'then', 'true', 'until', 'while'],
  tokenizer: {
    root: [
      [/--\[(=*)\[/, 'comment', '@comment'],
      [/--.*$/, 'comment'],
      [/\[(=*)\[/, 'string', '@longstring'],
      [/"([^"\\]|\\.)*"/, 'string'],
      [/'([^'\\]|\\.)*'/, 'string'],
      [/[a-zA-Z_]\w*/, { cases: { '@keywords': 'keyword', '@default': 'identifier' } }],
      [/\d+(\.\d+)?/, 'number'],
      [/[{}()[\]]/, 'delimiter'],
      [/[=+\-*/%^#<>,.;:~]/, 'delimiter']
    ],
    comment: [
      [/\](=*)\]/, 'comment', '@pop'],
      [/./, 'comment']
    ],
    longstring: [
      [/\](=*)\]/, 'string', '@pop'],
      [/./, 'string']
    ]
  }
}
