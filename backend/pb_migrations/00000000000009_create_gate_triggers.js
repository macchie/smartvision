/// <reference path="../pb_data/types.d.ts" />

/**
 * gate_triggers
 *
 * Per-gate automation sources that turn a detected license plate into a gate
 * event. A gate may own many triggers. Two trigger types are supported:
 *
 *   - folder_watch: a camera drops a jpg/png/bmp into `watch_folder`; the
 *     filename carries the plate. A cron engine (pb_hooks/gate_triggers.pb.js)
 *     scans the folder, extracts the plate with `plate_regex`, looks up the
 *     vehicle and records an access for this gate.
 *
 *   - tcp_socket: an external bridge listens on `tcp_host:tcp_port`, parses the
 *     incoming message with `plate_regex`, and forwards the plate. The stock
 *     PocketBase JS runtime cannot open raw sockets, so the live listener lives
 *     in a small external bridge that POSTs to /api/gate-event (see the hook
 *     file for the documented contract). The config is stored here.
 */
migrate((app) => {
  const gatesCol = app.findCollectionByNameOrId("gates")

  const collection = new Collection({
    name: "gate_triggers",
    type: "base",
  })

  collection.fields = [
    // Owning gate — events produced by this trigger are recorded against it.
    new Field({
      name: "gate",
      type: "relation",
      required: true,
      collectionId: gatesCol.id,
      cascadeDelete: true,
      minSelect: null,
      maxSelect: 1,
    }),
    // Human-readable label
    new Field({
      name: "name",
      type: "text",
      required: true,
      min: null,
      max: null,
      pattern: "",
    }),
    // "folder_watch" | "tcp_socket"
    new Field({
      name: "type",
      type: "select",
      required: true,
      maxSelect: 1,
      values: ["folder_watch", "tcp_socket"],
    }),
    new Field({
      name: "enabled",
      type: "bool",
    }),
    // Regex applied to the source string (filename or socket message) to extract
    // the plate. First capture group is used when present, otherwise the whole
    // match. Matching is case-insensitive; the extracted value is normalized to
    // uppercase alphanumerics before vehicle lookup.
    new Field({
      name: "plate_regex",
      type: "text",
      min: null,
      max: null,
      pattern: "",
    }),

    // --- folder_watch options --------------------------------------------
    new Field({
      name: "watch_folder",
      type: "text",
      min: null,
      max: null,
      pattern: "",
    }),
    // Comma-separated list of accepted extensions (default: jpg,jpeg,png,bmp)
    new Field({
      name: "file_extensions",
      type: "text",
      min: null,
      max: null,
      pattern: "",
    }),
    // What to do with a file after processing: "delete" | "move"
    new Field({
      name: "processed_action",
      type: "select",
      maxSelect: 1,
      values: ["delete", "move"],
    }),
    // Destination folder when processed_action = "move"
    new Field({
      name: "processed_folder",
      type: "text",
      min: null,
      max: null,
      pattern: "",
    }),

    // --- tcp_socket options ----------------------------------------------
    new Field({
      name: "tcp_host",
      type: "text",
      min: null,
      max: null,
      pattern: "",
    }),
    new Field({
      name: "tcp_port",
      type: "number",
      min: null,
      max: null,
      onlyInt: true,
    }),
    // Delimiter separating messages on the stream (default: "\n")
    new Field({
      name: "tcp_delimiter",
      type: "text",
      min: null,
      max: null,
      pattern: "",
    }),

    new Field({
      name: "notes",
      type: "text",
      min: null,
      max: 2000,
      pattern: "",
    }),
    new Field({
      name: "created_at",
      type: "date",
    }),
    new Field({
      name: "updated_at",
      type: "date",
    }),
  ]

  collection.indexes = [
    "CREATE INDEX idx_gate_triggers_gate ON gate_triggers (gate)",
    "CREATE INDEX idx_gate_triggers_type_enabled ON gate_triggers (type, enabled)",
  ]

  collection.listRule = "@request.auth.id != ''"
  collection.viewRule = "@request.auth.id != ''"
  collection.createRule = "@request.auth.role = 'admin'"
  collection.updateRule = "@request.auth.role = 'admin'"
  collection.deleteRule = "@request.auth.role = 'admin'"

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("gate_triggers")
  return app.delete(collection)
})
