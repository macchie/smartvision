function isDemoDataEnabled() {
    const raw = ($os.getenv("DEMO_DATA") || "").toUpperCase()
    return raw === "TRUE" || raw === "1" || raw === "YES" || raw === "ON"
}

function pickRandom(items) {
    if (!items || items.length === 0) return null
    const index = Math.floor(Math.random() * items.length)
    return items[index]
}

function getLatestAccessForSubject(accessType, relationField, subjectId) {
    if (!subjectId) return null

    const filter = "access_type = {:type} && " + relationField + " = {:subject} && enabled = true"
    const records = $app.findRecordsByFilter(
        "accesses",
        filter,
        "",
        200,
        0,
        { type: accessType, subject: subjectId },
    )

    if (records.length === 0) return null

    let latest = records[0]
    let latestTs = Date.parse(latest.getString("created") || latest.getString("updated") || "") || 0
    for (let i = 1; i < records.length; i++) {
        const rec = records[i]
        const ts = Date.parse(rec.getString("created") || rec.getString("updated") || "") || 0
        if (ts > latestTs) {
            latest = rec
            latestTs = ts
        }
    }

    return latest
}

function getOpenAccessForSubject(accessType, relationField, subjectId) {
    if (!subjectId) return null

    const filter = "access_type = {:type} && " + relationField + " = {:subject} && enabled = true && did_leave = false"
    const records = $app.findRecordsByFilter(
        "accesses",
        filter,
        "",
        200,
        0,
        { type: accessType, subject: subjectId },
    )

    if (records.length === 0) return null

    let latest = records[0]
    let latestTs = Date.parse(latest.getString("created") || latest.getString("updated") || "") || 0
    for (let i = 1; i < records.length; i++) {
        const rec = records[i]
        const ts = Date.parse(rec.getString("created") || rec.getString("updated") || "") || 0
        if (ts > latestTs) {
            latest = rec
            latestTs = ts
        }
    }

    return latest
}

function getAllOpenAccessesForSubject(accessType, relationField, subjectId) {
    if (!subjectId) return []

    const filter = "access_type = {:type} && " + relationField + " = {:subject} && enabled = true && did_leave = false"
    return $app.findRecordsByFilter(
        "accesses",
        filter,
        "",
        200,
        0,
        { type: accessType, subject: subjectId },
    )
}

function getLatestKeyDistributeEvent(roomId) {
    if (!roomId) return null

    const filter = "room = {:room} && is_collecting = true && did_return_key = false && enabled = true"
    const records = $app.findRecordsByFilter(
        "room_key_events",
        filter,
        "-created",
        1,
        0,
        { room: roomId },
    )

    return records.length > 0 ? records[0] : null
}

function notifyCollectionUpdate(collectionName, recordId) {
    try {
        const broker = $app.subscriptionsBroker()
        const clients = broker.clients()
        const payload = JSON.stringify({
            action: "update",
            record: {
                id: recordId || "",
            },
        })

        for (const clientId in clients) {
            const client = clients[clientId]
            if (!client || client.isDiscarded()) {
                continue
            }

            const subscriptions = client.subscriptions(collectionName + "/")
            for (const topic in subscriptions) {
                client.send(new SubscriptionMessage({
                    name: topic,
                    data: payload,
                }))
            }
        }
    } catch (err) {
        console.error("[demo scheduler] failed to broadcast realtime update for " + collectionName + ":", err)
    }
}

