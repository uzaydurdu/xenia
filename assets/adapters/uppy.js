/**
 * Xenia's official adapter for Uppy (v4–v6): a file upload dashboard with drag and
 * drop, previews, restrictions and progress.
 *
 * Three transports, chosen with the `transport` prop:
 *   "liveview" (default)  Files go to a LiveView upload through Xenia's
 *                         ctx.upload: the page needs allow_upload/3 with the
 *                         name in `upload_name` and a rendered
 *                         <.live_file_input> for it. LiveView then uploads
 *                         them (at once with auto_upload: true, otherwise on
 *                         form submit) and reports progress on the server.
 *                         Uppy marks the files done when LiveView accepts
 *                         them.
 *   "xhr"                 Multipart POST to `endpoint` (your own controller),
 *                         with Uppy's own progress bars.
 *   "tus"                 Resumable uploads to a tus server at `endpoint`.
 *
 * Props:
 *   transport     "liveview" | "xhr" | "tus"
 *   upload_name   LiveView upload name (liveview transport)
 *   endpoint      URL (xhr, tus)
 *   headers       %{"x-csrf-token" => token, ...} (xhr, tus)
 *   field_name    form field name for xhr (default "file")
 *   restrictions  %{max_file_size, max_number_of_files, min_number_of_files,
 *                   allowed_file_types: ["image/*", ".pdf"], max_total_file_size}
 *   auto_proceed  true uploads as soon as files are added
 *   note          hint under the drop area, e.g. "Images up to 5 MB"
 *   height        dashboard height (default 350)
 *   theme         "auto" (default: follows the page's light/dark mode),
 *                 "light" or "dark"
 *   disabled      true greys out the dashboard
 *   dashboard     any other Dashboard option, snake_case or camelCase
 *   options       any other Uppy core option
 *   Changing transport, upload_name, endpoint, headers, field_name,
 *   dashboard or options remounts; the rest applies in place.
 *
 * Commands:
 *   upload                start uploading the added files
 *   cancel_all            stop uploads and remove all files
 *   clear                 remove all files (after an upload)
 *   remove_file %{id}
 *   retry_all
 *
 * Events:
 *   files_added         %{files: [%{id, name, size, type}]}
 *   file_removed        %{file}
 *   restriction_failed  %{file, message}
 *   upload_progress     %{file, percent}   xhr/tus, at most every 250 ms
 *   upload_success      %{file, response}  response: %{status, body}
 *   upload_error        %{file, message}
 *   complete            %{successful: [file], failed: [file]}
 *   handed_off          %{name, files}     liveview: LiveView accepted them
 *   error               %{source, message, code}
 *
 * Load Uppy's CSS once, e.g. in app.css:
 *   @import "../node_modules/@uppy/core/dist/style.min.css";
 *   @import "../node_modules/@uppy/dashboard/dist/style.min.css";
 *
 * Usage (the app passes the library in, so Xenia imports nothing):
 *   import { createUppy } from "xenia/uppy"
 *   const uppy = createUppy({
 *     load: async () => {
 *       const [core, dashboard, xhr, tus] = await Promise.all([
 *         import("@uppy/core"),
 *         import("@uppy/dashboard"),
 *         import("@uppy/xhr-upload"), // only for transport="xhr"
 *         import("@uppy/tus"), // only for transport="tus"
 *       ])
 *       return { Uppy: core.default, Dashboard: dashboard.default, XHRUpload: xhr.default, Tus: tus.default }
 *     }
 *   })
 *   // createHooks({ Uppy: uppy }), then <.uppy> (Xenia.Adapters.Uppy)
 *   Extend it by spreading: { ...uppy, commands: { ...uppy.commands, mine() {} } }
 */

import {
  camelizeKeys,
  expectLibrary,
  guarded,
  isolateFormEvents,
  loadOnce,
  reportError,
  throttle,
  withLibrary,
} from "./shared.js";

const LOAD = "createUppy({ load: see the usage at the top of this file })";

