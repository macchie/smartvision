/// <reference path="../../pb_data/types.d.ts" />

/**
 * gate_trigger_engine.js
 *
 * Folder-watch engine for gate_triggers of type "folder_watch".
 *
 * Loaded with require() from inside the cron callback in
 * pb_hooks/gate_triggers.pb.js (PocketBase runs cron/route callbacks in pooled
 * JSVM contexts, so engine logic lives in this required module). Every exported
 * entry point receives the live `$app` so it never leans on hook-scope globals.
 *
 * Flow per enabled folder_watch trigger whose gate is enabled:
 *   1. Scan watch_folder for files matching the configured extensions.
 *   2. Extract the plate from the filename via plate_regex.
 *   3. Find or auto-create the vehicle, then record a gate access applying the
 *      same min-stay / direction-alternation guards as /api/gate-event.
 *   4. Dispose of the file (delete, or move to processed_folder) so it is not
 *      reprocessed on the next tick.
 */

const MIN_STAY_SEC = 30
const DEFAULT_EXTENSIONS = ["jpg", "jpeg", "png", "bmp"]

// Programmatic $app.save() does NOT trigger the onRecordCreateRequest audit hook
// in lifecycle_hooks.pb.js, so engine-created records must stamp created_at /
// updated_at themselves (the min-stay guard and dashboard rely on created_at).
function nowStamp() {
  return new Date().toISOString().replace("T", " ")
}

function stampNew(record) {
  const now = nowStamp()
  try { record.set("created_at", now) } catch (_) { /* field may be absent */ }
  try { record.set("updated_at", now) } catch (_) { /* field may be absent */ }
}

function stampUpdate(record) {
  try { record.set("updated_at", nowStamp()) } catch (_) { /* field may be absent */ }
}

function processFolderTriggers($app) {
  let triggers = []
  try {
    triggers = $app.findRecordsByFilter(
      "gate_triggers",
      "type = 'folder_watch' && enabled = true",
      "",
      500,
      0,
    )
  } catch (err) {
    console.error("[gate-trigger] failed to load folder triggers:", err)
    return
  }

  const total = triggers ? (triggers.length || 0) : 0
  for (let i = 0; i < total; i++) {
    try {
      processOneFolderTrigger($app, triggers[i])
    } catch (err) {
      console.error("[gate-trigger] folder trigger failed:", err)
    }
  }
}

function processOneFolderTrigger($app, trigger) {
  const folder = (trigger.getString("watch_folder") || "").trim()
  if (!folder) {
    return
  }

  const gateId = trigger.getString("gate")
  if (!gateId) {
    return
  }

  let gate
  try {
    gate = $app.findRecordById("gates", gateId)
  } catch (_) {
    return
  }
  if (!gate || gate.getBool("enabled") === false) {
    return
  }

  const extensions = parseExtensions(trigger.getString("file_extensions"))
  const regex = buildPlateRegex(trigger.getString("plate_regex"))
  const action = trigger.getString("processed_action") || "delete"
  const processedFolder = (trigger.getString("processed_folder") || "").trim()

  let entries
  try {
    entries = $os.readDir(folder)
  } catch (err) {
    console.error("[gate-trigger] failed to read folder", folder, err)
    return
  }

  const count = entries ? (entries.length || 0) : 0
  for (let i = 0; i < count; i++) {
    const entry = entries[i]
    try {
      if (entry.isDir()) {
        continue
      }
    } catch (_) {
      // some runtimes expose IsDir(); fall through and treat as a file
    }

    const name = entry.name ? entry.name() : String(entry)
    if (!name) {
      continue
    }

    if (extensions.length > 0 && extensions.indexOf(fileExtension(name)) === -1) {
      continue
    }

    const fullPath = $filepath.join(folder, name)
    try {
      const plate = extractPlate(regex, name)
      if (plate) {
        processPlateDetection($app, gate, plate)
      } else {
        console.warn("[gate-trigger] no plate extracted from filename:", name)
      }
    } catch (err) {
      console.error("[gate-trigger] failed to process file", name, err)
    } finally {
      disposeFile(fullPath, name, action, processedFolder)
    }
  }
}

