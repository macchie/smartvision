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

function createDemoAccessEvent() {
    try {
        const startedAt = new Date().toISOString()
        const inCameras = $app.findRecordsByFilter("cameras", "enabled = true && direction = 'in'", "", 1000, 0)
        const outCameras = $app.findRecordsByFilter("cameras", "enabled = true && direction = 'out'", "", 1000, 0)
        const allCameras = $app.findRecordsByFilter("cameras", "enabled = true", "", 1000, 0)
        const enabledUsers = $app.findRecordsByFilter("users", "enabled = true", "", 1000, 0)
        const enabledVehicles = $app.findRecordsByFilter("vehicles", "enabled = true", "", 1000, 0)

        console.log(
            "[demo scheduler] tick",
            JSON.stringify({
                at: startedAt,
                counts: {
                    inCameras: inCameras.length,
                    outCameras: outCameras.length,
                    allCameras: allCameras.length,
                    enabledUsers: enabledUsers.length,
                    enabledVehicles: enabledVehicles.length,
                },
            }),
        )

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

        const actor = $app.findRecordsByFilter("users", "role = 'admin' && enabled = true", "", 1, 0)
        const actorId = actor.length > 0 ? actor[0].id : ""

        const accessesCollection = $app.findCollectionByNameOrId("accesses")
        const accessRecord = new Record(accessesCollection)
        const now = new Date().toISOString()

        if (createVehicleAccess) {
            const vehicle = pickRandom(enabledVehicles)
            if (!vehicle) {
                console.log("[demo scheduler] skipped: vehicle branch selected but no vehicle was picked")
                return null
            }

            const openAccess = getOpenAccessForSubject("vehicle", "vehicle", vehicle.id)
            const shouldLeave = !!openAccess
            const preferredCameras = shouldLeave ? outCameras : inCameras
            const camera = pickRandom(preferredCameras.length > 0 ? preferredCameras : allCameras)
            if (!camera) {
                console.log("[demo scheduler] skipped: no camera available for vehicle branch")
                return null
            }

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

            const previous = getLatestAccessForSubject("vehicle", "vehicle", vehicle.id)
            const previousId = previous ? previous.id : ""

            console.log(
                "[demo scheduler] vehicle state",
                JSON.stringify({
                    vehicleId: vehicle.id,
                    previousAccessId: previousId,
                    openAccessId: openAccess ? openAccess.id : "",
                    action: shouldLeave ? "egress" : "ingress",
                }),
            )

            $app.save(accessRecord)

            if (shouldLeave && openAccess) {
                openAccess.set("did_leave", true)
                openAccess.set("closed_by_access", accessRecord.id)
                $app.save(openAccess)
            }
        } else {
            const user = pickRandom(enabledUsers)
            if (!user) {
                console.log("[demo scheduler] skipped: user branch selected but no user was picked")
                return null
            }

            const openAccess = getOpenAccessForSubject("user", "user", user.id)
            const shouldLeave = !!openAccess
            const preferredCameras = shouldLeave ? outCameras : inCameras
            const camera = pickRandom(preferredCameras.length > 0 ? preferredCameras : allCameras)
            if (!camera) {
                console.log("[demo scheduler] skipped: no camera available for user branch")
                return null
            }

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

            const previous = getLatestAccessForSubject("user", "user", user.id)
            const previousId = previous ? previous.id : ""

            console.log(
                "[demo scheduler] user state",
                JSON.stringify({
                    userId: user.id,
                    previousAccessId: previousId,
                    openAccessId: openAccess ? openAccess.id : "",
                    action: shouldLeave ? "egress" : "ingress",
                }),
            )

            $app.save(accessRecord)

            if (shouldLeave && openAccess) {
                openAccess.set("did_leave", true)
                openAccess.set("closed_by_access", accessRecord.id)
                $app.save(openAccess)
            }
        }

        console.log(
            "[demo scheduler] created demo access",
            JSON.stringify({
                id: accessRecord.id,
                accessType: accessRecord.getString("access_type") || "",
                userId: accessRecord.getString("user") || "",
                vehicleId: accessRecord.getString("vehicle") || "",
                cameraId: accessRecord.getString("camera") || "",
                didLeave: accessRecord.getBool("did_leave"),
                reason: accessRecord.getString("reason") || "",
                at: new Date().toISOString(),
            }),
        )
        return accessRecord.id
    } catch (err) {
        console.error("[demo scheduler] failed to create demo access event:", err)
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
