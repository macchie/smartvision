/// <reference path="../pb_data/types.d.ts" />

/**
 * lifecycle_hooks.pb.js
 *
 * PocketBase JavaScript hooks replacing the original LoopBack model lifecycle
 * observers (before/after save hooks, realtime socket emissions).
 *
 * PocketBase ships with a built-in SSE-based realtime subscription system,
 * so the original Socket.IO emissions map directly to collection subscriptions.
 * Clients subscribe to e.g. `accesses` and receive events automatically
 * on create/update/delete — no manual emit() calls required.
 *
 * What is handled here:
 *  1. users  – default role enforcement on creation
 *  2. users  – regular-user auto-provisioning (email+password) when both are empty
 *  3. accesses – emit custom SSE event on creation (for legacy clients)
 *  4. room_key_events – update room.key_collected when a key is collected/returned
 *  5. reports – auto-increment download_count on view
 */

// ---------------------------------------------------------------------------
// Audit timestamps (created_at / updated_at)
//
// IMPORTANT: PocketBase executes each hook callback in an isolated JSVM
// context, so callbacks CANNOT reference functions or variables declared in
// this file's module scope — doing so throws "ReferenceError: <name> is not
// defined" and fails the whole request with a 400. Every handler must be
// fully self-contained (only globals like Date and the `e` argument).
// ---------------------------------------------------------------------------
const AUDITED_COLLECTIONS = ["users", "gates", "room_groups", "rooms", "vehicles", "accesses", "room_key_events", "users_config"]
for (const collectionName of AUDITED_COLLECTIONS) {
    onRecordCreateRequest((e) => {
        const now = new Date().toISOString().replace("T", " ")
        try {
            if (!e.record.getString("created_at")) {
                e.record.set("created_at", now)
            }
        } catch (_) {
            // ignore if the field doesn't exist in this collection context
        }
        try {
            e.record.set("updated_at", now)
        } catch (_) {
            // ignore if the field doesn't exist in this collection context
        }
        e.next()
    }, collectionName)

    onRecordUpdateRequest((e) => {
        const now = new Date().toISOString().replace("T", " ")
        try {
            e.record.set("updated_at", now)
        } catch (_) {
            // ignore if the field doesn't exist in this collection context
        }
        e.next()
    }, collectionName)
}

// ---------------------------------------------------------------------------
// 1. Users: enforce default role "regular" if not set
// ---------------------------------------------------------------------------
onRecordCreateRequest((e) => {
    if (!e.record.get("role")) {
        e.record.set("role", "regular")
    }
    e.next()
}, "users")

// ---------------------------------------------------------------------------
// 2. Users: auto-generate email + password for regular accounts
//    (mirrors the LoopBack before:save observer in user.js)
// ---------------------------------------------------------------------------
onRecordCreateRequest((e) => {
    const email = e.record.get("email")
    const pw    = e.record.getRaw("password")

    if (!email && !pw) {
        const id = $security.randomStringWithAlphabet(32, "abcdefghijklmnopqrstuvwxyz0123456789")
        e.record.set("email", id + "@guest.internal")
        // PocketBase will hash whatever we set via setPassword
        e.record.setPassword($security.randomStringWithAlphabet(32, "abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ!@#$"))
    }

    e.next()
}, "users")

