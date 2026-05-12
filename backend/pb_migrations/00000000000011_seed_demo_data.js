/// <reference path="../pb_data/types.d.ts" />

function isDemoDataEnabled() {
  const raw = ($os.getenv("DEMO_DATA") || "").toUpperCase()
  return raw === "TRUE"
}

function findRecordByPredicate(app, collection, predicate) {
  const records = app.findRecordsByFilter(collection, "id != ''", "", 500, 0)
  for (const record of records) {
    if (predicate(record)) {
      return record
    }
  }

  return null
}

function upsertByPredicate(app, collection, predicate, createFn) {
  const existing = findRecordByPredicate(app, collection, predicate)
  if (existing) {
    return existing
  }

  const created = createFn()
  app.save(created)
  return created
}

function findCameraByTag(app, tag) {
  const cameras = app.findRecordsByFilter("cameras", "id != ''", "", 200, 0)
  for (const camera of cameras) {
    const byCameraId = camera.getString("camera_id") === tag
    const byName = camera.getString("name") === "Demo Gate IN" && tag === "demo-cam-in"
      || camera.getString("name") === "Demo Gate OUT" && tag === "demo-cam-out"
    if (byCameraId || byName) {
      return camera
    }
  }

  return null
}

function deleteByPredicate(app, collection, predicate) {
  const records = app.findRecordsByFilter(collection, "id != ''", "", 500, 0)
  for (const record of records) {
    if (predicate(record)) {
      app.delete(record)
    }
  }
}

