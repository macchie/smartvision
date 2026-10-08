/// <reference path="../pb_data/types.d.ts" />

/**
 * gate_triggers.pb.js
 *
 * Runtime engines for the `gate_triggers` collection.
 *
 * ── folder_watch ──────────────────────────────────────────────────────────
 * A cron job scans each enabled folder_watch trigger's directory once a minute,
 * extracts the plate from each image filename and records a gate access. The
 * heavy lifting lives in pb_hooks/lib/gate_trigger_engine.js and is loaded with
 * require() inside the callback (cron callbacks run in pooled JSVM contexts, so
 * engine logic must come from a required module rather than this file's scope).
 *
 * This cron is a SAFETY-NET SWEEP. The stock PocketBase JS runtime has no fs
 * notification or sub-minute timer, so real-time folder watching runs in the
 * external bridge (extensions/gate-bridge/) which picks up files the instant they
 * land and forwards them to /api/gate-event. The cron still runs to catch
 * anything the bridge missed (e.g. while it was restarting) or when the bridge
 * is not deployed.
 *
 * ── tcp_socket ────────────────────────────────────────────────────────────
 * The stock PocketBase JS runtime exposes $os / $filepath / cron but NO `net`
 * binding, so a raw TCP listener cannot run in these hooks. tcp_socket triggers
 * are handled entirely by the external bridge (extensions/gate-bridge/), which owns
 * the socket and forwards detections to the existing gate-event route.
 *
 * External bridge contract (implemented by extensions/gate-bridge/):
 *   1. Read gate_triggers where type = "tcp_socket" && enabled = true via the
 *      PocketBase API (fields: gate(expand gate.gate_id), tcp_host, tcp_port,
 *      tcp_delimiter, plate_regex).
 *   2. Listen on tcp_host:tcp_port, split the stream on tcp_delimiter.
 *   3. Apply plate_regex to each message (first capture group, else whole
 *      match) and normalize to uppercase alphanumerics.
 *   4. POST (authenticated) to /api/gate-event:
 *        { "gate_id": "<gates.gate_id>", "plate_number": "<PLATE>" }
 *      which performs the same vehicle lookup / access creation as the
 *      folder-watch engine.
 */

cronAdd("gate-folder-watch", "* * * * *", () => {
  try {
    const engine = require(`${__hooks}/lib/gate_trigger_engine.js`)
    engine.processFolderTriggers($app)
  } catch (err) {
    console.error("[gate-trigger] folder-watch cron failed:", err)
  }
})