function pickLibrary(library) {
  const { Uppy, Dashboard, XHRUpload, Tus } = library ?? {};
  expectLibrary(
    typeof Uppy === "function" && typeof Dashboard === "function",
    LOAD,
  );
  return { Uppy, Dashboard, XHRUpload, Tus };
}

/**
 * Creates the adapter. `load` gives the library (see the usage above); it is
 * called once, when the first component mounts.
 */
export function createUppy({ load: libraryImport } = {}) {
  const loadLibrary = loadOnce(libraryImport, LOAD);
  let Uppy, Dashboard, XHRUpload, Tus;
  const REMOUNT_PROPS = [
    "transport",
    "upload_name",
    "endpoint",
    "headers",
    "field_name",
    "dashboard",
    "options",
  ];

  function fileDetail(file) {
    if (!file) return null;
    return {
      id: file.id,
      name: file.name,
      size: file.size ?? null,
      type: file.type ?? null,
    };
  }

  function restrictions(value) {
    return camelizeKeys(value ?? {});
  }

  function themeFor(instance) {
    return instance.theme === "dark" ? "dark" : "light";
  }

  /**
   * The LiveView transport: hands the files to Xenia's ctx.upload, which
   * passes them to LiveView's hook.upload for the named upload.
   */
  function liveViewUploader(instance, uploadName) {
    return async (fileIDs) => {
      const { uppy, ctx } = instance;
      const files = fileIDs.map((id) => uppy.getFile(id));

      uppy.emit("upload-start", files);

      // LiveView needs File objects with names; Uppy may hold plain Blobs.
      const blobs = files.map((file) =>
        file.data instanceof File
          ? file.data
          : new File([file.data], file.name, { type: file.type }),
      );

      const accepted = Boolean(uploadName) && ctx.upload(uploadName, blobs);

      for (const file of files) {
        if (accepted) {
          uppy.emit("upload-success", uppy.getFile(file.id), {
            status: 200,
            body: {},
            uploadURL: undefined,
          });
        } else {
          uppy.emit(
            "upload-error",
            uppy.getFile(file.id),
            new Error(
              uploadName
                ? `LiveView did not accept the upload "${uploadName}"`
                : "upload_name is not set",
            ),
          );
        }
      }

      if (accepted)
        ctx.emit("handed_off", {
          name: uploadName,
          files: files.map(fileDetail),
        });
    };
  }

  function useTransport(instance, props) {
    const { uppy } = instance;
    const transport = props.transport ?? "liveview";
    const headers = props.headers ?? {};

    switch (transport) {
      case "liveview":
        uppy.addUploader(liveViewUploader(instance, props.upload_name));
        break;

      case "xhr":
        if (!props.endpoint)
          throw new TypeError('transport "xhr" needs an endpoint');
        uppy.use(XHRUpload, {
          endpoint: props.endpoint,
          headers,
          fieldName: props.field_name ?? "file",
        });
        break;

      case "tus":
        if (!props.endpoint)
          throw new TypeError('transport "tus" needs an endpoint');
        uppy.use(Tus, { endpoint: props.endpoint, headers });
        break;

      default:
        throw new TypeError(`unknown transport ${JSON.stringify(transport)}`);
    }
  }

  const adapter = {
    // The app's theme arrives as the `theme` prop.
    consumes: ["theme"],

    mount(el, props, ctx) {
      const doc = el.ownerDocument;
      const host = doc.createElement("div");
      el.appendChild(host);

      const instance = {
        ctx,
        doc,
        host,
        uppy: null,
        theme: props.theme,
        // The dashboard's <input type="file"> must not trigger phx-change.
        stopIsolation: isolateFormEvents(el),
        emitProgress: throttle(
          (detail) => ctx.isAlive() && ctx.emit("upload_progress", detail),
          250,
        ),
      };

      try {
        const core = new Uppy({
          id: `xenia-uppy-${ctx.id ?? Math.random().toString(36).slice(2)}`,
          autoProceed: Boolean(props.auto_proceed),
          restrictions: restrictions(props.restrictions),
          ...camelizeKeys(props.options ?? {}),
        });

        instance.uppy = core;

        core.use(Dashboard, {
          inline: true,
          target: host,
          height: props.height ?? 350,
          width: "100%",
          note: props.note ?? null,
          disabled: Boolean(props.disabled),
          theme: themeFor(instance),
          proudlyDisplayPoweredByUppy: false,
          showProgressDetails: true,
          ...camelizeKeys(props.dashboard ?? {}),
        });

        useTransport(instance, props);

        core.on("files-added", (files) =>
          ctx.emit("files_added", { files: files.map(fileDetail) }),
        );
        core.on("file-removed", (file) =>
          ctx.emit("file_removed", { file: fileDetail(file) }),
        );
        core.on("restriction-failed", (file, error) =>
          ctx.emit("restriction_failed", {
            file: fileDetail(file),
            message: error?.message ?? String(error),
          }),
        );
        core.on("upload-progress", (file, progress) => {
          const total = progress?.bytesTotal;
          const percent = total
            ? Math.round((progress.bytesUploaded / total) * 100)
            : null;
          instance.emitProgress({ file: fileDetail(file), percent });
        });
        core.on("upload-success", (file, response) =>
          ctx.emit("upload_success", {
            file: fileDetail(file),
            response: {
              status: response?.status ?? null,
              body: response?.body ?? null,
            },
          }),
        );
        core.on("upload-error", (file, error) =>
          ctx.emit("upload_error", {
            file: fileDetail(file),
            message: error?.message ?? String(error),
          }),
        );
        core.on("complete", (result) =>
          ctx.emit("complete", {
            successful: (result?.successful ?? []).map(fileDetail),
            failed: (result?.failed ?? []).map(fileDetail),
          }),
        );
        core.on("error", (error) => reportError(ctx, "uppy", error));

        return instance;
      } catch (error) {
        instance.uppy?.destroy();
        instance.stopIsolation();
        host.remove();
        throw error;
      }
    },

    destroy(instance) {
      instance.emitProgress.cancel();
      instance.uppy.destroy(); // cancels uploads and removes the dashboard
      instance.stopIsolation();
      instance.host.remove();
    },

    props: {
      restrictions: (i, value) =>
        i.uppy.setOptions({ restrictions: restrictions(value) }),
      auto_proceed: (i, value) =>
        i.uppy.setOptions({ autoProceed: Boolean(value) }),
      note: (i, value) =>
        i.uppy.getPlugin("Dashboard").setOptions({ note: value ?? null }),
      height: (i, value) =>
        i.uppy.getPlugin("Dashboard").setOptions({ height: value ?? 350 }),
      disabled: (i, value) =>
        i.uppy.getPlugin("Dashboard").setOptions({ disabled: Boolean(value) }),

      theme(instance, theme) {
        instance.theme = theme;
        instance.uppy
          .getPlugin("Dashboard")
          .setOptions({ theme: themeFor(instance) });
      },

      ...Object.fromEntries(
        REMOUNT_PROPS.map((key) => [
          key,
          (_instance, _value, ctx) => ctx.remount(),
        ]),
      ),
    },

    commands: {
      upload: guarded("upload", (i) => i.uppy.upload()),
      cancel_all: guarded("cancel_all", (i) => i.uppy.cancelAll()),
      clear: guarded("clear", (i) => i.uppy.clear()),
      retry_all: guarded("retry_all", (i) => i.uppy.retryAll()),

      remove_file: guarded("remove_file", (i, { id }) => {
        if (!i.uppy.getFile(id))
          throw new Error(`no file with id ${JSON.stringify(id)}`);
        i.uppy.removeFile(id);
      }),
    },

    events: {
      files_added: {},
      file_removed: {},
      restriction_failed: {},
      upload_progress: {},
      upload_success: {},
      upload_error: {},
      complete: {},
      handed_off: {},
      error: {},
    },
  };

  return withLibrary(adapter, loadLibrary, (library) => {
    ({ Uppy, Dashboard, XHRUpload, Tus } = pickLibrary(library));
  });
}
