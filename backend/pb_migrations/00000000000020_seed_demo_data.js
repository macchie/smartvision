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
  const roomGroupsCol = app.findCollectionByNameOrId("room_groups")
  const roomsCol = app.findCollectionByNameOrId("rooms")
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

  const companyA = findBy(app, "users", (u) => u.getString("email") === "company.novacargo.demo@smartvision.local") || (() => {
    const u = new Record(usersCol)
    u.set("user_type", "company")
    u.set("name", "Nova Cargo Srl")
    u.set("username", "novacargo_demo")
    u.set("email", "company.novacargo.demo@smartvision.local")
    u.set("emailVisibility", false)
    u.set("role", "regular")
    u.set("enabled", true)
    u.set("notes", tag)
    u.setPassword("Demo1234!")
    app.save(u)
    return u
  })()

  const companyB = findBy(app, "users", (u) => u.getString("email") === "company.orionfleet.demo@smartvision.local") || (() => {
    const u = new Record(usersCol)
    u.set("user_type", "company")
    u.set("name", "Orion Fleet Spa")
    u.set("username", "orionfleet_demo")
    u.set("email", "company.orionfleet.demo@smartvision.local")
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

  const frontOfficeGroup = findBy(app, "room_groups", (g) => g.getString("name") === "Front Office") || (() => {
    const g = new Record(roomGroupsCol)
    g.set("name", "Front Office")
    g.set("enabled", true)
    g.set("notes", tag)
    app.save(g)
    return g
  })()

  const operationsWingGroup = findBy(app, "room_groups", (g) => g.getString("name") === "Operations Wing") || (() => {
    const g = new Record(roomGroupsCol)
    g.set("name", "Operations Wing")
    g.set("enabled", true)
    g.set("notes", tag)
    app.save(g)
    return g
  })()

  const serviceAndStorageGroup = findBy(app, "room_groups", (g) => g.getString("name") === "Service & Storage") || (() => {
    const g = new Record(roomGroupsCol)
    g.set("name", "Service & Storage")
    g.set("enabled", true)
    g.set("notes", tag)
    app.save(g)
    return g
  })()

  let roomFrontLobby = findBy(app, "rooms", (r) => r.getString("number") === "FO-101")
  if (!roomFrontLobby) {
    roomFrontLobby = new Record(roomsCol)
    roomFrontLobby.set("number", "FO-101")
    roomFrontLobby.set("name", "Reception Lobby")
    roomFrontLobby.set("room_group", frontOfficeGroup.id)
    roomFrontLobby.set("key_collected", false)
    roomFrontLobby.set("enabled", true)
    roomFrontLobby.set("notes", tag)
    app.save(roomFrontLobby)
  }

  let roomMeeting = findBy(app, "rooms", (r) => r.getString("number") === "FO-102")
  if (!roomMeeting) {
    roomMeeting = new Record(roomsCol)
    roomMeeting.set("number", "FO-102")
    roomMeeting.set("name", "Visitor Meeting Room")
    roomMeeting.set("room_group", frontOfficeGroup.id)
    roomMeeting.set("key_collected", false)
    roomMeeting.set("enabled", true)
    roomMeeting.set("notes", tag)
    app.save(roomMeeting)
  }

  let roomControl = findBy(app, "rooms", (r) => r.getString("number") === "OP-201")
  if (!roomControl) {
    roomControl = new Record(roomsCol)
    roomControl.set("number", "OP-201")
    roomControl.set("name", "Main Control Room")
    roomControl.set("room_group", operationsWingGroup.id)
    roomControl.set("key_collected", true)
    roomControl.set("enabled", true)
    roomControl.set("notes", tag)
    app.save(roomControl)
  }

  let roomSupervisor = findBy(app, "rooms", (r) => r.getString("number") === "OP-202")
  if (!roomSupervisor) {
    roomSupervisor = new Record(roomsCol)
    roomSupervisor.set("number", "OP-202")
    roomSupervisor.set("name", "Supervisor Office")
    roomSupervisor.set("room_group", operationsWingGroup.id)
    roomSupervisor.set("key_collected", false)
    roomSupervisor.set("enabled", true)
    roomSupervisor.set("notes", tag)
    app.save(roomSupervisor)
  }

  let roomStorage = findBy(app, "rooms", (r) => r.getString("number") === "SV-301")
  if (!roomStorage) {
    roomStorage = new Record(roomsCol)
    roomStorage.set("number", "SV-301")
    roomStorage.set("name", "Maintenance Storage")
    roomStorage.set("room_group", serviceAndStorageGroup.id)
    roomStorage.set("key_collected", false)
    roomStorage.set("enabled", true)
    roomStorage.set("notes", tag)
    app.save(roomStorage)
  }

  let roomLocker = findBy(app, "rooms", (r) => r.getString("number") === "SV-302")
  if (!roomLocker) {
    roomLocker = new Record(roomsCol)
    roomLocker.set("number", "SV-302")
    roomLocker.set("name", "Uniform Locker Room")
    roomLocker.set("room_group", serviceAndStorageGroup.id)
    roomLocker.set("key_collected", false)
    roomLocker.set("enabled", true)
    roomLocker.set("notes", tag)
    app.save(roomLocker)
  }

  let vehicleA = findBy(app, "vehicles", (v) => v.getString("number") === "DV661MN")
  if (!vehicleA) {
    vehicleA = new Record(vehiclesCol)
    vehicleA.set("number", "DV661MN")
    vehicleA.set("country", "IT")
    vehicleA.set("owner", personA.id)
    vehicleA.set("enabled", true)
    vehicleA.set("notes", tag)
    app.save(vehicleA)
  }

  let vehicleB = findBy(app, "vehicles", (v) => v.getString("number") === "BY628DG")
  if (!vehicleB) {
    vehicleB = new Record(vehiclesCol)
    vehicleB.set("number", "BY628DG")
    vehicleB.set("country", "IT")
    vehicleB.set("owner", personB.id)
    vehicleB.set("enabled", true)
    vehicleB.set("notes", tag)
    app.save(vehicleB)
  }

  let vehicleC = findBy(app, "vehicles", (v) => v.getString("number") === "NC112AA")
  if (!vehicleC) {
    vehicleC = new Record(vehiclesCol)
    vehicleC.set("number", "NC112AA")
    vehicleC.set("country", "IT")
    vehicleC.set("owner", companyA.id)
    vehicleC.set("enabled", true)
    vehicleC.set("notes", tag)
    app.save(vehicleC)
  }

  let vehicleD = findBy(app, "vehicles", (v) => v.getString("number") === "NC278BB")
  if (!vehicleD) {
    vehicleD = new Record(vehiclesCol)
    vehicleD.set("number", "NC278BB")
    vehicleD.set("country", "IT")
    vehicleD.set("owner", companyA.id)
    vehicleD.set("enabled", true)
    vehicleD.set("notes", tag)
    app.save(vehicleD)
  }

  let vehicleE = findBy(app, "vehicles", (v) => v.getString("number") === "OF334CC")
  if (!vehicleE) {
    vehicleE = new Record(vehiclesCol)
    vehicleE.set("number", "OF334CC")
    vehicleE.set("country", "IT")
    vehicleE.set("owner", companyB.id)
    vehicleE.set("enabled", true)
    vehicleE.set("notes", tag)
    app.save(vehicleE)
  }

  let vehicleF = findBy(app, "vehicles", (v) => v.getString("number") === "OF509DD")
  if (!vehicleF) {
    vehicleF = new Record(vehiclesCol)
    vehicleF.set("number", "OF509DD")
    vehicleF.set("country", "IT")
    vehicleF.set("owner", companyB.id)
    vehicleF.set("enabled", true)
    vehicleF.set("notes", tag)
    app.save(vehicleF)
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

  const rooms = app.findRecordsByFilter("rooms", "notes = 'demo_seed_v3'", "", 10000, 0)
  for (const r of rooms) app.delete(r)

  const roomGroups = app.findRecordsByFilter("room_groups", "notes = 'demo_seed_v3'", "", 10000, 0)
  for (const g of roomGroups) app.delete(g)

  return
})