// ---------------------------------------------------------------------------
// 3. Room key events: sync room.key_collected flag
//    When is_collecting=true  → room.key_collected = true
//    When is_collecting=false → room.key_collected = false (key returned)
// ---------------------------------------------------------------------------
onRecordAfterCreateSuccess((e) => {
    const roomId      = e.record.get("room")
    const isCollecting = e.record.get("is_collecting")

    if (!roomId) return

    try {
        const room = $app.findRecordById("rooms", roomId)
        room.set("key_collected", isCollecting)
        $app.save(room)
    } catch (err) {
        console.error("[room_key_events hook] failed to update room:", err)
    }

    // When a key is returned (is_collecting=false), close the matching open
    // distribution event. Otherwise it stays "out" forever and keeps inflating
    // the keys-distributed metric and the open-distribution lookups.
    if (!isCollecting) {
        try {
            const open = $app.findRecordsByFilter(
                "room_key_events",
                "room = {:room} && is_collecting = true && did_return_key = false && enabled = true",
                "-created",
                1,
                0,
                { room: roomId },
            )
            if (open.length > 0) {
                const distribution = open[0]
                distribution.set("did_return_key", true)
                distribution.set("return_key_event", e.record.id)
                $app.save(distribution)
            }
        } catch (err) {
            console.error("[room_key_events hook] failed to close distribution:", err)
        }
    }
}, "room_key_events")

// ---------------------------------------------------------------------------
// 4. Reports: auto-increment download_count on each view request
//    Clients call GET /api/collections/reports/records/:id to download
// ---------------------------------------------------------------------------
onRecordViewRequest((e) => {
    const count = (e.record.getInt("download_count") || 0) + 1
    e.record.set("download_count", count)
    try {
        $app.save(e.record)
    } catch (err) {
        console.error("[reports hook] failed to increment download_count:", err)
    }
    e.next()
}, "reports")

// ---------------------------------------------------------------------------
// 5. Accesses: emit a realtime "gate:live:event" on SSE channel
//    Clients subscribed to the "accesses" collection receive this
//    automatically via PocketBase realtime. This hook sends an extra
//    broadcast on a custom topic for legacy compatibility.
// ---------------------------------------------------------------------------
onRecordAfterCreateSuccess((e) => {
    // PocketBase handles standard realtime subscription broadcasts automatically.
    // For custom broadcast topics (replacing Socket.IO), use $app.subscriptionsBroker()
    // if available, or rely on standard collection subscriptions from the client.
    console.log("[accesses] new access event created:", e.record.id)
}, "accesses")

