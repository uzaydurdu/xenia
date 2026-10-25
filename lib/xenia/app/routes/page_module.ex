defmodule Xenia.Routes.PageModule do
  @moduledoc """
  Finds the module a `page.ex` defines, without running the file.

  The source is parsed with `Code.string_to_quoted!/2` and its top-level
  `defmodule` is read from the syntax tree. Nothing is evaluated, so a page
  file can't run code at router compile time, and the router doesn't depend
  on the page being compiled first.

  A page file must contain exactly one top-level `defmodule` with a literal
  name. Modules nested inside it are fine.
  """

  @doc """
  Reads `file` and returns the module it defines.

  Raises `ArgumentError` when the file has no top-level module, more than
  one, or a name that isn't a literal alias. Syntax errors raise as usual.
  """
  @spec resolve!(Path.t()) :: module()
  def resolve!(file) do
    file
    |> File.read!()
    |> from_source!(file)
  end

  @doc """
  Like `resolve!/1`, for source code already in memory. `file` is only used
  in error messages.

      iex> Xenia.Routes.PageModule.from_source!("defmodule MyAppWeb.HomePage do end")
      MyAppWeb.HomePage
  """
  @spec from_source!(String.t(), String.t()) :: module()
  def from_source!(source, file \\ "nofile") do
    modules =
      source
      |> Code.string_to_quoted!(file: file)
      |> top_level()
      |> Enum.filter(&match?({:defmodule, _, [_name, _body]}, &1))

    case modules do
      [{:defmodule, _, [name, _body]}] ->
        module_name!(name, file)

      [] ->
        raise ArgumentError, "#{file}: a page file must define a module with defmodule"

      many ->
        names =
          Enum.map_join(many, ", ", fn {:defmodule, _, [name, _]} -> Macro.to_string(name) end)

        raise ArgumentError,
              "#{file}: a page file must define exactly one top-level module, found: #{names}"
    end
  end

  @doc """
  True when `file` contains `use <module>, ...` with `key` among the
  options, read from the syntax tree without running the file.

      iex> source = "defmodule L do\\n  use Xenia.Layout, on_mount: Auth\\nend"
      iex> Xenia.Routes.PageModule.uses_option?(source, Xenia.Layout, :on_mount, "nofile")
      true
  """
  @spec uses_option?(String.t(), module(), atom(), String.t()) :: boolean()
  def uses_option?(source, module, key, file \\ "nofile") do
    parts = Module.split(module) |> Enum.map(&String.to_atom/1)

    {_ast, found?} =
      source
      |> Code.string_to_quoted!(file: file)
      |> Macro.prewalk(false, fn
        {:use, _, [{:__aliases__, _, ^parts}, opts]} = node, acc when is_list(opts) ->
          {node, acc or Keyword.has_key?(opts, key)}

        node, acc ->
          {node, acc}
      end)

    found?
  end

  defp top_level({:__block__, _, expressions}), do: expressions
  defp top_level(expression), do: [expression]

  defp module_name!({:__aliases__, _, parts} = name, file) do
    if Enum.all?(parts, &is_atom/1) do
      Module.concat(parts)
    else
      literal_name!(name, file)
    end
  end

  defp module_name!(name, _file) when is_atom(name) and name not in [nil, true, false], do: name

  defp module_name!(name, file), do: literal_name!(name, file)

  defp literal_name!(name, file) do
    raise ArgumentError,
          "#{file}: the page module needs a literal name like MyAppWeb.HomePage, " <>
            "got: #{Macro.to_string(name)}"
  end
end
