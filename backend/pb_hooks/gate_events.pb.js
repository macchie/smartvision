/// <reference path="../pb_data/types.d.ts" />

/**
 * gate_events.pb.js
 *
 * Custom route: POST /api/gate-event
 *
 * Replaces the original FTP server mechanism (SmartVisionLoopback/server/boot/ftp.js).
 * Gates (and the external gate-bridge) POST a JSON payload here when they detect
 * a license plate.
 *
 * Request body:
 *   { "gate_id": "cam001", "plate_number": "AB123CD" }
 *
 * Business logic (vehicle find/auto-create, 30s min-stay guard, direction
 * alternation, vehicle + owner-user access creation, close previous on exit)
 * lives in pb_hooks/lib/gate_trigger_engine.js and is shared with the
 * folder-watch cron. It is loaded with require() here because route handlers run
 * in isolated JSVM contexts and cannot call functions declared in this file's
 * module scope (a bare reference throws "ReferenceError … is not defined" and
 * fails the request with a generic 400).
 */
routerAdd("POST", "/api/gate-event", (e) => {
  const body = e.requestInfo().body
  const gateId = body?.gate_id || ""
  const plateNumber = body?.plate_number || ""

  if (!gateId || !plateNumber) {
    return e.badRequestError("gate_id and plate_number are required", null)
  }

  const engine = require(`${__hooks}/lib/gate_trigger_engine.js`)
  const result = engine.handleGateEvent($app, gateId, plateNumber)

  if (result.status === "gate_not_found") {
    return e.notFoundError("gate not found", null)
  }
  if (result.status === "invalid_plate") {
    return e.badRequestError("plate_number did not yield a valid plate", null)
  }

  return e.json(200, result)
}, $apis.requireAuth())
