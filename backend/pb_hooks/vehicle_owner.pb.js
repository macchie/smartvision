/// <reference path="../pb_data/types.d.ts" />

/**
 * vehicle_owner.pb.js
 *
 * Custom route: POST /api/vehicles/assign-owner
 *
 * Request body:
 *   { "vehicle_id": "<vehicles.id>", "owner_id": "<users.id>" }
 *
 * Assigns (or changes) a vehicle's owner and cascades the new owner onto the
 * vehicle's access history. The business logic lives in lib/vehicle_owner.js
 * and is loaded with require() because route handlers run in isolated JSVM
 * contexts and cannot call functions declared in this file's module scope
 * (same pattern as gate_events.pb.js).
 */
routerAdd("POST", "/api/vehicles/assign-owner", (e) => {
  const auth = e.auth
  if (!auth) {
    return e.unauthorizedError("authentication required", null)
  }
  const role = auth.get("role")
  if (role !== "admin" && role !== "operator") {
    return e.forbiddenError("insufficient permissions", null)
  }

  const body = e.requestInfo().body
  const vehicleId = body?.vehicle_id || ""
  const ownerId = body?.owner_id || ""
  if (!vehicleId || !ownerId) {
    return e.badRequestError("vehicle_id and owner_id are required", null)
  }

  const lib = require(`${__hooks}/lib/vehicle_owner.js`)
  const result = lib.assignOwner($app, vehicleId, ownerId)

  if (result.status === "vehicle_not_found") {
    return e.notFoundError("vehicle not found", null)
  }
  if (result.status === "owner_not_found") {
    return e.notFoundError("owner not found", null)
  }
  if (result.status !== "ok") {
    return e.badRequestError("could not assign owner", null)
  }

  return e.json(200, result)
}, $apis.requireAuth())
