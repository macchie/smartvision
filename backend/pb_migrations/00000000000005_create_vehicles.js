/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const usersCol = app.findCollectionByNameOrId("users")

  const collection = new Collection({
    name: "vehicles",
    type: "base",
  })

  collection.fields = [
    // Vehicle identifier (e.g. license plate) — unique lookup key during camera events
    new Field({
      name: "number",
      type: "text",
      required: true,
      min: null,
      max: null,
      pattern: "",
    }),
    // ISO 3166-1 alpha-2 country code e.g. "IT", "DE"
    new Field({
      name: "country",
      type: "text",
      min: null,
      max: 5,
      pattern: "",
    }),
    // Primary owner / driver — may be empty for unknown vehicles auto-created by cameras
    new Field({
      name: "owner",
      type: "relation",
      collectionId: usersCol.id,
      cascadeDelete: false,
      minSelect: null,
      maxSelect: 1,
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
    "CREATE UNIQUE INDEX idx_vehicles_number ON vehicles (number)",
    "CREATE INDEX        idx_vehicles_owner  ON vehicles (owner)",
  ]

  collection.listRule = "@request.auth.id != ''"
  collection.viewRule = "@request.auth.id != ''"
  collection.createRule = "@request.auth.role = 'admin' || @request.auth.role = 'operator'"
  collection.updateRule = "@request.auth.role = 'admin' || @request.auth.role = 'operator'"
  collection.deleteRule = "@request.auth.role = 'admin' || @request.auth.role = 'operator'"

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("vehicles")
  return app.delete(collection)
})
