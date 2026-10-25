# Used by "mix format"

# The Xenia.Components DSL reads like Phoenix's `attr`, and `xenia_routes`
# like the router's `live`: no parentheses. Exported so apps that add
# `import_deps: [:xenia]` format them the same way.
locals_without_parens = [component: 3, prop: 2, prop: 3, event: 1, xenia_routes: 1]

[
  inputs: ["{mix,.formatter}.exs", "{config,lib,test}/**/*.{ex,exs}"],
  locals_without_parens: locals_without_parens,
  export: [locals_without_parens: locals_without_parens]
]
