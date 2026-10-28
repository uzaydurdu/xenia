defmodule XeniaExamplesWeb.App.Examples do
  @moduledoc """
  The examples, in groups, for the sidebar and the home page.

  It lives in `_shared`: a folder whose name starts with `_` is never a
  route, so it's a good place for code that pages share.
  """
  use XeniaExamplesWeb, :verified_routes

  @doc "The groups, in order: `{title, intro, examples}`."
  def groups do
    [
      {"Basics", "Short adapters written by hand: how Xenia works.", basics()},
      {"Pages from folders", "Routes and layouts from your folders, instead of a router file.",
       routing()},
      {"Icons, messages and languages",
       "Everyday Phoenix: ready-made icons, success and error messages, English and German.",
       everyday()},
      {"Official adapters", "Ready-made adapters you configure and extend, without copying them.",
       adapters()},
      {"Forms", "JavaScript components as fields of a Phoenix form.", forms()}
    ]
  end

  @doc "Every example, in the order of the groups."
  def all, do: Enum.flat_map(groups(), fn {_title, _intro, examples} -> examples end)

  defp basics do
    [
      %{
        path: ~p"/chart",
        title: "Chart",
        summary: "How a page and an island talk: props, events and commands. With Chart.js."
      },
      %{
        path: ~p"/date-picker",
        title: "Date picker",
        summary: "A JavaScript component as a form field. With flatpickr."
      },
      %{
        path: ~p"/rating",
        title: "Rating",
        summary: "A web component (Shoelace), with no prop code at all."
      },
      %{
        path: ~p"/theme",
        title: "Theme",
        summary: "Islands that follow the app's light and dark mode."
      },
      %{
        path: ~p"/loading",
        title: "Loading and errors",
        summary: "What an island shows while it loads, and when it breaks. With a retry."
      },
      %{
        path: ~p"/colocated",
        title: "Island in a page",
        summary: "An adapter that lives inside the page that uses it."
      },
      %{
        path: ~p"/two-editors",
        title: "Two editors",
        summary: "Two islands of one kind: each with its own events and commands."
      },
      %{
        path: ~p"/tabs/first",
        # Both tab pages count as this example in the sidebar.
        match: "/tabs/",
        title: "Tabs",
        summary: "Two pages that share one LiveView and its state."
      }
    ]
  end

  defp adapters do
    [
      %{
        path: ~p"/adapters/chartjs",
        title: "Chart.js",
        summary: "Every chart type; used, configured and extended."
      },
      %{path: ~p"/adapters/d3", title: "D3", summary: "Bar, line and pie charts drawn with D3."},
      %{
        path: ~p"/adapters/monaco",
        title: "Code editor",
        summary: "Monaco, with our own theme, snippets and keyboard shortcuts."
      },
      %{
        path: ~p"/adapters/monaco-diff",
        title: "Diff editor",
        summary: "Monaco's side-by-side diff, with the changes reported."
      },
      %{
        path: ~p"/adapters/tiptap",
        title: "Rich text",
        summary: "A rich-text editor with a toolbar (Tiptap)."
      },
      %{
        path: ~p"/adapters/flatpickr",
        title: "Date range",
        summary: "A date range picker (flatpickr)."
      },
      %{
        path: ~p"/adapters/tom-select",
        title: "Tag picker",
        summary: "A searchable multi-select that creates tags (Tom Select)."
      },
      %{
        path: ~p"/adapters/shoelace-rating",
        title: "Half-star rating",
        summary: "Shoelace's rating, in half stars."
      },
      %{
        path: ~p"/adapters/sortable",
        title: "Sortable lists",
        summary: "Drag cards between two lists (SortableJS)."
      },
      %{
        path: ~p"/adapters/tabulator",
        title: "Data table",
        summary: "Edit, sort and select rows (Tabulator)."
      },
      %{
        path: ~p"/adapters/calendar",
        title: "Calendar",
        summary: "Add and open events (FullCalendar)."
      },
      %{path: ~p"/adapters/map", title: "Map", summary: "Markers you click and drag (Leaflet)."},
      %{
        path: ~p"/adapters/terminal",
        title: "Terminal",
        summary: "A terminal the server answers (xterm.js)."
      },
      %{
        path: ~p"/adapters/uppy",
        title: "File uploads",
        summary: "Uppy's dashboard, uploading through LiveView."
      },
      %{
        path: ~p"/adapters/wavesurfer",
        title: "Audio waveform",
        summary: "Play audio, and mark regions (WaveSurfer)."
      },
      %{
        path: ~p"/adapters/multitrack",
        title: "Audio studio",
        summary: "Several tracks, and recording from the microphone."
      }
    ]
  end

  defp routing do
    [
      %{
        path: ~p"/routing",
        # Every page of the routing example counts as this one in the sidebar.
        match: "/routing/",
        title: "File-based routing",
        summary: "Folders become URLs: parameters, catch-alls, groups and nested layouts."
      },
      %{
        path: ~p"/scratchpad",
        # Both scratchpad pages count as this example in the sidebar.
        match: "/scratchpad",
        title: "An editor that stays open",
        summary: "A persistent part with a Monaco editor that survives page changes."
      }
    ]
  end

  defp everyday do
    [
      %{
        path: ~p"/icons",
        title: "Icons",
        summary: "Lucide, Material Design Icons and Heroicons, as Tailwind classes."
      },
      %{
        path: ~p"/notifications",
        title: "Notifications",
        summary: "Success, error and info messages with put_flash/3, during navigation too."
      },
      %{
        path: ~p"/languages",
        title: "Languages",
        summary: "English and German with Gettext, in a JavaScript widget too."
      },
      %{
        path: ~p"/settings",
        title: "Settings",
        summary: "All three together: a translated settings panel with icons and messages."
      }
    ]
  end

  defp forms do
    [
      %{
        path: ~p"/forms",
        title: "A form with editors",
        summary: "Monaco, rich text, a date and tags in one Phoenix form."
      }
    ]
  end
end
