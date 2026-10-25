/**
 * Xenia's official adapter for SortableJS: a drag-and-drop list, optionally sharing
 * items with other lists (kanban boards) and working as a form field.
 *
 * Inside Xenia's container the server can't render children, so the
 * adapter renders the items itself from the `items` prop. Labels are set as
 * text, never as HTML.
 *
 * Props:
 *   items     [%{id, label, disabled?, class?}]   the list, in order
 *   group     a group name: lists with the same name exchange items. Or
 *             %{name, pull: true | false | "clone", put: true | false}
 *   handle    true shows a drag handle; only the handle starts a drag
 *   disabled  true turns dragging off
 *   list_class, item_class   extra CSS classes for the <ul> and each <li>
 *   options   any other SortableJS option, snake_case or camelCase:
 *             animation, ghost_class, delay, swap_threshold, sort, ...
 *
 * Commands:
 *   reset                 re-render from the last `items` prop, e.g. after
 *                         the server refused a move without changing `items`
 *
 * Events:
 *   sort    %{ids, item_id, old_index, new_index}    reordered within this list
 *   add     %{ids, item_id, new_index, from}         received from another list
 *   remove  %{ids, item_id, old_index, to}           moved to another list
 *   error   %{source, message, code}
 *   `ids` is this list's order after the change; `from`/`to` are the other
 *   list's component id. A move between lists sends `remove` from one and
 *   `add` from the other: update both lists' items on the server.
 *
 * Form field: with field={@form[:order]}, the ids are submitted as a JSON
 * array string, e.g. "[\"a\",\"c\",\"b\"]" (decode it with Jason).
 *
 * Usage (the app passes the library in, so Xenia imports nothing):
 *   import { createSortablejs } from "xenia/sortablejs"
 *   const sortablejs = createSortablejs({
 *     load: () => import("sortablejs")
 *   })
 *   // createHooks({ SortableJS: sortablejs }), then <.sortable_list> (Xenia.Adapters.SortableJS)
 *   Extend it by spreading: { ...sortablejs, commands: { ...sortablejs.commands, mine() {} } }
 */

import {
  camelizeKeys,
  createFormField,
  expectLibrary,
  guarded,
  injectStyle,
  isolateFormEvents,
  loadOnce,
  withLibrary,
} from "./shared.js";

const LOAD = 'createSortablejs({ load: () => import("sortablejs") })';

function pickLibrary(library) {
  const Sortable = library?.default ?? library?.Sortable ?? library;
  expectLibrary(typeof Sortable === "function", LOAD);
  return { Sortable };
}

/**
 * Creates the adapter. `load` gives the library (see the usage above); it is
 * called once, when the first component mounts.
 */
