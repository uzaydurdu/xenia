defmodule Xenia.Shortcuts do
  @moduledoc """
  Keyboard shortcuts for a JS island, handled in your LiveView.

      <.monaco id="editor" shortcuts={%{"mod+s" => "save", "mod+shift+." => "bigger"}} />

      def handle_event("save", %{"shortcut" => "mod+s"}, socket), do: ...

  Every Xenia component takes `shortcuts`: a map from a key combination to
  the LiveView event it sends. Xenia listens only **while focus is inside the
  component**, so the same keys do their usual thing everywhere else on the
  page. A matched combination is handled before the JavaScript library sees
  it, and the browser doesn't act on it either.

  Before the shortcut's event, the component's pending events are sent. So
  `mod+s` right after typing saves what was typed.

  ## Writing a combination

  Modifiers, then one key, joined with `+`:

    * `mod` is Cmd on a Mac and Ctrl elsewhere. Use it for the usual app
      shortcuts: `mod+s`, `mod+k`.
    * `ctrl`, `alt`, `shift` and `meta` mean those keys exactly. `cmd` is
      `meta`, `option` is `alt`.
    * The key is a letter, a digit, a symbol such as `.` or `/`, or a name:
      `enter`, `escape`, `tab`, `space`, `backspace`, `delete`, `home`, `end`,
      `pageup`, `pagedown`, `arrowup`, `arrowdown`, `arrowleft`, `arrowright`,
      `f1` to `f12`, and `plus` for `+`.
    * With `shift`, write the key itself, not what Shift makes of it:
      `mod+shift+.`, not `mod+>`.

  Case and spaces don't matter: `"Mod + Shift + S"` is `"mod+shift+s"`.

  ## Browser shortcuts are not available

  Xenia doesn't take over the shortcuts people use to control the browser
  and their computer. Using one raises an error:

    * zoom: `mod+=`, `mod+-`, `mod+0`, `mod+plus`
    * tabs and windows: `mod+t`, `mod+n`, `mod+w`, `mod+q`, `mod+1` to
      `mod+9`, `ctrl+tab`, `ctrl+pageup`, `ctrl+pagedown`
    * reloading: `mod+r`, `f5`
    * the address bar: `mod+l`, `alt+d`, `f6`
    * back and forward: `alt+arrowleft`, `alt+arrowright`, `mod+[`, `mod+]`
    * full screen and developer tools: `f11`, `f12`, `mod+alt+i`,
      `mod+shift+i`
    * downloads and history: `mod+j`, `mod+h`, `mod+shift+delete`

  The full list is `reserved/0`.
  """

  @modifiers %{
    "mod" => "mod",
    "ctrl" => "ctrl",
    "control" => "ctrl",
    "alt" => "alt",
    "option" => "alt",
    "opt" => "alt",
    "shift" => "shift",
    "meta" => "meta",
    "cmd" => "meta",
    "command" => "meta"
  }

  # The order modifiers are written in, so every spelling has one form.
  @modifier_order ~w(mod ctrl meta alt shift)

  @named_keys ~w(enter escape tab space backspace delete insert home end pageup pagedown
                 arrowup arrowdown arrowleft arrowright plus) ++
                Enum.map(1..12, &"f#{&1}")

  @key_aliases %{
    "esc" => "escape",
    "return" => "enter",
    "up" => "arrowup",
    "down" => "arrowdown",
    "left" => "arrowleft",
    "right" => "arrowright",
    "del" => "delete"
  }

  @reserved Enum.flat_map(
              [
                # zoom
                ~w(mod+= mod+shift+= mod+plus mod+shift+plus mod+- mod+shift+- mod+0),
                # tabs and windows
                ~w(mod+t mod+shift+t mod+n mod+shift+n mod+w mod+shift+w mod+q
                   ctrl+tab ctrl+shift+tab ctrl+pageup ctrl+pagedown
                   mod+alt+arrowleft mod+alt+arrowright mod+shift+[ mod+shift+]),
                Enum.map(1..9, &"mod+#{&1}"),
                # reloading
                ~w(mod+r mod+shift+r f5 mod+f5 shift+f5),
                # the address bar
                ~w(mod+l alt+d f6),
                # back and forward
                ~w(alt+arrowleft alt+arrowright mod+[ mod+]),
                # full screen and developer tools
                ~w(f11 f12 mod+ctrl+f mod+alt+i mod+shift+i mod+alt+j mod+shift+j
                   mod+alt+c mod+shift+c),
                # downloads, history, and the operating system
                ~w(mod+j mod+h mod+m mod+shift+delete alt+tab alt+f4 mod+alt+escape)
              ],
              & &1
            )

  @doc "The browser and system shortcuts Xenia refuses, as written in `shortcuts`."
  @spec reserved() :: [String.t()]
  def reserved, do: @reserved

  @doc """
  Normalizes a `shortcuts` map: each combination in its one written form,
  each event name checked.

      iex> Xenia.Shortcuts.normalize!(%{"Shift + Mod + S" => "save"})
      %{"mod+shift+s" => "save"}

  Raises `ArgumentError` for an invalid combination, a browser shortcut, two
  spellings of one combination, or an event name that isn't a string. `id`
  names the component in the message.
  """
  @spec normalize!(map(), String.t() | nil) :: %{String.t() => String.t()}
  def normalize!(shortcuts, id \\ nil)

  def normalize!(shortcuts, id) when is_map(shortcuts) do
    Enum.reduce(shortcuts, %{}, fn {combo, event}, acc ->
      key = combo!(combo, id)

      unless is_binary(event) and String.trim(event) != "" do
        raise ArgumentError,
              "[Xenia] shortcut #{inspect(combo)} for component #{inspect(id)} must name " <>
                "a LiveView event, got: #{inspect(event)}"
      end

      if Map.has_key?(acc, key) do
        raise ArgumentError,
              "[Xenia] component #{inspect(id)} has the shortcut #{key} twice"
      end

      Map.put(acc, key, event)
    end)
  end

  def normalize!(other, id) do
    raise ArgumentError,
          "[Xenia] shortcuts for component #{inspect(id)} must be a map like " <>
            ~s|%{"mod+s" => "save"}, got: #{inspect(other)}|
  end

  # "Shift + Mod + S" → "mod+shift+s", or an error explaining what's wrong.
  defp combo!(combo, id) when is_binary(combo) or is_atom(combo) do
    parts =
      combo
      |> to_string()
      |> String.downcase()
      |> String.replace(" ", "")
      |> String.split("+")

    {modifiers, [key]} = Enum.split(parts, -1)

    modifiers =
      Enum.map(modifiers, fn modifier ->
        Map.get(@modifiers, modifier) ||
          invalid!(combo, id, "#{inspect(modifier)} isn't a modifier")
      end)

    if modifiers != Enum.uniq(modifiers), do: invalid!(combo, id, "a modifier is repeated")

    key = key!(key, combo, id)
    normalized = Enum.join(Enum.sort_by(modifiers, &order/1) ++ [key], "+")

    if reserved?(normalized) do
      raise ArgumentError,
            "[Xenia] #{inspect(combo)} on component #{inspect(id)} is a browser shortcut. " <>
              "Xenia doesn't take over shortcuts people use to control the browser " <>
              "(zoom, tabs, reloading, back and forward). Pick another combination; " <>
              "see Xenia.Shortcuts.reserved/0."
    end

    normalized
  end

  defp combo!(combo, id), do: invalid!(combo, id, "it must be a string like \"mod+s\"")

  defp key!("", combo, id), do: invalid!(combo, id, "it has no key; write + as plus")

  defp key!(key, combo, id) do
    key = Map.get(@key_aliases, key, key)

    cond do
      key in @named_keys -> key
      String.length(key) == 1 -> key
      key in Map.keys(@modifiers) -> invalid!(combo, id, "it has modifiers but no key")
      true -> invalid!(combo, id, "#{inspect(key)} isn't a key Xenia knows")
    end
  end

  defp order(modifier), do: Enum.find_index(@modifier_order, &(&1 == modifier))

  # Reserved as written, or with ctrl/meta in place of mod: "ctrl+r" and
  # "meta+r" are reloads too, on one platform or the other.
  defp reserved?(combo) do
    variants =
      for from <- ["ctrl", "meta"], do: combo |> String.split("+") |> rewrite(from)

    Enum.any?([combo | variants], &(&1 in @reserved))
  end

  defp rewrite(parts, from) do
    {modifiers, [key]} = Enum.split(parts, -1)
    modifiers = Enum.map(modifiers, &if(&1 == from, do: "mod", else: &1))
    Enum.join(Enum.sort_by(Enum.uniq(modifiers), &order/1) ++ [key], "+")
  end

  defp invalid!(combo, id, reason) do
    raise ArgumentError,
          "[Xenia] invalid shortcut #{inspect(combo)} on component #{inspect(id)}: #{reason}"
  end
end
