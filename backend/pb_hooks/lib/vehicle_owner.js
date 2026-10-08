/// <reference path="../../pb_data/types.d.ts" />

/**
 * vehicle_owner.js
 *
 * Shared owner-assignment logic for vehicles. Loaded with require() from the
 * route in pb_hooks/vehicle_owner.pb.js (PocketBase runs route callbacks in
 * isolated JSVM contexts), mirroring the gate_events + gate_trigger_engine split.
 *
 * assignOwner sets vehicles.owner and then cascades the new owner onto that
 * vehicle's access history so the access log, dashboard and reports reflect the
 * change. To avoid rewriting history that was explicitly attributed to someone
 * else, it only touches a vehicle-type access's driver_user / made_by_user when
 * that field is empty (the "owner was missing" case) or still points at the
 * previous owner (a genuine A -> B reassignment).
 */

// Programmatic $app.save() does not fire the audit hook in lifecycle_hooks.pb.js,
// so we stamp updated_at ourselves (matching gate_trigger_engine.js).
function nowStamp() {
  return new Date().toISOString().replace("T", " ")
}

function assignOwner($app, vehicleId, ownerId) {
  if (!vehicleId) {
    return { status: "invalid_vehicle" }
  }
  if (!ownerId) {
    return { status: "invalid_owner" }
  }

  let vehicle
  try {
    vehicle = $app.findRecordById("vehicles", vehicleId)
  } catch (_) {
    return { status: "vehicle_not_found" }
  }

  try {
    $app.findRecordById("users", ownerId)
  } catch (_) {
    return { status: "owner_not_found" }
  }

  const previousOwnerId = vehicle.getString("owner")

  vehicle.set("owner", ownerId)
  try { vehicle.set("updated_at", nowStamp()) } catch (_) { /* field may be absent */ }
  $app.save(vehicle)

  // Cascade onto the vehicle's access history.
  let accesses = []
  try {
    accesses = $app.findRecordsByFilter(
      "accesses",
      "access_type = 'vehicle' && vehicle = {:vid}",
      "-created_at", 5000, 0,
      { vid: vehicleId },
    )
  } catch (err) {
    console.error("[vehicle-owner] failed to load accesses for", vehicleId, err)
  }

  const OWNER_FIELDS = ["driver_user", "made_by_user"]
  let updated = 0
  const total = accesses ? (accesses.length || 0) : 0
  for (let i = 0; i < total; i++) {
    const access = accesses[i]
    let changed = false
    for (let f = 0; f < OWNER_FIELDS.length; f++) {
      const field = OWNER_FIELDS[f]
      const current = access.getString(field)
      const isEmpty = !current
      const isPreviousOwner = previousOwnerId && current === previousOwnerId
      if ((isEmpty || isPreviousOwner) && current !== ownerId) {
        access.set(field, ownerId)
        changed = true
      }
    }
    if (changed) {
      try { access.set("updated_at", nowStamp()) } catch (_) { /* field may be absent */ }
      try {
        $app.save(access)
        updated++
      } catch (err) {
        console.error("[vehicle-owner] failed to update access", access.id, err)
      }
    }
  }

  return {
    status: "ok",
    vehicle_id: vehicleId,
    owner_id: ownerId,
    previous_owner_id: previousOwnerId || "",
    updated_accesses: updated,
  }
}

module.exports = { assignOwner }