/**
 * Records a vehicle access (and owner user access) for a detected plate,
 * mirroring the business rules in pb_hooks/gate_events.pb.js.
 */
function processPlateDetection($app, gate, plateNumber) {
  const direction = normalizeGateDirection(gate.getString("direction"))

  // Find or auto-create the vehicle by plate.
  let vehicle
  let created = false
  const vehicles = $app.findRecordsByFilter(
    "vehicles",
    "number = {:num}",
    "-created_at", 1, 0,
    { num: plateNumber },
  )
  if (!vehicles || vehicles.length === 0) {
    const vehiclesCol = $app.findCollectionByNameOrId("vehicles")
    vehicle = new Record(vehiclesCol)
    vehicle.set("number", plateNumber)
    vehicle.set("enabled", true)
    stampNew(vehicle)
    $app.save(vehicle)
    created = true
  } else {
    vehicle = vehicles[0]
  }

  // Min-stay + direction-alternation guard.
  const lastVehicleAccess = $app.findRecordsByFilter(
    "accesses",
    "access_type = 'vehicle' && vehicle = {:vid}",
    "-created_at", 1, 0,
    { vid: vehicle.id },
  )

  let shouldCreate = true
  if (lastVehicleAccess.length > 0) {
    const last = lastVehicleAccess[0]
    const elapsed = (Date.now() - new Date(last.getString("created_at")).getTime()) / 1000
    const lastDirection = getGateDirectionById($app, last.getString("gate"))

    if (direction === "checkpoint") {
      if (elapsed < MIN_STAY_SEC && last.getString("gate") === gate.id) {
        shouldCreate = false
      }
    } else if (elapsed < MIN_STAY_SEC || lastDirection === direction) {
      shouldCreate = false
    }
  } else if (direction === "out") {
    shouldCreate = false
  }

  if (!shouldCreate) {
    return { status: "suppressed", vehicle_number: plateNumber, direction, vehicle_created: created }
  }

  const accessesCol = $app.findCollectionByNameOrId("accesses")
  const vehicleAccess = new Record(accessesCol)
  vehicleAccess.set("access_type", "vehicle")
  vehicleAccess.set("vehicle", vehicle.id)
  vehicleAccess.set("gate", gate.id)
  vehicleAccess.set("did_leave", direction === "out")
  vehicleAccess.set("deletable", false)
  vehicleAccess.set("enabled", true)

  const ownerId = vehicle.getString("owner")
  if (ownerId) {
    vehicleAccess.set("made_by_user", ownerId)
    vehicleAccess.set("driver_user", ownerId)
  }

  stampNew(vehicleAccess)
  $app.save(vehicleAccess)

  if (direction === "out" && lastVehicleAccess.length > 0) {
    const prev = lastVehicleAccess[0]
    prev.set("did_leave", true)
    prev.set("closed_by_access", vehicleAccess.id)
    stampUpdate(prev)
    $app.save(prev)
  }

  if (ownerId && direction !== "checkpoint") {
    createUserAccess($app, ownerId, gate)
  }

  return {
    status: "created",
    access_id: vehicleAccess.id,
    vehicle_number: vehicle.getString("number"),
    direction,
    vehicle_created: created,
  }
}

/**
 * Entry point for the /api/gate-event route: resolves the gate by its external
 * gate_id, normalizes the plate, then records the access. Kept here (in a
 * required module) because route handlers run in isolated JSVM contexts and
 * cannot call functions declared in the route file's own module scope.
 */
