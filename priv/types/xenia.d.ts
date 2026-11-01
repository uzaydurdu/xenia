// Types for "xenia": the adapter contract, ctx, createHooks and providers.
//
// Any adapter, for any npm package, can use them. In plain JavaScript:
//
//   // @ts-check
//   /** @type {import("xenia").Adapter<Chart, {data: object}, {click: {label: string}}>} */
//   export const chart = { mount(el, props, ctx) { ... }, destroy(chart) { ... } }
//
// In TypeScript:
//
//   import type { Adapter } from "xenia"
//   export const chart: Adapter<Chart, {data: object}, {click: {label: string}}> = { ... }
//
// The library's own types (Chart above) come from the library's package.
// See the "Typed adapters" section of the wrapping-a-library guide.

/** Options for one event the adapter declares in `events`. */
export interface EventOptions {
  /** Send only the latest payload, this many milliseconds after the last emit. */
  debounce?: number;
}

/** The raw LiveView hook (`ctx.hook`), the escape hatch. */
export interface LiveViewHook {
  /** The container LiveView owns. The adapter's DOM lives in `el`, not here. */
  readonly el: HTMLElement;
  pushEvent(event: string, payload?: unknown, onReply?: (reply: any, ref: number) => void): any;
  handleEvent(event: string, callback: (payload: any) => void): unknown;
  removeHandleEvent(ref: unknown): void;
  [key: string]: any;
}

/** The payload argument: optional when the event's payload may be undefined. */
type PayloadArgs<Payload> = undefined extends Payload ? [payload?: Payload] : [payload: Payload];

/**
 * The adapter's interface to Xenia, one per instance. A remount's new
 * instance gets a new `ctx`; the old one is dead.
 *
 * `Events` maps each event the adapter declares to its payload, e.g.
 * `{change: {value: string}, save: {}}`.
 */
export interface Ctx<Events extends Record<string, any> = Record<string, any>> {
  /** The component's stable id (the container's id). Key global resources by it. */
  readonly id: string;
  /** The raw LiveView hook. Don't keep references to it across destroy or remount. */
  readonly hook: LiveViewHook;
  /**
   * Aborted when this instance's destruction begins (before `destroy` runs).
   * Pass it to `fetch` and to listeners outside `el`, and they clean themselves up.
   */
  readonly signal: AbortSignal;
  /** True from mount until destruction begins, while the element is in the page. */
  isAlive(): boolean;
  /** Sends a declared event. The page maps it to a LiveView event (`on_<name>`). */
  emit<Name extends keyof Events & string>(name: Name, ...payload: PayloadArgs<Events[Name]>): void;
  /**
   * Sends a declared event and resolves with the server's reply
   * (`{:reply, map, socket}` from `handle_event`).
   */
  call<Name extends keyof Events & string, Reply = Record<string, any>>(
    name: Name,
    ...payload: PayloadArgs<Events[Name]>
  ): Promise<Reply>;
  /** Replaces the instance with a fresh one, mounted with the latest props. */
  remount(): void;
  /**
   * Writes the component's form value: the user's change (`notify: true`,
   * runs `phx-change`) or the server's (`notify: false`). A list is one
   * input per value. Returns whether the component is a form field.
   */
  setFormValue(value: unknown, options?: { notify?: boolean }): boolean;
  /** Hands files to the LiveView upload `name`. Returns false, and logs why, if it can't. */
  upload(name: string, files: ReadonlyArray<File | Blob>): boolean;
}

/**
 * An adapter: how one JavaScript library is created, updated and destroyed.
 * Xenia does the rest (props diffing, events, commands, cleanup).
 *
 * - `Instance`: what `mount` returns, usually the library's own object.
 * - `Props`: the props the server sends, e.g. `{data: number[], type: string}`.
 *   Include values the adapter consumes, e.g. `theme`.
 * - `Events`: each event's payload, e.g. `{click: {label: string}}`.
 * - `Commands`: each command's arguments, e.g. `{highlight: {index: number}}`.
 */
export interface Adapter<
  Instance = any,
  Props extends Record<string, any> = Record<string, any>,
  Events extends Record<string, any> = Record<string, any>,
  Commands extends Record<string, any> = Record<string, any>,
> {
  /** Creates the library inside `el`, an element Xenia made for it. May be async. */
  mount(el: HTMLElement, props: Props, ctx: Ctx<Events>): Instance | Promise<Instance>;
  /** Undoes what `mount` did. Synchronous: Xenia doesn't wait for a Promise. */
  destroy(instance: Instance, ctx: Ctx<Events>): void;
  /**
   * One handler per prop that needs more than `instance[name] = value`.
   * Called only when the value changed; `undefined` when the prop was removed.
   */
  props?: {
    [Name in keyof Props]?: (instance: Instance, value: Props[Name] | undefined, ctx: Ctx<Events>) => unknown;
  };
  /** The events the adapter emits, and how chatty each is. */
  events?: { [Name in keyof Events]: EventOptions };
  /** What the server can ask, with `Xenia.push_to/4`. */
  commands?: {
    [Name in keyof Commands]: (instance: Instance, args: Commands[Name], ctx: Ctx<Events>) => unknown;
  };
  /** App-wide values this adapter receives as props, e.g. `["theme"]` or `["connection"]`. */
  consumes?: readonly string[];
}

/** An adapter of any shape: what `createHooks` and `adapterHook` accept. */
export type AnyAdapter = Adapter<any, any, any, any>;

/** A LiveView hook object, as `createHooks` and `adapterHook` build them. */
export interface HookDefinition {
  mounted?(this: LiveViewHook): void;
  updated?(this: LiveViewHook): void;
  destroyed?(this: LiveViewHook): void;
  disconnected?(this: LiveViewHook): void;
  reconnected?(this: LiveViewHook): void;
}

/**
 * Builds LiveView hooks from adapters, keyed by the name the tag uses
 * (`adapter="Chart"`), plus Xenia's built-in hooks. Spread the result into
 * the LiveSocket's `hooks`.
 */
export function createHooks(adapters: Record<string, AnyAdapter>): Record<string, HookDefinition>;

/** One adapter as one LiveView hook, e.g. for a co-located hook's `export default`. */
export function adapterHook(adapter: AnyAdapter, hookName?: string): HookDefinition;

/** Publishes an app-wide value; adapters that consume `name` get it as a prop. */
export function setProvider(name: string, value: unknown): void;

/** The current value of `name`, or `null` if none was published. */
export function readProvider<Value = unknown>(name: string): { value: Value } | null;

/** Calls `listener` whenever `name` changes. Returns the function that stops it. */
export function subscribeProvider<Value = unknown>(
  name: string,
  listener: (value: Value) => void,
): () => void;
