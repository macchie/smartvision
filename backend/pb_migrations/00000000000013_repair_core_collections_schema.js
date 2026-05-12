/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const usersCol = app.findCollectionByNameOrId("users")
  const camerasCol = app.findCollectionByNameOrId("cameras")
  const vehiclesCol = app.findCollectionByNameOrId("vehicles")
  const roomGroupsCol = app.findCollectionByNameOrId("room_groups")
  const roomsCol = app.findCollectionByNameOrId("rooms")
  const accessesCol = app.findCollectionByNameOrId("accesses")
  const roomKeyEventsCol = app.findCollectionByNameOrId("room_key_events")

  const hasField = (collection, fieldName) => {
    for (const field of collection.fields) {
      if (field.name === fieldName) {
        return true
      }
    }
    return false
  }

  const ensureField = (collection, fieldSpec) => {
    if (!hasField(collection, fieldSpec.name)) {
      collection.fields.add(new Field(fieldSpec))
    }
  }

  // cameras
  ensureField(camerasCol, { name: "name", type: "text", required: false })
  ensureField(camerasCol, { name: "camera_id", type: "text", required: false })
  ensureField(camerasCol, {
    name: "direction",
    type: "select",
    required: false,
    maxSelect: 1,
    values: ["in", "out"],
  })
  ensureField(camerasCol, { name: "metadata", type: "json", maxSize: 5242880 })
  ensureField(camerasCol, { name: "enabled", type: "bool" })
  ensureField(camerasCol, { name: "notes", type: "text", max: 2000 })

  camerasCol.listRule = "@request.auth.role = 'admin' || @request.auth.role = 'operator' || @request.auth.id != ''"
  camerasCol.viewRule = "@request.auth.role = 'admin' || @request.auth.role = 'operator' || @request.auth.id != ''"
  app.save(camerasCol)

  // vehicles
  ensureField(vehiclesCol, { name: "number", type: "text", required: false })
  ensureField(vehiclesCol, { name: "country", type: "text", max: 5 })
  ensureField(vehiclesCol, {
    name: "owner",
    type: "relation",
    collectionId: usersCol.id,
    cascadeDelete: false,
    minSelect: null,
    maxSelect: 1,
  })
  ensureField(vehiclesCol, { name: "enabled", type: "bool" })
  ensureField(vehiclesCol, { name: "notes", type: "text", max: 2000 })

  vehiclesCol.listRule = "@request.auth.role = 'admin' || @request.auth.role = 'operator' || @request.auth.id != ''"
  vehiclesCol.viewRule = "@request.auth.role = 'admin' || @request.auth.role = 'operator' || @request.auth.id != ''"
  app.save(vehiclesCol)

  // room_groups
  ensureField(roomGroupsCol, { name: "name", type: "text", required: false })
  ensureField(roomGroupsCol, { name: "enabled", type: "bool" })
  ensureField(roomGroupsCol, { name: "notes", type: "text", max: 2000 })

  roomGroupsCol.listRule = "@request.auth.role = 'admin' || @request.auth.role = 'operator' || @request.auth.id != ''"
  roomGroupsCol.viewRule = "@request.auth.role = 'admin' || @request.auth.role = 'operator' || @request.auth.id != ''"
  app.save(roomGroupsCol)

  // rooms
  ensureField(roomsCol, { name: "number", type: "text", required: false })
  ensureField(roomsCol, { name: "name", type: "text", required: false })
  ensureField(roomsCol, { name: "key_collected", type: "bool" })
  ensureField(roomsCol, {
    name: "room_group",
    type: "relation",
    collectionId: roomGroupsCol.id,
    cascadeDelete: false,
    minSelect: null,
    maxSelect: 1,
  })
  ensureField(roomsCol, { name: "enabled", type: "bool" })
  ensureField(roomsCol, { name: "notes", type: "text", max: 2000 })

  roomsCol.listRule = "@request.auth.role = 'admin' || @request.auth.role = 'operator' || @request.auth.id != ''"
  roomsCol.viewRule = "@request.auth.role = 'admin' || @request.auth.role = 'operator' || @request.auth.id != ''"
  app.save(roomsCol)

  // accesses
  ensureField(accessesCol, {
    name: "access_type",
    type: "select",
    required: false,
    maxSelect: 1,
    values: ["user", "vehicle"],
  })
  ensureField(accessesCol, {
    name: "user",
    type: "relation",
    collectionId: usersCol.id,
    cascadeDelete: false,
    minSelect: null,
    maxSelect: 1,
  })
  ensureField(accessesCol, {
    name: "vehicle",
    type: "relation",
    collectionId: vehiclesCol.id,
    cascadeDelete: false,
    minSelect: null,
    maxSelect: 1,
  })
  ensureField(accessesCol, {
    name: "driver_user",
    type: "relation",
    collectionId: usersCol.id,
    cascadeDelete: false,
    minSelect: null,
    maxSelect: 1,
  })
  ensureField(accessesCol, {
    name: "camera",
    type: "relation",
    collectionId: camerasCol.id,
    cascadeDelete: false,
    minSelect: null,
    maxSelect: 1,
  })
  ensureField(accessesCol, { name: "did_leave", type: "bool" })
  ensureField(accessesCol, { name: "deletable", type: "bool" })
  ensureField(accessesCol, {
    name: "made_by_user",
    type: "relation",
    collectionId: usersCol.id,
    cascadeDelete: false,
    minSelect: null,
    maxSelect: 1,
  })
  ensureField(accessesCol, { name: "reason", type: "text", max: 1000 })
  ensureField(accessesCol, { name: "enabled", type: "bool" })
  ensureField(accessesCol, { name: "notes", type: "text", max: 2000 })

  accessesCol.listRule = "@request.auth.role = 'admin' || @request.auth.role = 'operator' || @request.auth.id != ''"
  accessesCol.viewRule = "@request.auth.role = 'admin' || @request.auth.role = 'operator' || @request.auth.id != ''"
  app.save(accessesCol)

  // room_key_events
  ensureField(roomKeyEventsCol, {
    name: "room",
    type: "relation",
    collectionId: roomsCol.id,
    cascadeDelete: false,
    minSelect: null,
    maxSelect: 1,
  })
  ensureField(roomKeyEventsCol, {
    name: "user",
    type: "relation",
    collectionId: usersCol.id,
    cascadeDelete: false,
    minSelect: null,
    maxSelect: 1,
  })
  ensureField(roomKeyEventsCol, { name: "is_collecting", type: "bool" })
  ensureField(roomKeyEventsCol, { name: "did_return_key", type: "bool" })
  ensureField(roomKeyEventsCol, { name: "reason", type: "text", max: 1000 })
  ensureField(roomKeyEventsCol, { name: "enabled", type: "bool" })
  ensureField(roomKeyEventsCol, { name: "notes", type: "text", max: 2000 })

  roomKeyEventsCol.listRule = "@request.auth.role = 'admin' || @request.auth.role = 'operator' || @request.auth.id != ''"
  roomKeyEventsCol.viewRule = "@request.auth.role = 'admin' || @request.auth.role = 'operator' || @request.auth.id != ''"
  app.save(roomKeyEventsCol)

  // Backfill minimal values for existing legacy records.
  const cameras = app.findRecordsByFilter("cameras", "id != ''", "", 10000, 0)
  for (const c of cameras) {
    if (!c.getString("name")) c.set("name", "Camera " + c.id.slice(0, 6))
    if (!c.getString("camera_id")) c.set("camera_id", "cam-" + c.id.slice(0, 8))
    if (!c.getString("direction")) c.set("direction", "in")
    if (c.get("enabled") == null) c.set("enabled", true)
    app.save(c)
  }

  const vehicles = app.findRecordsByFilter("vehicles", "id != ''", "", 10000, 0)
  for (const v of vehicles) {
    if (!v.getString("number")) v.set("number", "VEH-" + v.id.slice(0, 6))
    if (v.get("enabled") == null) v.set("enabled", true)
    app.save(v)
  }

  const roomGroups = app.findRecordsByFilter("room_groups", "id != ''", "", 10000, 0)
  for (const rg of roomGroups) {
    if (!rg.getString("name")) rg.set("name", "Group " + rg.id.slice(0, 6))
    if (rg.get("enabled") == null) rg.set("enabled", true)
    app.save(rg)
  }

  const rooms = app.findRecordsByFilter("rooms", "id != ''", "", 10000, 0)
  for (const r of rooms) {
    if (!r.getString("number")) r.set("number", "R-" + r.id.slice(0, 6))
    if (r.get("enabled") == null) r.set("enabled", true)
    if (r.get("key_collected") == null) r.set("key_collected", false)
    app.save(r)
  }

  const accesses = app.findRecordsByFilter("accesses", "id != ''", "", 10000, 0)
  for (const a of accesses) {
    if (!a.getString("access_type")) a.set("access_type", "user")
    if (a.get("did_leave") == null) a.set("did_leave", false)
    if (a.get("deletable") == null) a.set("deletable", true)
    if (a.get("enabled") == null) a.set("enabled", true)
    if (!a.getString("reason")) a.set("reason", "Recovered legacy access")
    app.save(a)
  }

  const keyEvents = app.findRecordsByFilter("room_key_events", "id != ''", "", 10000, 0)
  for (const ke of keyEvents) {
    if (ke.get("is_collecting") == null) ke.set("is_collecting", false)
    if (ke.get("did_return_key") == null) ke.set("did_return_key", false)
    if (ke.get("enabled") == null) ke.set("enabled", true)
    app.save(ke)
  }

  return
}, (app) => {
  // Keep downgrade non-destructive.
  return
})
