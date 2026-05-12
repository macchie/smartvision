/// <reference path="../pb_data/types.d.ts" />

/**
 * camera_events.pb.js
 *
 * Custom route: POST /api/camera-event
 *
 * Replaces the original FTP server mechanism (SmartVisionLoopback/server/boot/ftp.js).
 * Cameras POST a JSON payload here when they detect a license plate.
 *
 * Request body:
 *   { "camera_id": "cam001", "plate_number": "AB123CD" }
 *
 * Business logic (mirrors create-from-ftp.js):
 *   1. Look up the camera by camera_id
 *   2. Find or auto-create the vehicle by plate_number
 *   3. Apply min-stay guard (30 s) and direction-alternation check
 *   4. Create a vehicle access record; close the previous one on exit
 *   5. Create a user access record for the vehicle owner
 */
routerAdd("POST", "/api/camera-event", (e) => {
  const body        = $apis.requestInfo(e).body
  const cameraId    = body?.camera_id    || ""
  const plateNumber = body?.plate_number || ""

  if (!cameraId || !plateNumber) {
    return e.badRequestError("camera_id and plate_number are required", null)
  }

  // 1. Find camera
  const cameras = $app.findRecordsByFilter(
    "cameras",
    "camera_id = {:cid} && enabled = true",
    "-created", 1, 0,
    { cid: cameraId },
  )
  if (cameras.length === 0) {
    return e.notFoundError("camera not found", null)
  }
  const camera    = cameras[0]
  const direction = camera.getString("direction")

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
    const lastDirection = getCameraDirectionById(last.getString("camera"))
    if (elapsed < MIN_STAY_SEC || lastDirection === direction) {
      shouldCreate = false
    }
  } else if (direction !== "in") {
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
  vehicleAccess.set("camera",      camera.id)
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
  if (ownerId) {
    createUserAccess(ownerId, camera)
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
 *  - Skip if same camera direction as the last access (prevent duplicate in/in or out/out)
 *  - First-ever access must be direction "in"
 *  - On exit, mark the previous access as closed
 */
function createUserAccess(userId, camera) {
  const MIN_STAY_SEC = 30
  const direction = camera.getString("direction")

  const lastUserAccess = $app.findRecordsByFilter(
    "accesses",
    "access_type = 'user' && user = {:uid}",
    "-created", 1, 0,
    { uid: userId },
  )

  if (lastUserAccess.length > 0) {
    const last    = lastUserAccess[0]
    const elapsed = (Date.now() - new Date(last.getString("created")).getTime()) / 1000
    const lastDirection = getCameraDirectionById(last.getString("camera"))
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
  rec.set("camera",      camera.id)
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

function getCameraDirectionById(cameraId) {
  if (!cameraId) return ""

  const cams = $app.findRecordsByFilter(
    "cameras",
    "id = {:cid}",
    "", 1, 0,
    { cid: cameraId },
  )

  if (cams.length === 0) return ""
  return cams[0].getString("direction")
}
