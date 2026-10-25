defmodule Xenia.Routes.Discovery do
  @moduledoc """
  Turns paths in the app directory into routes. Pure: paths in, structs out.
  Only `scan/1` reads the filesystem.

  Folder names follow the Next.js App Router:

    * `runbooks`   a static URL segment
    * `(auth)`     a route group: groups pages and layouts, adds nothing to
                   the URL. It grants nothing by itself; authentication stays
                   in Phoenix pipelines and `live_session`.
    * `[id]`       a dynamic segment, `:id`
    * `[...path]`  a catch-all segment, `*path`; must be the last folder
    * `_name`      a private folder: never routed, for colocated components

  Four special files:

    * `page.ex`       makes its folder a route: the UI for that URL
    * `layout.ex`     frames every page in its folder and below, outermost
                      first
    * `persistent.ex` optional; the persistent part of the `layout.ex` in the
                      same folder: a LiveView that stays alive while the user
                      moves between that layout's pages. Requires the
                      `layout.ex`, whose frame places it.
    * `live.ex`       optional; one LiveView owns every page in its folder and
                      below, so switching between them is a patch that keeps
                      the process and its state. The nearest `live.ex` wins,
                      so a nested one starts a new owner. Pages without one
                      are their own LiveView.
  """

  alias Xenia.Routes.Page

  @page "page.ex"
  @layout "layout.ex"
  @persistent "persistent.ex"
  @live "live.ex"

  @static ~r/\A[A-Za-z0-9._~-]+\z/
  @name ~r/\A[a-z_][a-z0-9_]*\z/
  @group ~r/\A\(([a-z0-9_-]+)\)\z/

  # ---------------------------------------------------------------------------
  # Public API
  # ---------------------------------------------------------------------------

  @doc """
  The page at `file`, given the app's `layout.ex`, `persistent.ex` and
  `live.ex` files (all relative paths). Other files in the list are ignored.

      iex> Xenia.Routes.Discovery.page("(auth)/runbooks/[id]/page.ex", [
      ...>   "layout.ex",
      ...>   "(auth)/layout.ex",
      ...>   "(auth)/persistent.ex"
      ...> ])
      %Xenia.Routes.Page{
        file: "(auth)/runbooks/[id]/page.ex",
        path: "/runbooks/:id",
        params: ["id"],
        groups: ["auth"],
        layouts: ["layout.ex", "(auth)/layout.ex"],
        persistent: %{"(auth)/layout.ex" => "(auth)/persistent.ex"},
        live: nil
      }

  Raises `ArgumentError` for a file that isn't a `page.ex` and for invalid
  folder names.
  """
  @spec page(String.t(), [String.t()]) :: Page.t()
  def page(file, files) do
    file = normalize(file)

    unless Path.basename(file) == @page do
      raise ArgumentError, "expected a #{@page} file, got: #{inspect(file)}"
    end

    dirs = dirs(file)
    files = MapSet.new(files, &normalize/1)
    segments = Enum.map(dirs, &parse!(&1, file))
    check_segments!(segments, file)
    layouts = ancestors(dirs, @layout, files)

    %Page{
      file: file,
      path: to_path(segments),
      params: for({kind, name} when kind in [:param, :glob] <- segments, do: name),
      groups: for({:group, name} <- segments, do: name),
      layouts: layouts,
      persistent: persistent(layouts, files),
      live: dirs |> ancestors(@live, files) |> List.last()
    }
  end

  @doc """
  All pages in a list of relative paths, in the order Phoenix should match
  them: static segments before dynamic ones, catch-alls last.

  Other files, and anything inside a private `_folder`, are ignored.
  Raises `ArgumentError` when two pages resolve to the same path, when
  a `live.ex` owns no page, and when a `persistent.ex` has no `layout.ex`
  next to it.

  With `check_owners: false`, a `live.ex` that owns no page yet is allowed:
  the generators use it, because an unfinished folder isn't the new file's
  problem.
  """
  @spec pages([String.t()], keyword()) :: [Page.t()]
  def pages(files, opts \\ []) do
    files = files |> Enum.map(&normalize/1) |> Enum.reject(&private?/1)
    special = Enum.filter(files, &(Path.basename(&1) in [@layout, @persistent, @live]))
    check_persistent!(special)

    files
    |> Enum.filter(&(Path.basename(&1) == @page))
    |> Enum.map(&page(&1, special))
    |> check_conflicts!()
    |> then(&if(Keyword.get(opts, :check_owners, true), do: check_owners!(&1, special), else: &1))
    |> Enum.sort_by(&sort_key/1)
  end

  @doc """
  Reads the app folder at `root` and returns its pages, see `pages/1`.
  Paths in the result are relative to `root`.
  """
  @spec scan(Path.t()) :: [Page.t()]
  def scan(root), do: root |> files() |> pages()

  @doc """
  Every `page.ex`, `layout.ex`, `persistent.ex` and `live.ex` under `root`,
  relative to it and sorted.
  Hidden folders are skipped. `Xenia.Routes` compares this list between
  compilations to notice added and removed pages.
  """
  @spec files(Path.t()) :: [String.t()]
  def files(root) do
    root = Path.expand(root)

    unless File.dir?(root) do
      raise ArgumentError, "Xenia app folder not found: #{root}"
    end

    root |> walk(root) |> Enum.sort()
  end

  # ---------------------------------------------------------------------------
  # Segments
  # ---------------------------------------------------------------------------

  defp parse!("(" <> _ = dir, file) do
    case Regex.run(@group, dir) do
      [_, name] -> {:group, name}
      nil -> invalid!(file, dir, "a route group is a lowercase name in parentheses, like (auth)")
    end
  end

  # Phoenix's `*path` also matches the URL without the extra parts (with an
  # empty list), so a catch-all is already optional.
  defp parse!("[[..." <> _ = dir, file) do
    invalid!(
      file,
      dir,
      "write it as #{String.slice(dir, 1..-2//1)}: a catch-all already matches the URL " <>
        "without the extra parts, with an empty list"
    )
  end

  defp parse!("[[" <> _ = dir, file) do
    invalid!(
      file,
      dir,
      "optional segments are not supported: put a page.ex in the folder above for the URL without it"
    )
  end

  defp parse!("[..." <> rest = dir, file), do: {:glob, param!(rest, dir, file)}
  defp parse!("[" <> rest = dir, file), do: {:param, param!(rest, dir, file)}

  defp parse!(dir, file) do
    if Regex.match?(@static, dir) do
      {:static, dir}
    else
      invalid!(file, dir, "use letters, digits, '.', '_', '~' or '-'")
    end
  end

  defp param!(rest, dir, file) do
    name = String.trim_trailing(rest, "]")

    unless String.ends_with?(rest, "]") and Regex.match?(@name, name) do
      invalid!(file, dir, "a parameter is a lowercase name in brackets, like [id]")
    end

    name
  end

  defp check_segments!(segments, file) do
    routed = Enum.reject(segments, &match?({:group, _}, &1))

    case Enum.find_index(routed, &match?({:glob, _}, &1)) do
      nil -> :ok
      index when index == length(routed) - 1 -> :ok
      _ -> raise ArgumentError, "#{file}: a catch-all segment must be the last folder"
    end

    names = for {kind, name} when kind in [:param, :glob] <- routed, do: name

    case names -- Enum.uniq(names) do
      [] -> :ok
      [name | _] -> raise ArgumentError, "#{file}: parameter #{inspect(name)} is used twice"
    end
  end

  defp to_path(segments) do
    segments
    |> Enum.flat_map(fn
      {:group, _} -> []
      {:static, name} -> [name]
      {:param, name} -> [":" <> name]
      {:glob, name} -> ["*" <> name]
    end)
    |> then(&("/" <> Enum.join(&1, "/")))
  end

  defp invalid!(file, dir, hint) do
    raise ArgumentError, "#{file}: invalid folder name #{inspect(dir)}: #{hint}"
  end

  # ---------------------------------------------------------------------------
  # Layouts
  # ---------------------------------------------------------------------------

  # `name` at the root, then in each folder down to the page's own, keeping
  # the ones that exist.
  defp ancestors(dirs, name, files) do
    for count <- 0..length(dirs),
        file = Path.join(Enum.take(dirs, count) ++ [name]),
        MapSet.member?(files, file),
        do: file
  end

  # Each layout's persistent part: the persistent.ex in its folder, if any.
  defp persistent(layouts, files) do
    for layout <- layouts,
        file = sibling(layout, @persistent),
        MapSet.member?(files, file),
        into: %{},
        do: {layout, file}
  end

  # A persistent part is placed by its layout's frame ({@persistent}), so
  # without a layout.ex in the same folder it would never be rendered.
  defp check_persistent!(files) do
    present = MapSet.new(files)

    for file <- Enum.sort(files),
        Path.basename(file) == @persistent,
        not MapSet.member?(present, sibling(file, @layout)) do
      raise ArgumentError,
            "#{file} has no layout.ex next to it. A persistent part belongs to the " <>
              "layout in its folder, whose frame places it with {@persistent}: add " <>
              "#{sibling(file, @layout)}, or move #{@persistent} next to an existing layout.ex."
    end

    :ok
  end

  defp sibling(file, name), do: Path.join(dirs(file) ++ [name])

  # ---------------------------------------------------------------------------
  # Conflicts and ordering
  # ---------------------------------------------------------------------------

  # "/runbooks/:id" and "/runbooks/:slug" match the same URLs, so parameter
  # names are ignored when comparing.
  defp check_conflicts!(pages) do
    for {_shape, [_, _ | _] = same} <- Enum.group_by(pages, &shape/1) do
      files = same |> Enum.map(& &1.file) |> Enum.sort() |> Enum.join(", ")
      raise ArgumentError, "these pages resolve to the same path: #{files}"
    end

    pages
  end

  # A live.ex with no page beneath it (or only pages owned by a nested
  # live.ex) would never run: almost always a misplaced file.
  defp check_owners!(pages, files) do
    used = MapSet.new(pages, & &1.live)

    for file <- Enum.sort(files), Path.basename(file) == @live, not MapSet.member?(used, file) do
      raise ArgumentError, "#{file} owns no pages: put page.ex files in its folder or below"
    end

    pages
  end

  defp shape(%Page{path: path}) do
    for segment <- String.split(path, "/", trim: true) do
      case segment do
        ":" <> _ -> ":"
        "*" <> _ -> "*"
        static -> static
      end
    end
  end

  # Phoenix uses the first matching route, so static segments come before
  # dynamic ones and catch-alls last. The path breaks ties.
  defp sort_key(%Page{path: path}) do
    ranks =
      for segment <- String.split(path, "/", trim: true) do
        case segment do
          ":" <> name -> {1, name}
          "*" <> name -> {2, name}
          static -> {0, static}
        end
      end

    {ranks, path}
  end

  # ---------------------------------------------------------------------------
  # Files
  # ---------------------------------------------------------------------------

  defp dirs(file), do: file |> Path.split() |> Enum.drop(-1)

  defp private?(file), do: file |> dirs() |> Enum.any?(&String.starts_with?(&1, "_"))

  defp normalize(file), do: file |> Path.split() |> Enum.reject(&(&1 == ".")) |> Path.join()

  # Path.wildcard/1 reads [ ] in a root like "tmp/[x]/app" as pattern syntax,
  # so the tree is walked directly. Hidden folders are skipped.
  defp walk(dir, root) do
    dir
    |> File.ls!()
    |> Enum.sort()
    |> Enum.flat_map(fn name ->
      path = Path.join(dir, name)

      cond do
        String.starts_with?(name, ".") -> []
        File.dir?(path) -> walk(path, root)
        name in [@page, @layout, @persistent, @live] -> [Path.relative_to(path, root)]
        true -> []
      end
    end)
  end
end
