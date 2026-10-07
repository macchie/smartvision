/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const vehiclesCol = app.findCollectionByNameOrId("vehicles")
  const gatesCol = app.findCollectionByNameOrId("gates")
  const usersCol   = app.findCollectionByNameOrId("users")

  // Step 1: create without the self-referential closed_by_access field.
  const collection = new Collection({
    name: "accesses",
    type: "base",
  })

  collection.fields = [
    // Distinguishes user-based accesses from vehicle-based accesses.
    new Field({
      name: "access_type",
      type: "select",
      required: true,
      maxSelect: 1,
      values: ["user", "vehicle"],
    }),
    // User involved in this access event (required when access_type = "user")
    new Field({
      name: "user",
      type: "relation",
      collectionId: usersCol.id,
      cascadeDelete: false,
      minSelect: null,
      maxSelect: 1,
    }),
    // Vehicle involved in this access event (required when access_type = "vehicle")
    new Field({
      name: "vehicle",
      type: "relation",
      collectionId: vehiclesCol.id,
      cascadeDelete: false,
      minSelect: null,
      maxSelect: 1,
    }),
    // Driver of the vehicle for vehicle-type accesses.
    new Field({
      name: "driver_user",
      type: "relation",
      collectionId: usersCol.id,
      cascadeDelete: false,
      minSelect: null,
      maxSelect: 1,
    }),
    // The gate that detected the plate
    new Field({
      name: "gate",
      type: "relation",
      collectionId: gatesCol.id,
      cascadeDelete: false,
      minSelect: null,
      maxSelect: 1,
    }),
    // True when the subject has exited/left.
    new Field({
      name: "did_leave",
      type: "bool",
    }),
    // Manual accesses created through the UI are deletable=true.
    new Field({
      name: "deletable",
      type: "bool",
    }),
    // User responsible for this access event (denormalized actor reference).
    new Field({
      name: "made_by_user",
      type: "relation",
      collectionId: usersCol.id,
      cascadeDelete: false,
      minSelect: null,
      maxSelect: 1,
    }),
    // Free-form annotation (mirrors Reason mixin)
    new Field({
      name: "reason",
      type: "text",
      min: null,
      max: 1000,
      pattern: "",
    }),
    new Field({
      name: "enabled",
      type: "bool",
    }),
    new Field({
      name: "notes",
      type: "text",
      min: null,
      max: 2000,
      pattern: "",
    }),
    new Field({
      name: "created_at",
      type: "date",
    }),
    new Field({
      name: "updated_at",
      type: "date",
    }),
  ]

  collection.indexes = [
    "CREATE INDEX idx_accesses_user_created    ON accesses (user, created_at)",
    "CREATE INDEX idx_accesses_vehicle_created ON accesses (vehicle, created_at)",
    "CREATE INDEX idx_accesses_driver_user     ON accesses (driver_user)",
    "CREATE INDEX idx_accesses_gate          ON accesses (gate)",
  ]

  collection.listRule = "@request.auth.role = 'admin' || @request.auth.role = 'operator' || @request.auth.id != ''"
  collection.viewRule = "@request.auth.role = 'admin' || @request.auth.role = 'operator' || @request.auth.id != ''"
  collection.createRule = "@request.auth.role = 'admin' || @request.auth.role = 'operator'"
  collection.updateRule = "@request.auth.role = 'admin' || @request.auth.role = 'operator'"
  collection.deleteRule = "@request.auth.role = 'admin' || @request.auth.role = 'operator'"

  app.save(collection)

  // Step 2: add self-reference to pair open/closed access events.
  const saved = app.findCollectionByNameOrId("accesses")
  saved.fields.add(new Field({
    name: "closed_by_access",
    type: "relation",
    collectionId: saved.id,
    cascadeDelete: false,
    minSelect: null,
    maxSelect: 1,
  }))
  return app.save(saved)
}, (app) => {
  const collection = app.findCollectionByNameOrId("accesses")
  return app.delete(collection)
})
