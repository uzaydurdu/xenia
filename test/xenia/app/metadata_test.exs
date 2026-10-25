defmodule Xenia.MetadataTest do
  @moduledoc """
  Tests `Xenia.Metadata`: merging layouts' and pages' `metadata/1`, the
  title template, the tags rendered into `<head>`, and when a page's
  metadata is assigned (after mount, or after its own handle_params).
  """

  use ExUnit.Case, async: true

  import Phoenix.Component, only: [sigil_H: 2]
  import Phoenix.LiveViewTest, only: [rendered_to_string: 1]

  alias Phoenix.LiveView.Socket
  alias Xenia.Metadata

  defmodule Root do
    use Xenia.Layout

    def frame(assigns), do: ~H"{@inner_content}"

    def metadata(_assigns) do
      %{
        title: "Acme",
        title_template: "%s · Acme",
        description: "Acme makes rockets.",
        open_graph: %{site_name: "Acme", type: "website"}
      }
    end
  end

  defmodule Blog do
    use Xenia.Layout

    def frame(assigns), do: ~H"{@inner_content}"

    def metadata(_assigns),
      do: %{title_template: "%s · Acme blog", open_graph: %{type: "article"}}
  end

  defmodule Plain do
    use Xenia.Layout
    def frame(assigns), do: ~H"{@inner_content}"
  end

  defmodule PostPage do
    def metadata(assigns), do: %{title: assigns.post.title, description: assigns.post.summary}
  end

  defmodule UntitledPage do
    def metadata(_assigns), do: %{robots: "noindex"}
  end

  defmodule PlainTitledPage do
  end

  defmodule TypoPage do
    def metadata(_assigns), do: %{titel: "Oops"}
  end

  @post %{post: %{title: "Hello", summary: "Our first post."}}

  describe "resolve/3" do
    test "layouts merge outermost first, the page wins, and the nearest template wraps its title" do
      assert Metadata.resolve([Root, Blog], PostPage, @post) == %{
               title: "Hello · Acme blog",
               description: "Our first post.",
               open_graph: %{site_name: "Acme", type: "article"}
             }
    end

    test "a page without a title gets its layouts' title as it is, not templated" do
      assert %{title: "Acme", robots: "noindex"} =
               Metadata.resolve([Root], UntitledPage, %{})
    end

    test "modules without metadata/1 are skipped; none at all gives nil" do
      assert Metadata.resolve([Plain], PostPage, @post).title == "Hello"
      assert Metadata.resolve([Plain], nil, %{}) == nil
      assert Metadata.resolve([], Plain, %{}) == nil
    end

    test "an unknown key raises, naming the module and the known keys" do
      assert_raise ArgumentError, ~r/TypoPage.metadata\/1 returned unknown keys \[:titel\]/, fn ->
        Metadata.resolve([], TypoPage, %{})
      end
    end
  end

  describe "tags/1" do
    test "renders description, canonical, robots, og: and twitter: tags" do
      assigns = %{
        metadata: %{
          title: "Hello · Acme",
          description: "Our first post.",
          canonical: "https://acme.test/posts/hello",
          robots: "noindex",
          open_graph: %{type: "article", image: "https://acme.test/hello.png"},
          twitter: %{card: "summary_large_image"}
        }
      }

      html = rendered_to_string(~H"<Metadata.tags metadata={@metadata} />")

      assert html =~ ~s(<meta name="description" content="Our first post.">)
      assert html =~ ~s(<link rel="canonical" href="https://acme.test/posts/hello">)
      assert html =~ ~s(<meta name="robots" content="noindex">)
      # og:title and og:description default to the page's own.
      assert html =~ ~s(<meta property="og:title" content="Hello · Acme">)
      assert html =~ ~s(<meta property="og:description" content="Our first post.">)
      assert html =~ ~s(<meta property="og:type" content="article">)
      assert html =~ ~s(<meta property="og:image" content="https://acme.test/hello.png">)
      assert html =~ ~s(<meta name="twitter:card" content="summary_large_image">)
    end

    test "renders nothing without metadata, and no og: tags without open_graph" do
      assigns = %{}
      assert rendered_to_string(~H"<Metadata.tags metadata={nil} />") |> String.trim() == ""

      html = rendered_to_string(~H|<Metadata.tags metadata={%{title: "A", description: "B"}} />|)
      refute html =~ "og:"
    end
  end

  # A router record like the one xenia_routes generates.
  defmodule Router do
    def __xenia_page__(Xenia.MetadataTest.StandalonePage), do: %{layouts: [Root]}
    def __xenia_page__(Xenia.MetadataTest.LoadsInParamsPage), do: %{layouts: [Root]}
    def __xenia_page__(Xenia.MetadataTest.PostPage), do: %{layouts: [Root, Blog]}
    def __xenia_page__(Xenia.MetadataTest.PlainTitledPage), do: %{layouts: [Root]}
    def __xenia_page__(_other), do: nil
  end

  defmodule StandalonePage do
    use Phoenix.LiveView
    use Xenia.Page

    def mount(_params, _session, socket), do: {:ok, socket}
    def render(assigns), do: ~H"<p>page</p>"
    def metadata(_assigns), do: %{title: "Standalone"}
  end

  defmodule LoadsInParamsPage do
    use Phoenix.LiveView
    use Xenia.Page

    def mount(_params, _session, socket), do: {:ok, socket}

    # The title needs data loaded here, after every hook.
    def handle_params(%{"slug" => slug}, _uri, socket),
      do: {:noreply, Phoenix.Component.assign(socket, :post, %{title: slug})}

    def render(assigns), do: ~H"<p>{@post.title}</p>"
    def metadata(assigns), do: %{title: assigns.post.title}
  end

  # LiveView sets private.lifecycle on every mounted socket; attach_hook needs it.
  defp socket(view, assigns \\ %{}) do
    %Socket{
      router: Router,
      view: view,
      assigns: Map.merge(%{__changed__: %{}}, assigns),
      private: %{live_temp: %{}, lifecycle: %Phoenix.LiveView.Lifecycle{}}
    }
  end

  describe "assigning a page's metadata" do
    test "a page without handle_params gets it from a hook, after mount" do
      socket = socket(StandalonePage)

      assert {:cont, socket} = Xenia.Page.on_mount(:metadata, %{}, %{}, socket)
      assert [%{id: :xenia_metadata}] = socket.private.lifecycle.handle_params

      socket = Metadata.__assign__(socket)
      assert socket.assigns.page_title == "Standalone · Acme"
      assert socket.assigns.xenia_metadata.description == "Acme makes rockets."
    end

    test "a page with handle_params gets it right after its own, which may load the data" do
      assert function_exported?(LoadsInParamsPage, :__xenia_metadata__, 0)

      # No hook: it would run before handle_params, without @post.
      assert {:cont, socket} =
               Xenia.Page.on_mount(:metadata, %{}, %{}, socket(LoadsInParamsPage))

      assert socket.private.lifecycle.handle_params == []

      {:noreply, socket} = LoadsInParamsPage.handle_params(%{"slug" => "Hello"}, "/", socket)
      assert socket.assigns.page_title == "Hello · Acme"
    end

    test "under a live.ex, the page is the live action" do
      socket = socket(SomeOwnerLive, %{live_action: PostPage, post: @post.post})

      assert Metadata.__assign__(socket).assigns.page_title == "Hello · Acme blog"
    end

    test "without a router (live_isolated in tests), nothing is attached" do
      socket = %Socket{router: nil, view: StandalonePage, assigns: %{__changed__: %{}}}
      assert {:cont, ^socket} = Xenia.Page.on_mount(:metadata, %{}, %{}, socket)
    end

    test "a page that assigns page_title keeps it over a layout's default title" do
      socket = socket(PlainTitledPage, %{page_title: "Chart"})
      socket = Metadata.__assign__(socket)

      assert socket.assigns.page_title == "Chart"
      assert socket.assigns.xenia_metadata.title == "Chart", "og:title follows it"
      assert socket.assigns.xenia_metadata.description == "Acme makes rockets."
    end

    test "a page without any title gets the layout's default" do
      socket = Metadata.__assign__(socket(PlainTitledPage))
      assert socket.assigns.page_title == "Acme"
    end

    test "a page whose metadata has no title keeps its own page_title" do
      socket = socket(UntitledPage, %{page_title: "Mine"})
      socket = %{socket | router: __MODULE__.UntitledRouter}

      assert Metadata.__assign__(socket).assigns.page_title == "Mine"
    end
  end

  defmodule UntitledRouter do
    def __xenia_page__(Xenia.MetadataTest.UntitledPage), do: %{layouts: []}
    def __xenia_page__(_other), do: nil
  end
end
