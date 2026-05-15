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

  const readTimestamp = (record, primaryKey, fallbackKey) => {
    const primary = String(record.getString(primaryKey) || "")
    if (primary) {
      return primary
    }

    const fallback = String(record.getString(fallbackKey) || "")
    if (fallback) {
      return fallback
    }

    const now = new Date().toISOString()
    return now
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
  ensureField(camerasCol, { name: "created_at", type: "date" })
  ensureField(camerasCol, { name: "updated_at", type: "date" })

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
  ensureField(vehiclesCol, { name: "created_at", type: "date" })
  ensureField(vehiclesCol, { name: "updated_at", type: "date" })

  vehiclesCol.listRule = "@request.auth.role = 'admin' || @request.auth.role = 'operator' || @request.auth.id != ''"
  vehiclesCol.viewRule = "@request.auth.role = 'admin' || @request.auth.role = 'operator' || @request.auth.id != ''"
  app.save(vehiclesCol)

  // room_groups
  ensureField(roomGroupsCol, { name: "name", type: "text", required: false })
  ensureField(roomGroupsCol, { name: "enabled", type: "bool" })
  ensureField(roomGroupsCol, { name: "notes", type: "text", max: 2000 })
  ensureField(roomGroupsCol, { name: "created_at", type: "date" })
  ensureField(roomGroupsCol, { name: "updated_at", type: "date" })

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
  ensureField(roomsCol, { name: "created_at", type: "date" })
  ensureField(roomsCol, { name: "updated_at", type: "date" })

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
  ensureField(accessesCol, { name: "created_at", type: "date" })
  ensureField(accessesCol, { name: "updated_at", type: "date" })

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
  ensureField(roomKeyEventsCol, { name: "created_at", type: "date" })
  ensureField(roomKeyEventsCol, { name: "updated_at", type: "date" })

  ensureField(usersCol, { name: "created_at", type: "date" })
  ensureField(usersCol, { name: "updated_at", type: "date" })

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
    if (!c.getString("created_at")) c.set("created_at", readTimestamp(c, "created", "updated"))
    if (!c.getString("updated_at")) c.set("updated_at", readTimestamp(c, "updated", "created"))
    app.save(c)
  }

  const vehicles = app.findRecordsByFilter("vehicles", "id != ''", "", 10000, 0)
  for (const v of vehicles) {
    if (!v.getString("number")) v.set("number", "VEH-" + v.id.slice(0, 6))
    if (v.get("enabled") == null) v.set("enabled", true)
    if (!v.getString("created_at")) v.set("created_at", readTimestamp(v, "created", "updated"))
    if (!v.getString("updated_at")) v.set("updated_at", readTimestamp(v, "updated", "created"))
    app.save(v)
  }

  const roomGroups = app.findRecordsByFilter("room_groups", "id != ''", "", 10000, 0)
  for (const rg of roomGroups) {
    if (!rg.getString("name")) rg.set("name", "Group " + rg.id.slice(0, 6))
    if (rg.get("enabled") == null) rg.set("enabled", true)
    if (!rg.getString("created_at")) rg.set("created_at", readTimestamp(rg, "created", "updated"))
    if (!rg.getString("updated_at")) rg.set("updated_at", readTimestamp(rg, "updated", "created"))
    app.save(rg)
  }

  const rooms = app.findRecordsByFilter("rooms", "id != ''", "", 10000, 0)
  for (const r of rooms) {
    if (!r.getString("number")) r.set("number", "R-" + r.id.slice(0, 6))
    if (r.get("enabled") == null) r.set("enabled", true)
    if (r.get("key_collected") == null) r.set("key_collected", false)
    if (!r.getString("created_at")) r.set("created_at", readTimestamp(r, "created", "updated"))
    if (!r.getString("updated_at")) r.set("updated_at", readTimestamp(r, "updated", "created"))
    app.save(r)
  }

  const accesses = app.findRecordsByFilter("accesses", "id != ''", "", 10000, 0)
  for (const a of accesses) {
    if (!a.getString("access_type")) a.set("access_type", "user")
    if (a.get("did_leave") == null) a.set("did_leave", false)
    if (a.get("deletable") == null) a.set("deletable", true)
    if (a.get("enabled") == null) a.set("enabled", true)
    if (!a.getString("reason")) a.set("reason", "Recovered legacy access")
    if (!a.getString("created_at")) a.set("created_at", readTimestamp(a, "created", "updated"))
    if (!a.getString("updated_at")) a.set("updated_at", readTimestamp(a, "updated", "created"))
    app.save(a)
  }

  const keyEvents = app.findRecordsByFilter("room_key_events", "id != ''", "", 10000, 0)
  for (const ke of keyEvents) {
    if (ke.get("is_collecting") == null) ke.set("is_collecting", false)
    if (ke.get("did_return_key") == null) ke.set("did_return_key", false)
    if (ke.get("enabled") == null) ke.set("enabled", true)
    if (!ke.getString("created_at")) ke.set("created_at", readTimestamp(ke, "created", "updated"))
    if (!ke.getString("updated_at")) ke.set("updated_at", readTimestamp(ke, "updated", "created"))
    app.save(ke)
  }

  const users = app.findRecordsByFilter("users", "id != ''", "", 10000, 0)
  for (const user of users) {
    if (!user.getString("created_at")) user.set("created_at", readTimestamp(user, "created", "updated"))
    if (!user.getString("updated_at")) user.set("updated_at", readTimestamp(user, "updated", "created"))
    app.save(user)
  }

  return
}, (app) => {
  // Keep downgrade non-destructive.
  return
})
