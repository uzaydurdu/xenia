defmodule Xenia.ShortcutsTest do
  @moduledoc """
  Tests how a `shortcuts` map is normalized: one written form per
  combination (the JavaScript core matches against exactly that form), the
  refused browser shortcuts, and the errors.
  """

  use ExUnit.Case, async: true

  alias Xenia.Shortcuts

  doctest Shortcuts

  test "modifiers are put in one order, aliases resolved, case and spaces ignored" do
    assert Shortcuts.normalize!(%{
             "Shift + Mod + S" => "save",
             "cmd+option+k" => "palette",
             "Control+Alt+Delete" => "x",
             "ESC" => "close",
             "alt+Up" => "up",
             "mod+shift+." => "bigger"
           }) == %{
             "mod+shift+s" => "save",
             "meta+alt+k" => "palette",
             "ctrl+alt+delete" => "x",
             "escape" => "close",
             "alt+arrowup" => "up",
             "mod+shift+." => "bigger"
           }
  end

  test "atoms work as combinations" do
    assert Shortcuts.normalize!(%{enter: "submit"}) == %{"enter" => "submit"}
  end

  describe "browser shortcuts are refused" do
    for combo <- ~w(mod+= mod+- mod+0 mod+t mod+w mod+n mod+r f5 mod+l alt+arrowleft mod+1 f12) do
      test "#{combo}" do
        assert_raise ArgumentError, ~r/is a browser shortcut/, fn ->
          Shortcuts.normalize!(%{unquote(combo) => "x"}, "ed")
        end
      end
    end

    # ctrl+r is a reload on Windows and Linux, meta+r on a Mac.
    test "also when written with ctrl or meta instead of mod" do
      for combo <- ["ctrl+r", "meta+r", "ctrl+w", "meta+=", "Cmd+L"] do
        assert_raise ArgumentError, ~r/is a browser shortcut/, fn ->
          Shortcuts.normalize!(%{combo => "x"})
        end
      end
    end

    test "app shortcuts that browsers also use are allowed" do
      assert map_size(
               Shortcuts.normalize!(%{
                 "mod+s" => "save",
                 "mod+p" => "palette",
                 "mod+f" => "find",
                 "mod+k" => "k",
                 "ctrl+space" => "suggest"
               })
             ) == 5
    end
  end

  describe "errors" do
    test "an unknown modifier or key" do
      assert_raise ArgumentError, ~r/"hyper" isn't a modifier/, fn ->
        Shortcuts.normalize!(%{"hyper+s" => "x"})
      end

      assert_raise ArgumentError, ~r/"arrow" isn't a key Xenia knows/, fn ->
        Shortcuts.normalize!(%{"mod+arrow" => "x"})
      end
    end

    test "no key, or a repeated modifier" do
      assert_raise ArgumentError, ~r/no key; write \+ as plus/, fn ->
        Shortcuts.normalize!(%{"mod+" => "x"})
      end

      assert_raise ArgumentError, ~r/modifiers but no key/, fn ->
        Shortcuts.normalize!(%{"mod+shift" => "x"})
      end

      assert_raise ArgumentError, ~r/a modifier is repeated/, fn ->
        Shortcuts.normalize!(%{"shift+shift+s" => "x"})
      end
    end

    test "two spellings of one combination" do
      assert_raise ArgumentError, ~r/has the shortcut mod\+shift\+s twice/, fn ->
        Shortcuts.normalize!(%{"mod+shift+s" => "a", "shift+mod+s" => "b"}, "ed")
      end
    end

    test "an event name that isn't a string, or shortcuts that aren't a map" do
      assert_raise ArgumentError, ~r/must name a LiveView event/, fn ->
        Shortcuts.normalize!(%{"mod+s" => :save})
      end

      assert_raise ArgumentError, ~r/must be a map/, fn -> Shortcuts.normalize!(["mod+s"]) end
    end
  end
end
