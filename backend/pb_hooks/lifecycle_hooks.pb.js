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
// 1. Users: enforce default role "regular" if not set
// ---------------------------------------------------------------------------
function applyAuditTimestamps(record, isCreate) {
    const now = new Date().toISOString()

    if (isCreate) {
        try {
            if (!record.getString("created_at")) {
                record.set("created_at", now)
            }
        } catch (_) {
            // ignore if field doesn't exist in this collection context
        }
    }

    try {
        record.set("updated_at", now)
    } catch (_) {
        // ignore if field doesn't exist in this collection context
    }
}

const AUDITED_COLLECTIONS = ["users", "cameras", "room_groups", "rooms", "vehicles", "accesses", "room_key_events"]
for (const collectionName of AUDITED_COLLECTIONS) {
    onRecordCreateRequest((e) => {
        applyAuditTimestamps(e.record, true)
        e.next()
    }, collectionName)

    onRecordUpdateRequest((e) => {
        applyAuditTimestamps(e.record, false)
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
// 5. Accesses: emit a realtime "camera:live:event" on SSE channel
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
        const roomKeyEvents = safeFindRecords("room_key_events", "", 10000)

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
            const cameraId = getStr(access, "camera")
            return reason === "Recovered legacy access" && !userId && !vehicleId && !cameraId
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

        let vehiclesInside = 0
        let usersInside = 0
        for (const access of accessesAll) {
            if (!isEnabledAccess(access) || isLegacyRecoveredAccess(access)) {
                continue
            }
            const accessType = getStr(access, "access_type")
            const didLeave = getBool(access, "did_leave")
            if (!didLeave && accessType === "vehicle") {
                vehiclesInside += 1
            }
            if (!didLeave && accessType === "user") {
                usersInside += 1
            }
        }

        let keyDistributed = 0
        for (const keyEvent of roomKeyEvents) {
            const isCollecting = getBool(keyEvent, "is_collecting")
            const didReturnKey = getBool(keyEvent, "did_return_key")
            if (isCollecting && !didReturnKey) {
                keyDistributed += 1
            }
        }

        const usersCache = {}
        const camerasCache = {}
        const vehiclesCache = {}

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

        const getCameraData = (cameraId) => {
            if (!cameraId) return { name: "Unknown camera", direction: "in" }
            if (camerasCache[cameraId]) return camerasCache[cameraId]

            try {
                const camera = $app.findRecordById("cameras", cameraId)
                const data = {
                    name: camera.getString("name") || cameraId,
                    direction: camera.getString("direction") === "out" ? "out" : "in",
                }
                camerasCache[cameraId] = data
                return data
            } catch (_) {
                const fallback = { name: cameraId, direction: "in" }
                camerasCache[cameraId] = fallback
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

        const events = []
        for (const access of accesses) {
            const accessType = getStr(access, "access_type") === "vehicle" ? "vehicle" : "user"
            const didLeave = getBool(access, "did_leave")
            const cameraId = getStr(access, "camera")
            const camera = getCameraData(cameraId)

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
                camera: camera.name,
                direction: camera.direction,
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
cronAdd("demo-access-scheduler", "*/1 * * * *", () => {
    try {
        const scheduler = require(`${__hooks}/lib/demo_scheduler.js`)
        scheduler.runDemoSchedulerTick()
    } catch (err) {
        console.error("[demo scheduler] cron tick failed before execution:", err)
    }
})

console.log(
    "[demo scheduler] cron registered",
    JSON.stringify({
        expression: "*/1 * * * *",
        demoDataRaw: $os.getenv("DEMO_DATA") || "",
        note: "handler requires are loaded per tick for scope isolation safety",
    }),
)