migrate((app) => {
  if (!isDemoDataEnabled()) {
    console.log("[demo seed] DEMO_DATA is not TRUE - skipping demo migration")
    return
  }

  const usersCol = app.findCollectionByNameOrId("users")
  const camerasCol = app.findCollectionByNameOrId("cameras")
  const roomGroupsCol = app.findCollectionByNameOrId("room_groups")
  const roomsCol = app.findCollectionByNameOrId("rooms")
  const vehiclesCol = app.findCollectionByNameOrId("vehicles")
  const accessesCol = app.findCollectionByNameOrId("accesses")

  const noteTag = "demo_seed_v1"

  let camIn = findCameraByTag(app, "demo-cam-in")
  if (!camIn) {
    camIn = new Record(camerasCol)
    camIn.set("name", "Demo Gate IN")
    camIn.set("camera_id", "demo-cam-in")
    camIn.set("direction", "in")
    camIn.set("enabled", true)
    camIn.set("notes", noteTag)
    app.save(camIn)
  }

  let camOut = findCameraByTag(app, "demo-cam-out")
  if (!camOut) {
    camOut = new Record(camerasCol)
    camOut.set("name", "Demo Gate OUT")
    camOut.set("camera_id", "demo-cam-out")
    camOut.set("direction", "out")
    camOut.set("enabled", true)
    camOut.set("notes", noteTag)
    app.save(camOut)
  }

  const adminUser = findRecordByPredicate(
    app,
    "users",
    (record) => record.getString("email") === "admin@smartvision.local",
  )

  const madeByUserId = adminUser ? adminUser.id : ""

  const personA = upsertByPredicate(
    app,
    "users",
    (record) => record.getString("email") === "person.alice.demo@smartvision.local",
    () => {
      const user = new Record(usersCol)
      user.set("user_type", "person")
      user.set("first_name", "Alice")
      user.set("last_name", "Verdi")
      user.set("username", "alice_demo")
      user.set("email", "person.alice.demo@smartvision.local")
      user.set("emailVisibility", false)
      user.set("role", "regular")
      user.set("enabled", true)
      user.set("notes", noteTag)
      user.setPassword("Demo1234!")
      return user
    },
  )

  const personB = upsertByPredicate(
    app,
    "users",
    (record) => record.getString("email") === "person.bruno.demo@smartvision.local",
    () => {
      const user = new Record(usersCol)
      user.set("user_type", "person")
      user.set("first_name", "Bruno")
      user.set("last_name", "Neri")
      user.set("username", "bruno_demo")
      user.set("email", "person.bruno.demo@smartvision.local")
      user.set("emailVisibility", false)
      user.set("role", "regular")
      user.set("enabled", true)
      user.set("notes", noteTag)
      user.setPassword("Demo1234!")
      return user
    },
  )

  const companyA = upsertByPredicate(
    app,
    "users",
    (record) => record.getString("email") === "company.acme.demo@smartvision.local",
    () => {
      const user = new Record(usersCol)
      user.set("user_type", "company")
      user.set("name", "Acme Logistics Demo")
      user.set("username", "acme_demo")
      user.set("email", "company.acme.demo@smartvision.local")
      user.set("emailVisibility", false)
      user.set("role", "regular")
      user.set("enabled", true)
      user.set("notes", noteTag)
      user.setPassword("Demo1234!")
      return user
    },
  )

  const companyB = upsertByPredicate(
    app,
    "users",
    (record) => record.getString("email") === "company.nexa.demo@smartvision.local",
    () => {
      const user = new Record(usersCol)
      user.set("user_type", "company")
      user.set("name", "Nexa Services Demo")
      user.set("username", "nexa_demo")
      user.set("email", "company.nexa.demo@smartvision.local")
      user.set("emailVisibility", false)
      user.set("role", "regular")
      user.set("enabled", true)
      user.set("notes", noteTag)
      user.setPassword("Demo1234!")
      return user
    },
  )

  const rgNorth = upsertByPredicate(
    app,
    "room_groups",
    (record) => record.getString("name") === "Demo North Wing",
    () => {
      const roomGroup = new Record(roomGroupsCol)
      roomGroup.set("name", "Demo North Wing")
      roomGroup.set("enabled", true)
      roomGroup.set("notes", noteTag)
      return roomGroup
    },
  )

  const rgSouth = upsertByPredicate(
    app,
    "room_groups",
    (record) => record.getString("name") === "Demo South Wing",
    () => {
      const roomGroup = new Record(roomGroupsCol)
      roomGroup.set("name", "Demo South Wing")
      roomGroup.set("enabled", true)
      roomGroup.set("notes", noteTag)
      return roomGroup
    },
  )

  const roomSeeds = [
    { number: "N-101", name: "North Ops", roomGroup: rgNorth.id },
    { number: "N-102", name: "North Storage", roomGroup: rgNorth.id },
    { number: "N-103", name: "North Workshop", roomGroup: rgNorth.id },
    { number: "S-201", name: "South Lobby", roomGroup: rgSouth.id },
    { number: "S-202", name: "South Archive", roomGroup: rgSouth.id },
    { number: "S-203", name: "South Security", roomGroup: rgSouth.id },
  ]

  for (const seed of roomSeeds) {
    upsertByPredicate(
      app,
      "rooms",
      (record) => record.getString("number") === seed.number,
      () => {
        const room = new Record(roomsCol)
        room.set("number", seed.number)
        room.set("name", seed.name)
        room.set("room_group", seed.roomGroup)
        room.set("key_collected", false)
        room.set("enabled", true)
        room.set("notes", noteTag)
        return room
      },
    )
  }

  const vehicleA = upsertByPredicate(
    app,
    "vehicles",
    (record) => record.getString("number") === "DEMO-001",
    () => {
      const vehicle = new Record(vehiclesCol)
      vehicle.set("number", "DEMO-001")
      vehicle.set("country", "IT")
      vehicle.set("owner", personA.id)
      vehicle.set("enabled", true)
      vehicle.set("notes", noteTag)
      return vehicle
    },
  )

  const vehicleB = upsertByPredicate(
    app,
    "vehicles",
    (record) => record.getString("number") === "DEMO-002",
    () => {
      const vehicle = new Record(vehiclesCol)
      vehicle.set("number", "DEMO-002")
      vehicle.set("country", "IT")
      vehicle.set("owner", personB.id)
      vehicle.set("enabled", true)
      vehicle.set("notes", noteTag)
      return vehicle
    },
  )

  const accessSeeds = [
    {
      key: "Demo vehicle ingress 1",
      data: {
        access_type: "vehicle",
        vehicle: vehicleA.id,
        driver_user: personA.id,
        camera: camIn.id,
        did_leave: false,
        deletable: true,
        made_by_user: madeByUserId,
        reason: "Demo vehicle ingress 1",
        enabled: true,
        notes: noteTag,
      },
    },
    {
      key: "Demo vehicle egress 2",
      data: {
        access_type: "vehicle",
        vehicle: vehicleB.id,
        driver_user: personB.id,
        camera: camOut.id,
        did_leave: true,
        deletable: true,
        made_by_user: madeByUserId,
        reason: "Demo vehicle egress 2",
        enabled: true,
        notes: noteTag,
      },
    },
    {
      key: "Demo person ingress company staff",
      data: {
        access_type: "user",
        user: companyA.id,
        camera: camIn.id,
        did_leave: false,
        deletable: true,
        made_by_user: madeByUserId,
        reason: "Demo person ingress company staff",
        enabled: true,
        notes: noteTag,
      },
    },
    {
      key: "Demo person egress company visitor",
      data: {
        access_type: "user",
        user: companyB.id,
        camera: camOut.id,
        did_leave: true,
        deletable: true,
        made_by_user: madeByUserId,
        reason: "Demo person egress company visitor",
        enabled: true,
        notes: noteTag,
      },
    },
  ]

  for (const seed of accessSeeds) {
    upsertByPredicate(
      app,
      "accesses",
      (record) => record.getString("reason") === seed.key,
      () => {
        const access = new Record(accessesCol)
        access.set("access_type", seed.data.access_type)
        if (seed.data.user) {
          access.set("user", seed.data.user)
        }
        if (seed.data.vehicle) {
          access.set("vehicle", seed.data.vehicle)
        }
        if (seed.data.driver_user) {
          access.set("driver_user", seed.data.driver_user)
        }
        access.set("camera", seed.data.camera)
        access.set("did_leave", seed.data.did_leave)
        access.set("deletable", seed.data.deletable)
        if (seed.data.made_by_user) {
          access.set("made_by_user", seed.data.made_by_user)
        }
        access.set("reason", seed.data.reason)
        access.set("enabled", seed.data.enabled)
        access.set("notes", seed.data.notes)
        return access
      },
    )
  }

  console.log("[demo seed] demo records ensured")
}, (app) => {
  deleteByPredicate(app, "accesses", (record) => record.getString("notes") === "demo_seed_v1")
  deleteByPredicate(app, "vehicles", (record) => record.getString("notes") === "demo_seed_v1")
  deleteByPredicate(app, "rooms", (record) => record.getString("notes") === "demo_seed_v1")
  deleteByPredicate(app, "room_groups", (record) => record.getString("notes") === "demo_seed_v1")
  deleteByPredicate(app, "users", (record) => record.getString("notes") === "demo_seed_v1")
  deleteByPredicate(app, "cameras", (record) => record.getString("notes") === "demo_seed_v1")
})
