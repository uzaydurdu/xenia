// The Monaco island: Xenia's built-in Monaco adapter, customized.
// Used by the Monaco example (lib/xenia_examples_web/app/monaco).

import { createMonaco } from "xenia/monaco"

// Monaco runs some features in web workers. esbuild builds them as separate
// files (see config/config.exs); this tells Monaco where they are.
const WORKERS = {
  json: "json", css: "css", scss: "css", less: "css",
  html: "html", handlebars: "html", razor: "html",
  typescript: "ts", javascript: "ts",
}

self.MonacoEnvironment = {
  getWorker: (_id, label) =>
    new Worker(`/assets/js/monaco/${WORKERS[label] ?? "editor"}.worker.js`),
}

// Our own addition: suggest a few Elixir snippets while typing.
// `setup` runs once per editor. What it returns is disposed with the editor.
function elixirSnippets(monaco) {
  return monaco.languages.registerCompletionItemProvider("elixir", {
    provideCompletionItems(model, position) {
      const word = model.getWordUntilPosition(position)
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      }

      const snippet = (label, text) => ({
        label,
        kind: monaco.languages.CompletionItemKind.Snippet,
        insertText: text,
        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
        range,
      })

      return {
        suggestions: [
          snippet("defmodule", "defmodule ${1:Name} do\n  $0\nend"),
          snippet("def", "def ${1:name}(${2:args}) do\n  $0\nend"),
          snippet("IO.inspect", "IO.inspect(${1:value}, label: \"${2:label}\")"),
        ],
      }
    },
  })
}

// The app passes the import, so esbuild finds monaco-editor in our
// assets/node_modules. Monaco loads only on pages that use it.
export const monaco = createMonaco({
  load: () => import("monaco-editor"),
  setup: (monaco) => elixirSnippets(monaco),
})

// The same editor, read-only while its LiveView is disconnected: what you
// type then would be lost, because LiveView drops events it can't send.
// Used by the connection example (lib/xenia_examples_web/app/connection).
// Xenia gives each island that consumes "connection" its own LiveView's
// state, "connected" or "disconnected", as an ordinary prop.
const readOnlyWhileOffline = (editor, connection) =>
  editor.applyOptions({ readOnly: connection === "disconnected" })

export const offlineMonaco = {
  ...monaco,
  consumes: [...monaco.consumes, "connection"],
  // A mount can happen while disconnected (a lazy island scrolled into
  // view), so the mount value counts too, not only later changes.
  mount(el, props, ctx) {
    const editor = monaco.mount(el, props, ctx)
    if (props.connection === "disconnected") readOnlyWhileOffline(editor, props.connection)
    return editor
  },
  props: { ...monaco.props, connection: readOnlyWhileOffline },
}
