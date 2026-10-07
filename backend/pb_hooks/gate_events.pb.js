/// <reference path="../pb_data/types.d.ts" />

/**
 * gate_events.pb.js
 *
 * Custom route: POST /api/gate-event
 *
 * Replaces the original FTP server mechanism (SmartVisionLoopback/server/boot/ftp.js).
 * Gates POST a JSON payload here when they detect a license plate.
 *
 * Request body:
 *   { "gate_id": "cam001", "plate_number": "AB123CD" }
 *
 * Business logic (mirrors create-from-ftp.js):
 *   1. Look up the gate by gate_id
 *   2. Find or auto-create the vehicle by plate_number
 *   3. Apply min-stay guard (30 s) and direction-alternation check
 *   4. Create a vehicle access record; close the previous one on exit
 *   5. Create a user access record for the vehicle owner (in/out only)
 */
routerAdd("POST", "/api/gate-event", (e) => {
  const body        = $apis.requestInfo(e).body
  const gateId    = body?.gate_id    || ""
  const plateNumber = body?.plate_number || ""

  if (!gateId || !plateNumber) {
    return e.badRequestError("gate_id and plate_number are required", null)
  }

  // 1. Find gate
  const gates = $app.findRecordsByFilter(
    "gates",
    "gate_id = {:cid} && enabled = true",
    "-created", 1, 0,
    { cid: gateId },
  )
  if (gates.length === 0) {
    return e.notFoundError("gate not found", null)
  }
  const gate    = gates[0]
  const direction = normalizeGateDirection(gate.getString("direction"))

  // 2. Find or auto-create vehicle
  let vehicle
  const vehicles = $app.findRecordsByFilter(
    "vehicles",
    "number = {:num}",
    "-created", 1, 0,
    { num: plateNumber },
  )
  if (vehicles.length === 0) {
    const vehiclesCol = $app.findCollectionByNameOrId("vehicles")
    vehicle = new Record(vehiclesCol)
    vehicle.set("number",  plateNumber)
    vehicle.set("enabled", true)
    $app.save(vehicle)
  } else {
    vehicle = vehicles[0]
  }

  // 3. Check min-stay (30 s) and direction-alternation guard
  const MIN_STAY_SEC = 30

  const lastVehicleAccess = $app.findRecordsByFilter(
    "accesses",
    "access_type = 'vehicle' && vehicle = {:vid}",
    "-created", 1, 0,
    { vid: vehicle.id },
  )

  let shouldCreate = true
  if (lastVehicleAccess.length > 0) {
    const last    = lastVehicleAccess[0]
    const elapsed = (Date.now() - new Date(last.getString("created")).getTime()) / 1000
    const lastDirection = getGateDirectionById(last.getString("gate"))

    if (direction === "checkpoint") {
      // Prevent duplicate checkpoint spam from the same gate in short bursts.
      if (elapsed < MIN_STAY_SEC && last.getString("gate") === gate.id) {
        shouldCreate = false
      }
    } else if (elapsed < MIN_STAY_SEC || lastDirection === direction) {
      shouldCreate = false
    }
  } else if (direction === "out") {
    // First-ever event for this vehicle must be an entry
    shouldCreate = false
  }

  if (!shouldCreate) {
    return e.json(200, { message: "access suppressed (min_stay or duplicate)" })
  }

  // 4. Create vehicle access
  const accessesCol = $app.findCollectionByNameOrId("accesses")
  const vehicleAccess = new Record(accessesCol)
  vehicleAccess.set("access_type", "vehicle")
  vehicleAccess.set("vehicle",     vehicle.id)
  vehicleAccess.set("gate",      gate.id)
  vehicleAccess.set("did_leave",   direction === "out")
  vehicleAccess.set("deletable",   false)
  vehicleAccess.set("enabled",     true)

  // Snapshot the owner at event time — survives ownership transfers
  const ownerId = vehicle.getString("owner")
  if (ownerId) {
    vehicleAccess.set("made_by_user", ownerId)
    vehicleAccess.set("driver_user", ownerId)
  }

  $app.save(vehicleAccess)

  // Close the previous vehicle access on exit
  if (direction === "out" && lastVehicleAccess.length > 0) {
    const prev = lastVehicleAccess[0]
    prev.set("did_leave",        true)
    prev.set("closed_by_access", vehicleAccess.id)
    $app.save(prev)
  }

  // 5. User access for vehicle owner
  if (ownerId && direction !== "checkpoint") {
    createUserAccess(ownerId, gate)
  }

  return e.json(200, {
    access_id: vehicleAccess.id,
    vehicle_number: vehicle.getString("number"),
    direction,
  })
}, $apis.requireAuth())

/**
 * Creates a user access record applying the same business rules as
 * the original create-from-ftp.js:
 *  - Skip if within min-stay window
 *  - Skip if same gate direction as the last access (prevent duplicate in/in or out/out)
 *  - First-ever access must be direction "in"
 *  - On exit, mark the previous access as closed
 */
function createUserAccess(userId, gate) {
  const MIN_STAY_SEC = 30
  const direction = normalizeGateDirection(gate.getString("direction"))

  if (direction === "checkpoint") {
    return
  }

  const lastUserAccess = $app.findRecordsByFilter(
    "accesses",
    "access_type = 'user' && user = {:uid}",
    "-created", 1, 0,
    { uid: userId },
  )

  if (lastUserAccess.length > 0) {
    const last    = lastUserAccess[0]
    const elapsed = (Date.now() - new Date(last.getString("created")).getTime()) / 1000
    const lastDirection = getGateDirectionById(last.getString("gate"))
    if (elapsed < MIN_STAY_SEC || lastDirection === direction) {
      return
    }
  } else if (direction !== "in") {
    return
  }

  const col = $app.findCollectionByNameOrId("accesses")
  const rec = new Record(col)
  rec.set("access_type", "user")
  rec.set("user",        userId)
  rec.set("gate",      gate.id)
  rec.set("did_leave",   direction === "out")
  rec.set("deletable",   false)  // system-generated — operators cannot delete
  rec.set("enabled",     true)
  $app.save(rec)

  if (direction === "out" && lastUserAccess.length > 0) {
    const prev = lastUserAccess[0]
    prev.set("did_leave",        true)
    prev.set("closed_by_access", rec.id)
    $app.save(prev)
  }
}

function getGateDirectionById(gateId) {
  if (!gateId) return ""

  const cams = $app.findRecordsByFilter(
    "gates",
    "id = {:cid}",
    "", 1, 0,
    { cid: gateId },
  )

  if (cams.length === 0) return ""
  return normalizeGateDirection(cams[0].getString("direction"))
}

function normalizeGateDirection(rawDirection) {
  if (rawDirection === "out") return "out"
  if (rawDirection === "checkpoint") return "checkpoint"
  return "in"
}