function handleGateEvent($app, gateExternalId, plateNumber) {
  const plate = normalizePlate(plateNumber)
  if (!plate) {
    return { status: "invalid_plate" }
  }

  const gates = $app.findRecordsByFilter(
    "gates",
    "gate_id = {:cid} && enabled = true",
    "", 1, 0,
    { cid: gateExternalId },
  )
  if (!gates || gates.length === 0) {
    return { status: "gate_not_found" }
  }

  return processPlateDetection($app, gates[0], plate)
}

function createUserAccess($app, userId, gate) {
  const direction = normalizeGateDirection(gate.getString("direction"))
  if (direction === "checkpoint") {
    return
  }

  const lastUserAccess = $app.findRecordsByFilter(
    "accesses",
    "access_type = 'user' && user = {:uid}",
    "-created_at", 1, 0,
    { uid: userId },
  )

  if (lastUserAccess.length > 0) {
    const last = lastUserAccess[0]
    const elapsed = (Date.now() - new Date(last.getString("created_at")).getTime()) / 1000
    const lastDirection = getGateDirectionById($app, last.getString("gate"))
    if (elapsed < MIN_STAY_SEC || lastDirection === direction) {
      return
    }
  } else if (direction !== "in") {
    return
  }

  const col = $app.findCollectionByNameOrId("accesses")
  const rec = new Record(col)
  rec.set("access_type", "user")
  rec.set("user", userId)
  rec.set("gate", gate.id)
  rec.set("did_leave", direction === "out")
  rec.set("deletable", false)
  rec.set("enabled", true)
  stampNew(rec)
  $app.save(rec)

  if (direction === "out" && lastUserAccess.length > 0) {
    const prev = lastUserAccess[0]
    prev.set("did_leave", true)
    prev.set("closed_by_access", rec.id)
    stampUpdate(prev)
    $app.save(prev)
  }
}

function getGateDirectionById($app, gateId) {
  if (!gateId) {
    return ""
  }
  try {
    const gate = $app.findRecordById("gates", gateId)
    return normalizeGateDirection(gate.getString("direction"))
  } catch (_) {
    return ""
  }
}

function normalizeGateDirection(rawDirection) {
  if (rawDirection === "out") return "out"
  if (rawDirection === "checkpoint") return "checkpoint"
  return "in"
}

function parseExtensions(raw) {
  const s = (raw || "").trim()
  if (!s) {
    return DEFAULT_EXTENSIONS.slice()
  }
  return s
    .split(",")
    .map((x) => x.trim().toLowerCase().replace(/^\./, ""))
    .filter((x) => x.length > 0)
}

function fileExtension(name) {
  const dot = name.lastIndexOf(".")
  if (dot < 0) {
    return ""
  }
  return name.substring(dot + 1).toLowerCase()
}

function buildPlateRegex(pattern) {
  const p = (pattern || "").trim()
  if (!p) {
    return /([A-Z0-9]{4,10})/i
  }
  try {
    return new RegExp(p, "i")
  } catch (err) {
    console.error("[gate-trigger] invalid plate_regex, using default:", p, err)
    return /([A-Z0-9]{4,10})/i
  }
}

function extractPlate(regex, source) {
  const match = regex.exec(source)
  if (!match) {
    return ""
  }
  const raw = (match[1] !== undefined && match[1] !== null) ? match[1] : match[0]
  return normalizePlate(raw)
}

function normalizePlate(raw) {
  return String(raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "")
}

function disposeFile(fullPath, name, action, processedFolder) {
  try {
    if (action === "move" && processedFolder) {
      try {
        $os.mkdirAll(processedFolder, 0o755)
      } catch (_) {
        // directory may already exist
      }
      const dst = $filepath.join(processedFolder, Date.now() + "_" + name)
      $os.rename(fullPath, dst)
    } else {
      $os.remove(fullPath)
    }
  } catch (err) {
    console.error("[gate-trigger] failed to dispose file", fullPath, err)
  }
}

module.exports = {
  processFolderTriggers,
  handleGateEvent,
}
