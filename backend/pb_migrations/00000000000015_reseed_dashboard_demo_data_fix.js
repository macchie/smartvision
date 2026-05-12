/// <reference path="../pb_data/types.d.ts" />

function isDemoDataEnabled() {
  const raw = ($os.getenv("DEMO_DATA") || "").toUpperCase()
  return raw === "TRUE"
}

function findBy(app, collection, predicate) {
  const records = app.findRecordsByFilter(collection, "id != ''", "", 10000, 0)
  for (const r of records) {
    if (predicate(r)) return r
  }
  return null
}

migrate((app) => {
  if (!isDemoDataEnabled()) {
    console.log("[demo reseed fix] DEMO_DATA is not TRUE - skipping")
    return
  }

  const usersCol = app.findCollectionByNameOrId("users")
  const camerasCol = app.findCollectionByNameOrId("cameras")
  const vehiclesCol = app.findCollectionByNameOrId("vehicles")
  const accessesCol = app.findCollectionByNameOrId("accesses")

  const tag = "demo_seed_v3"

  const admin = findBy(app, "users", (u) => u.getString("email") === "admin@smartvision.local")
  const actorId = admin ? admin.id : ""

  const personA = findBy(app, "users", (u) => u.getString("email") === "person.alice.demo@smartvision.local") || (() => {
    const u = new Record(usersCol)
    u.set("user_type", "person")
    u.set("first_name", "Alice")
    u.set("last_name", "Verdi")
    u.set("username", "alice_demo")
    u.set("email", "person.alice.demo@smartvision.local")
    u.set("emailVisibility", false)
    u.set("role", "regular")
    u.set("enabled", true)
    u.set("notes", tag)
    u.setPassword("Demo1234!")
    app.save(u)
    return u
  })()

  const personB = findBy(app, "users", (u) => u.getString("email") === "person.bruno.demo@smartvision.local") || (() => {
    const u = new Record(usersCol)
    u.set("user_type", "person")
    u.set("first_name", "Bruno")
    u.set("last_name", "Neri")
    u.set("username", "bruno_demo")
    u.set("email", "person.bruno.demo@smartvision.local")
    u.set("emailVisibility", false)
    u.set("role", "regular")
    u.set("enabled", true)
    u.set("notes", tag)
    u.setPassword("Demo1234!")
    app.save(u)
    return u
  })()

  let camIn = findBy(app, "cameras", (c) => c.getString("camera_id") === "demo-cam-in")
  if (!camIn) {
    camIn = new Record(camerasCol)
    camIn.set("name", "Demo Gate IN")
    camIn.set("camera_id", "demo-cam-in")
    camIn.set("direction", "in")
    camIn.set("enabled", true)
    camIn.set("notes", tag)
    app.save(camIn)
  }

  let camOut = findBy(app, "cameras", (c) => c.getString("camera_id") === "demo-cam-out")
  if (!camOut) {
    camOut = new Record(camerasCol)
    camOut.set("name", "Demo Gate OUT")
    camOut.set("camera_id", "demo-cam-out")
    camOut.set("direction", "out")
    camOut.set("enabled", true)
    camOut.set("notes", tag)
    app.save(camOut)
  }

  let vehicleA = findBy(app, "vehicles", (v) => v.getString("number") === "DEMO-001")
  if (!vehicleA) {
    vehicleA = new Record(vehiclesCol)
    vehicleA.set("number", "DEMO-001")
    vehicleA.set("country", "IT")
    vehicleA.set("owner", personA.id)
    vehicleA.set("enabled", true)
    vehicleA.set("notes", tag)
    app.save(vehicleA)
  }

  let vehicleB = findBy(app, "vehicles", (v) => v.getString("number") === "DEMO-002")
  if (!vehicleB) {
    vehicleB = new Record(vehiclesCol)
    vehicleB.set("number", "DEMO-002")
    vehicleB.set("country", "IT")
    vehicleB.set("owner", personB.id)
    vehicleB.set("enabled", true)
    vehicleB.set("notes", tag)
    app.save(vehicleB)
  }

  const oldDemoAccesses = app.findRecordsByFilter("accesses", "notes ~ 'demo_seed_v'", "", 10000, 0)
  for (const rec of oldDemoAccesses) {
    app.delete(rec)
  }

  const seedAccess = (data) => {
    const a = new Record(accessesCol)
    a.set("access_type", data.access_type)
    if (data.user) a.set("user", data.user)
    if (data.vehicle) a.set("vehicle", data.vehicle)
    if (data.driver_user) a.set("driver_user", data.driver_user)
    if (data.camera) a.set("camera", data.camera)
    if (data.made_by_user) a.set("made_by_user", data.made_by_user)
    a.set("did_leave", data.did_leave)
    a.set("deletable", true)
    a.set("reason", data.reason)
    a.set("enabled", true)
    a.set("notes", tag)
    app.save(a)
  }

  seedAccess({
    access_type: "vehicle",
    vehicle: vehicleA.id,
    driver_user: personA.id,
    camera: camIn.id,
    made_by_user: actorId,
    did_leave: false,
    reason: "Demo vehicle ingress",
  })

  seedAccess({
    access_type: "vehicle",
    vehicle: vehicleB.id,
    driver_user: personB.id,
    camera: camOut.id,
    made_by_user: actorId,
    did_leave: true,
    reason: "Demo vehicle egress",
  })

  seedAccess({
    access_type: "user",
    user: personA.id,
    camera: camIn.id,
    made_by_user: actorId,
    did_leave: false,
    reason: "Demo person ingress",
  })

  seedAccess({
    access_type: "user",
    user: personB.id,
    camera: camOut.id,
    made_by_user: actorId,
    did_leave: true,
    reason: "Demo person egress",
  })

  console.log("[demo reseed fix] dashboard demo data refreshed")
  return
}, (app) => {
  const records = app.findRecordsByFilter("accesses", "notes = 'demo_seed_v3'", "", 10000, 0)
  for (const r of records) app.delete(r)

  return
})