export function createSortablejs({ load: libraryImport } = {}) {
  const loadLibrary = loadOnce(libraryImport, LOAD);
  let Sortable;
  const STYLE = `
  .xenia-sortable { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; min-height: 2.5rem; }
  .xenia-sortable__item { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-radius: 8px;
    border: 1px solid rgba(127, 127, 127, 0.3); background: var(--xenia-sortable-item-bg, rgba(127, 127, 127, 0.06)); cursor: grab; user-select: none; }
  .xenia-sortable--handle .xenia-sortable__item { cursor: default; }
  .xenia-sortable__item[data-disabled] { opacity: 0.5; cursor: not-allowed; }
  .xenia-sortable__handle { cursor: grab; opacity: 0.5; font-size: 14px; line-height: 1; }
  .xenia-sortable__ghost { opacity: 0.35; }
  .xenia-sortable__chosen { box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15); }
`;

  /** Every list the adapter manages, for naming the other side of a move. */
  const lists = new WeakMap();

  function ids(instance) {
    return [...instance.list.children]
      .filter((child) => child.dataset.id != null)
      .map((child) => child.dataset.id);
  }

  function otherListId(element) {
    return lists.get(element)?.ctx.id ?? element.closest("[id]")?.id ?? null;
  }

  /** Renders `items` into the <ul>, reusing existing <li> by id. */
  function render(instance) {
    const { list, doc } = instance;
    const items = Array.isArray(instance.items) ? instance.items : [];
    const existing = new Map(
      [...list.children].map((child) => [child.dataset.id, child]),
    );

    list.className = [
      "xenia-sortable",
      instance.handle ? "xenia-sortable--handle" : "",
      instance.listClass ?? "",
    ]
      .filter(Boolean)
      .join(" ");

    const nodes = items.map((item) => {
      const id = String(item.id);
      const li = existing.get(id) ?? doc.createElement("li");
      existing.delete(id);

      li.dataset.id = id;
      li.className = [
        "xenia-sortable__item",
        instance.itemClass ?? "",
        item.class ?? "",
      ]
        .filter(Boolean)
        .join(" ");
      li.toggleAttribute("data-disabled", Boolean(item.disabled));
      li.replaceChildren();

      if (instance.handle) {
        const handle = doc.createElement("span");
        handle.className = "xenia-sortable__handle";
        handle.setAttribute("aria-hidden", "true");
        handle.textContent = "⠿";
        li.appendChild(handle);
      }

      const label = doc.createElement("span");
      label.textContent = item.label ?? id;
      li.appendChild(label);

      return li;
    });

    // Anything left over (removed items, or a node dropped in from another
    // list that the server didn't confirm) goes away.
    for (const stale of existing.values()) stale.remove();
    list.replaceChildren(...nodes);
  }

  function sortableOptions(instance) {
    const options = camelizeKeys(instance.options ?? {});
    const group =
      instance.group == null
        ? undefined
        : typeof instance.group === "string"
          ? instance.group
          : camelizeKeys(instance.group);

    return {
      animation: 150,
      ghostClass: "xenia-sortable__ghost",
      chosenClass: "xenia-sortable__chosen",
      ...options,
      group,
      handle: instance.handle ? ".xenia-sortable__handle" : undefined,
      filter: "[data-disabled]",
      preventOnFilter: false,
      disabled: Boolean(instance.disabled),
      dataIdAttr: "data-id",
    };
  }

  function report(instance) {
    instance.field.report(ids(instance));
  }

  const adapter = {
    mount(el, props, ctx) {
      const doc = el.ownerDocument;
      injectStyle(doc, "xenia-sortable-style", STYLE);

      const list = doc.createElement("ul");
      el.appendChild(list);

      const instance = {
        ctx,
        doc,
        list,
        sortable: null,
        items: props.items ?? [],
        group: props.group,
        handle: Boolean(props.handle),
        disabled: Boolean(props.disabled),
        listClass: props.list_class,
        itemClass: props.item_class,
        options: props.options,
        field: createFormField(ctx),
        stopIsolation: isolateFormEvents(el),
      };

      lists.set(list, instance);

      try {
        render(instance);

        instance.sortable = Sortable.create(list, {
          ...sortableOptions(instance),

          onSort: (event) => {
            // onSort fires on both lists of a move; within one list only here.
            if (event.from !== event.to) return;

            ctx.emit("sort", {
              ids: ids(instance),
              item_id: event.item.dataset.id,
              old_index: event.oldIndex,
              new_index: event.newIndex,
            });
            report(instance);
          },

          onAdd: (event) => {
            ctx.emit("add", {
              ids: ids(instance),
              item_id: event.item.dataset.id,
              new_index: event.newIndex,
              from: otherListId(event.from),
            });
            report(instance);
          },

          onRemove: (event) => {
            ctx.emit("remove", {
              ids: ids(instance),
              item_id: event.item.dataset.id,
              old_index: event.oldIndex,
              to: otherListId(event.to),
            });
            report(instance);
          },
        });

        return instance;
      } catch (error) {
        instance.stopIsolation();
        list.remove();
        throw error;
      }
    },

    destroy(instance) {
      instance.sortable?.destroy();
      instance.stopIsolation();
      lists.delete(instance.list);
      instance.list.remove();
    },

    props: {
      // In a form, an order this list reported itself is a validate reply:
      // the DOM already shows it, so nothing is re-rendered.
      items(instance, items) {
        instance.items = items ?? [];
        const order = instance.items.map((item) => String(item.id));

        if (instance.field.isEcho(order)) return;

        render(instance);
        instance.field.sync(order);
      },

      group(instance, group) {
        instance.group = group;
        instance.sortable.option("group", sortableOptions(instance).group);
      },

      handle(instance, handle) {
        instance.handle = Boolean(handle);
        instance.sortable.option("handle", sortableOptions(instance).handle);
        render(instance);
      },

      disabled(instance, disabled) {
        instance.disabled = Boolean(disabled);
        instance.sortable.option("disabled", instance.disabled);
      },

      list_class(instance, value) {
        instance.listClass = value;
        render(instance);
      },

      item_class(instance, value) {
        instance.itemClass = value;
        render(instance);
      },

      options(instance, options) {
        instance.options = options;
        for (const [key, value] of Object.entries(
          camelizeKeys(options ?? {}),
        )) {
          instance.sortable.option(key, value);
        }
      },
    },

    commands: {
      reset: guarded("reset", (instance) => {
        render(instance);
        instance.field.sync(instance.items.map((item) => String(item.id)));
      }),
    },

    events: {
      sort: {},
      add: {},
      remove: {},
      error: {},
    },
  };

  return withLibrary(adapter, loadLibrary, (library) => {
    ({ Sortable } = pickLibrary(library));
  });
}