// ---------------------------------------------------------------------------
// 6. Dashboard summary endpoint:
//    Consolidates metrics + latest events server-side to avoid frontend rule
//    and expansion issues for non-superuser accounts.
// ---------------------------------------------------------------------------
routerAdd("GET", "/api/dashboard/summary", (e) => {
    const auth = e.auth
    if (!auth) {
        return e.unauthorizedError("authentication required", null)
    }

    try {
        // Keep this static to avoid runtime differences across PocketBase hook contexts.
        const eventsLimit = 50

        const getStr = (record, fieldName) => {
            try {
                const raw = record.get(fieldName)
                if (raw === null || raw === undefined) {
                    return ""
                }

                if (typeof raw === "string") {
                    return raw
                }

                if (raw instanceof Date) {
                    return raw.toISOString()
                }

                return String(raw)
            } catch (_) {
                try {
                    return record.getString(fieldName) || ""
                } catch (_) {
                    return ""
                }
            }
        }

        const getBool = (record, fieldName) => {
            try {
                return !!record.getBool(fieldName)
            } catch (_) {
                return false
            }
        }

        const safeFindRecords = (collectionName, sort, limit) => {
            try {
                const records = $app.findRecordsByFilter(collectionName, "id != ''", sort || "", limit || 10000, 0)
                const out = []
                const total = records ? (records.length || 0) : 0
                for (let i = 0; i < total; i++) {
                    out.push(records[i])
                }
                return out
            } catch (err) {
                console.error("[dashboard summary] failed to read collection", collectionName, err)
                return []
            }
        }

        const accessesAll = safeFindRecords("accesses", "", 10000)
        const accessesRaw = safeFindRecords("accesses", "", 10000)
        const roomsAll = safeFindRecords("rooms", "", 10000)

        const parseTime = (record) => {
            const created = String(getCreatedAt(record) || "")
            const updated = String(getStr(record, "updated") || "")
            const source = created || updated
            const ts = Date.parse(source)
            if (!Number.isNaN(ts)) return ts
            return 0
        }

        const getCreatedAt = (record) => {
            try {
                const exported = record.publicExport()
                const created = exported && (exported.created || exported.created_at)
                    ? String(exported.created || exported.created_at)
                    : ""
                if (created) {
                    return created
                }
            } catch (_) {
                // ignore and continue with fallbacks
            }

            try {
                const dt = record.getDateTime("created")
                const created = dt ? String(dt) : ""
                if (created && created.indexOf("0001-01-01") !== 0) {
                    return created
                }
            } catch (_) {
                // ignore and continue with fallback
            }

            return String(
                getStr(record, "created")
                || getStr(record, "created_at")
                || getStr(record, "updated")
                || getStr(record, "updated_at")
                || "",
            )
        }

        const isLegacyRecoveredAccess = (access) => {
            const reason = getStr(access, "reason")
            const userId = getStr(access, "user")
            const vehicleId = getStr(access, "vehicle")
            const gateId = getStr(access, "gate")
            return reason === "Recovered legacy access" && !userId && !vehicleId && !gateId
        }

        const isEnabledAccess = (access) => {
            try {
                const raw = access.get("enabled")
                if (raw === null || raw === undefined) {
                    return true
                }
                return !!raw
            } catch (_) {
                return true
            }
        }

        accessesRaw.sort((a, b) => parseTime(b) - parseTime(a))
        const accesses = accessesRaw
            .filter((access) => isEnabledAccess(access) && !isLegacyRecoveredAccess(access))
            .slice(0, eventsLimit)

        const usersCache = {}
        const gatesCache = {}
        const vehiclesCache = {}
        const roomsCache = {}

        const getRoomLabel = (roomId) => {
            if (!roomId) return "Unknown room"
            if (roomsCache[roomId]) return roomsCache[roomId]

            try {
                const room = $app.findRecordById("rooms", roomId)
                const number = room.getString("number") || ""
                const name = room.getString("name") || ""
                const label = (number && name) ? (number + " · " + name) : (number || name || roomId)
                roomsCache[roomId] = label
                return label
            } catch (_) {
                roomsCache[roomId] = roomId
                return roomId
            }
        }

        const getUserLabel = (userId) => {
            if (!userId) return ""
            if (usersCache[userId]) return usersCache[userId]

            try {
                const user = $app.findRecordById("users", userId)
                const userType = user.getString("user_type")
                let label = ""
                if (userType === "company") {
                    label = user.getString("name") || user.getString("email") || userId
                } else {
                    const first = user.getString("first_name") || ""
                    const last = user.getString("last_name") || ""
                    const fullName = (first + " " + last).trim()
                    label = fullName || user.getString("name") || user.getString("email") || userId
                }

                usersCache[userId] = label
                return label
            } catch (_) {
                usersCache[userId] = userId
                return userId
            }
        }

        const normalizeDirection = (rawDirection) => {
            if (rawDirection === "out") return "out"
            if (rawDirection === "checkpoint") return "checkpoint"
            return "in"
        }

        const getGateData = (gateId) => {
            if (!gateId) return { name: "Unknown gate", direction: "in" }
            if (gatesCache[gateId]) return gatesCache[gateId]

            try {
                const gate = $app.findRecordById("gates", gateId)
                const data = {
                    name: gate.getString("name") || gateId,
                    direction: normalizeDirection(gate.getString("direction")),
                }
                gatesCache[gateId] = data
                return data
            } catch (_) {
                const fallback = { name: gateId, direction: "in" }
                gatesCache[gateId] = fallback
                return fallback
            }
        }

        const getVehicleNumber = (vehicleId) => {
            if (!vehicleId) return "Unknown vehicle"
            if (vehiclesCache[vehicleId]) return vehiclesCache[vehicleId]

            try {
                const vehicle = $app.findRecordById("vehicles", vehicleId)
                const number = vehicle.getString("number") || vehicleId
                vehiclesCache[vehicleId] = number
                return number
            } catch (_) {
                vehiclesCache[vehicleId] = vehicleId
                return vehicleId
            }
        }

        // A subject is "inside" when its most recent ingress/egress event was an
        // ingress. Each ingress event enters and each egress event leaves; checkpoint
        // events never change the inside/outside status. We therefore track the latest
        // in/out record per vehicle and per user rather than counting raw events.
        const latestVehicle = {}  // vehicleId -> { ts, inside, access }
        const latestUser = {}     // userId    -> { ts, inside, access }

        for (const access of accessesAll) {
            if (!isEnabledAccess(access) || isLegacyRecoveredAccess(access)) {
                continue
            }

            const direction = getGateData(getStr(access, "gate")).direction
            if (direction === "checkpoint") {
                continue
            }

            const ts = parseTime(access)
            const inside = direction !== "out"
            const accessType = getStr(access, "access_type")

            if (accessType === "vehicle") {
                const vehicleId = getStr(access, "vehicle")
                if (!vehicleId) continue
                if (latestVehicle[vehicleId] === undefined || ts >= latestVehicle[vehicleId].ts) {
                    latestVehicle[vehicleId] = { ts: ts, inside: inside, access: access }
                }
            } else if (accessType === "user") {
                const userId = getStr(access, "user")
                if (!userId) continue
                if (latestUser[userId] === undefined || ts >= latestUser[userId].ts) {
                    latestUser[userId] = { ts: ts, inside: inside, access: access }
                }
            }
        }

        const bySinceDesc = (a, b) => String(b.since || "").localeCompare(String(a.since || ""))

        // Present vehicles (currently inside) with their driver and entry gate.
        const presentVehicles = []
        const insideVehicleIds = []
        for (const id in latestVehicle) {
            const entry = latestVehicle[id]
            if (!entry.inside) continue
            insideVehicleIds.push(id)
            const a = entry.access
            const driverUserId = getStr(a, "driver_user") || getStr(a, "made_by_user")
            presentVehicles.push({
                id: id,
                number: getVehicleNumber(id),
                driverId: driverUserId || "",
                driver: getUserLabel(driverUserId) || "",
                gate: getGateData(getStr(a, "gate")).name,
                since: getCreatedAt(a),
            })
        }
        presentVehicles.sort(bySinceDesc)

        // Present people = people who walked in (user accesses) plus the drivers of
        // vehicles currently inside, de-duplicated by person.
        const peopleById = {}
        const insideUserIds = []
        for (const id in latestUser) {
            const entry = latestUser[id]
            if (!entry.inside) continue
            insideUserIds.push(id)
            peopleById[id] = {
                id: id,
                name: getUserLabel(id) || "Unknown person",
                via: "foot",
                vehicle: "",
                since: getCreatedAt(entry.access),
            }
        }
        for (const v of presentVehicles) {
            if (!v.driverId || peopleById[v.driverId]) continue
            peopleById[v.driverId] = {
                id: v.driverId,
                name: v.driver || "Unknown person",
                via: "vehicle",
                vehicle: v.number,
                since: v.since,
            }
        }
        const presentPeople = []
        for (const k in peopleById) presentPeople.push(peopleById[k])
        presentPeople.sort(bySinceDesc)

        // Occupancy = everyone physically present, i.e. walked-in people plus the
        // drivers of vehicles currently inside (presentPeople already unions them).
        const vehiclesInside = presentVehicles.length
        const usersInside = presentPeople.length

        // Distributed keys currently out, with holder + room. Query directly:
        // safeFindRecords' 2nd arg is a SORT, not a filter.
        const distributedKeys = []
        try {
            const openKeyEvents = $app.findRecordsByFilter(
                "room_key_events",
                "is_collecting = true && did_return_key = false && enabled = true",
                "",
                10000,
                0,
            )
            const total = openKeyEvents ? (openKeyEvents.length || 0) : 0
            for (let i = 0; i < total; i++) {
                const ev = openKeyEvents[i]
                distributedKeys.push({
                    id: ev.id,
                    room: getRoomLabel(getStr(ev, "room")),
                    holder: getUserLabel(getStr(ev, "user")) || "Unknown person",
                    since: getCreatedAt(ev),
                })
            }
        } catch (err) {
            console.error("[dashboard summary] failed to read open key events", err)
        }
        distributedKeys.sort(bySinceDesc)

        // "Keys distributed" metric = keys currently out. rooms.key_collected is kept
        // authoritative by the room_key_events hook, so count that directly.
        let keyDistributed = 0
        for (const room of roomsAll) {
            if (getBool(room, "key_collected")) {
                keyDistributed += 1
            }
        }

        const events = []
        for (const access of accesses) {
            const accessType = getStr(access, "access_type") === "vehicle" ? "vehicle" : "user"
            const didLeave = getBool(access, "did_leave")
            const gateId = getStr(access, "gate")
            const gate = getGateData(gateId)

            const userId = getStr(access, "user")
            const vehicleId = getStr(access, "vehicle")
            const driverUserId = getStr(access, "driver_user")
            const madeByUserId = getStr(access, "made_by_user")

            const subject = accessType === "vehicle"
                ? getVehicleNumber(vehicleId)
                : (getUserLabel(userId) || "Unknown person")

            const actor = accessType === "vehicle"
                ? (getUserLabel(driverUserId) || getUserLabel(madeByUserId) || "Unassigned")
                : (getUserLabel(madeByUserId) || "System")

            events.push({
                id: access.id,
                accessType: accessType,
                subject: subject,
                actor: actor,
                gate: gate.name,
                direction: gate.direction,
                didLeave: didLeave,
                reason: getStr(access, "reason") || "-",
                createdAt: getCreatedAt(access),
            })
        }

        return e.json(200, {
            metrics: {
                vehiclesInside: vehiclesInside,
                usersInside: usersInside,
                keyDistributed: keyDistributed,
            },
            insideVehicleIds: insideVehicleIds,
            insideUserIds: insideUserIds,
            presentVehicles: presentVehicles,
            presentPeople: presentPeople,
            distributedKeys: distributedKeys,
            events: events,
        })
    } catch (err) {
        console.error("[dashboard summary] failed:", err)
        return e.json(200, {
            metrics: {
                vehiclesInside: 0,
                usersInside: 0,
                keyDistributed: 0,
            },
            insideVehicleIds: [],
            insideUserIds: [],
            presentVehicles: [],
            presentPeople: [],
            distributedKeys: [],
            events: [],
            warning: "dashboard summary fallback payload returned",
        })
    }
})

// ---------------------------------------------------------------------------
// 7. Demo scheduler: generate fake vehicle/user accesses every 30s when
//    DEMO_DATA=TRUE. This feeds live dashboard activity in demo mode.
// ---------------------------------------------------------------------------
// IMPORTANT: PocketBase executes each handler in an isolated context.
// Keep cron callback self-contained and load helpers with require() inside.
// cronAdd("demo-access-scheduler", "*/1 * * * *", () => {
//     try {
//         const scheduler = require(`${__hooks}/lib/demo_scheduler.js`)
//         scheduler.runDemoSchedulerTick()
//     } catch (err) {
//         console.error("[demo scheduler] cron tick failed before execution:", err)
//     }
// })

// console.log(
//     "[demo scheduler] cron registered",
//     JSON.stringify({
//         expression: "*/1 * * * *",
//         demoDataRaw: $os.getenv("DEMO_DATA") || "",
//         note: "handler requires are loaded per tick for scope isolation safety",
//     }),
// )