function createDemoAccessEvent() {
    try {
        const startedAt = new Date().toISOString()
        const inCameras = $app.findRecordsByFilter("cameras", "enabled = true && direction = 'in'", "", 1000, 0)
        const outCameras = $app.findRecordsByFilter("cameras", "enabled = true && direction = 'out'", "", 1000, 0)
        const checkpointCameras = $app.findRecordsByFilter("cameras", "enabled = true && direction = 'checkpoint'", "", 1000, 0)
        const allCameras = $app.findRecordsByFilter("cameras", "enabled = true", "", 1000, 0)
        const enabledUsers = $app.findRecordsByFilter("users", "enabled = true", "", 1000, 0)
        const enabledEmployees = $app.findRecordsByFilter("users", "enabled = true && user_type = 'employee'", "", 1000, 0)
        const enabledVehicles = $app.findRecordsByFilter("vehicles", "enabled = true", "", 1000, 0)
        const enabledRooms = $app.findRecordsByFilter("rooms", "enabled = true", "", 1000, 0)

        console.log(
            "[demo scheduler] tick",
            JSON.stringify({
                at: startedAt,
                counts: {
                    inCameras: inCameras.length,
                    outCameras: outCameras.length,
                    checkpointCameras: checkpointCameras.length,
                    allCameras: allCameras.length,
                    enabledUsers: enabledUsers.length,
                    enabledEmployees: enabledEmployees.length,
                    enabledVehicles: enabledVehicles.length,
                    enabledRooms: enabledRooms.length,
                },
            }),
        )

        const roll = Math.random()
        const actor = $app.findRecordsByFilter("users", "role = 'admin' && enabled = true", "", 1, 0)
        const actorId = actor.length > 0 ? actor[0].id : ""
        const now = new Date().toISOString()

        // 20% chance to generate a room key event
        if (roll < 0.2 && enabledRooms.length > 0 && enabledEmployees.length > 0) {
            const room = pickRandom(enabledRooms)
            const openDistribute = getLatestKeyDistributeEvent(room.id)
            const shouldCollect = !!openDistribute
            const employee = shouldCollect ? $app.findRecordById("users", openDistribute.getString("user")) : pickRandom(enabledEmployees)

            if (!employee) return null

            const keyEventsCol = $app.findCollectionByNameOrId("room_key_events")
            const keyRecord = new Record(keyEventsCol)

            keyRecord.set("room", room.id)
            keyRecord.set("user", employee.id)
            keyRecord.set("is_collecting", !shouldCollect)
            keyRecord.set("did_return_key", shouldCollect)
            keyRecord.set("reason", shouldCollect ? "Demo: returning key" : "Demo: collecting key")
            keyRecord.set("enabled", true)
            keyRecord.set("created_at", now)
            keyRecord.set("updated_at", now)

            $app.save(keyRecord)

            if (shouldCollect && openDistribute) {
                openDistribute.set("did_return_key", true)
                openDistribute.set("return_key_event", keyRecord.id)
                $app.save(openDistribute)
            }

            notifyCollectionUpdate("room_key_events", keyRecord.id)

            console.log("[demo scheduler] created room key event", JSON.stringify({
                id: keyRecord.id,
                room: room.getString("number"),
                employee: employee.getString("username"),
                action: shouldCollect ? "return" : "collect"
            }))
            return keyRecord.id
        }

        // 15% chance to generate a checkpoint event for a vehicle already inside
        if (roll >= 0.2 && roll < 0.35 && checkpointCameras.length > 0 && enabledVehicles.length > 0) {
            const vehiclesInside = enabledVehicles.filter(v => !!getOpenAccessForSubject("vehicle", "vehicle", v.id))
            if (vehiclesInside.length > 0) {
                const vehicle = pickRandom(vehiclesInside)
                const camera = pickRandom(checkpointCameras)
                if (vehicle && camera) {
                    const accessesCollection = $app.findCollectionByNameOrId("accesses")
                    const accessRecord = new Record(accessesCollection)
                    
                    accessRecord.set("access_type", "vehicle")
                    accessRecord.set("vehicle", vehicle.id)
                    const ownerId = vehicle.getString("owner") || ""
                    if (ownerId) {
                        accessRecord.set("driver_user", ownerId)
                    }
                    accessRecord.set("camera", camera.id)
                    accessRecord.set("did_leave", false)
                    accessRecord.set("deletable", true)
                    if (actorId) {
                        accessRecord.set("made_by_user", actorId)
                    }
                    accessRecord.set("reason", "Demo scheduled vehicle checkpoint")
                    accessRecord.set("enabled", true)
                    accessRecord.set("created_at", now)
                    accessRecord.set("updated_at", now)

                    $app.save(accessRecord)
                    notifyCollectionUpdate("accesses", accessRecord.id)

                    console.log("[demo scheduler] created checkpoint event", JSON.stringify({
                        id: accessRecord.id,
                        vehicle: vehicle.getString("number"),
                        camera: camera.getString("name")
                    }))
                    return accessRecord.id
                }
            }
        }

        // Existing access event logic (slightly adapted for variety)
        if (allCameras.length === 0) {
            console.log("[demo scheduler] skipped: no enabled cameras")
            return null
        }

        if (enabledUsers.length === 0 && enabledVehicles.length === 0) {
            console.log("[demo scheduler] skipped: no enabled users or vehicles")
            return null
        }

        const canCreateVehicle = enabledVehicles.length > 0
        const createVehicleAccess = canCreateVehicle && (enabledUsers.length === 0 || Math.random() >= 0.5)

        const accessesCollection = $app.findCollectionByNameOrId("accesses")
        const accessRecord = new Record(accessesCollection)

        if (createVehicleAccess) {
            const vehicle = pickRandom(enabledVehicles)
            if (!vehicle) return null

            const openAccesses = getAllOpenAccessesForSubject("vehicle", "vehicle", vehicle.id)
            const openAccess = getOpenAccessForSubject("vehicle", "vehicle", vehicle.id)
            const shouldLeave = openAccesses.length > 0
            const preferredCameras = shouldLeave ? outCameras : inCameras
            const camera = pickRandom(preferredCameras)
            if (!camera) return null

            accessRecord.set("access_type", "vehicle")
            accessRecord.set("vehicle", vehicle.id)
            const ownerId = vehicle.getString("owner") || ""
            if (ownerId) {
                accessRecord.set("driver_user", ownerId)
            }
            accessRecord.set("camera", camera.id)
            accessRecord.set("did_leave", shouldLeave)
            accessRecord.set("deletable", true)
            if (actorId) {
                accessRecord.set("made_by_user", actorId)
            }
            accessRecord.set("reason", shouldLeave ? "Demo scheduled vehicle egress" : "Demo scheduled vehicle ingress")
            accessRecord.set("enabled", true)
            accessRecord.set("created_at", now)
            accessRecord.set("updated_at", now)

            $app.save(accessRecord)
            notifyCollectionUpdate("accesses", accessRecord.id)

            if (shouldLeave && openAccesses.length > 0) {
                for (const oa of openAccesses) {
                    oa.set("did_leave", true)
                    oa.set("closed_by_access", accessRecord.id)
                    $app.save(oa)
                }
            }
        } else {
            const user = pickRandom(enabledUsers)
            if (!user) return null

            const openAccesses = getAllOpenAccessesForSubject("user", "user", user.id)
            const openAccess = getOpenAccessForSubject("user", "user", user.id)
            const shouldLeave = openAccesses.length > 0
            const preferredCameras = shouldLeave ? outCameras : inCameras
            const camera = pickRandom(preferredCameras)
            if (!camera) return null

            accessRecord.set("access_type", "user")
            accessRecord.set("user", user.id)
            accessRecord.set("camera", camera.id)
            accessRecord.set("did_leave", shouldLeave)
            accessRecord.set("deletable", true)
            if (actorId) {
                accessRecord.set("made_by_user", actorId)
            }
            accessRecord.set("reason", shouldLeave ? "Demo scheduled person egress" : "Demo scheduled person ingress")
            accessRecord.set("enabled", true)
            accessRecord.set("created_at", now)
            accessRecord.set("updated_at", now)

            $app.save(accessRecord)
            notifyCollectionUpdate("accesses", accessRecord.id)

            if (shouldLeave && openAccesses.length > 0) {
                for (const oa of openAccesses) {
                    oa.set("did_leave", true)
                    oa.set("closed_by_access", accessRecord.id)
                    $app.save(oa)
                }
            }
        }
        return accessRecord.id
    } catch (err) {
        console.error("[demo scheduler] failed to create demo event:", err)
        return null
    }
}


function runDemoSchedulerTick() {
    const demoDataRaw = $os.getenv("DEMO_DATA") || ""
    const enabled = isDemoDataEnabled()

    console.log(
        "[demo scheduler] cron tick",
        JSON.stringify({
            at: new Date().toISOString(),
            demoDataRaw: demoDataRaw,
            demoDataEnabled: enabled,
        }),
    )

    if (!enabled) {
        console.log("[demo scheduler] tick skipped because DEMO_DATA is disabled")
        return null
    }

    return createDemoAccessEvent()
}

module.exports = {
    runDemoSchedulerTick: runDemoSchedulerTick,
}
