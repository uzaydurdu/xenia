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
