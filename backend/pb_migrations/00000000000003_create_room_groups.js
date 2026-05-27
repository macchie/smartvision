/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const collection = new Collection({
    name: "room_groups",
    type: "base",
  })

  collection.fields = [
    new Field({
      name: "name",
      type: "text",
      required: true,
      min: null,
      max: null,
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

  collection.indexes = []
  collection.listRule = "@request.auth.id != ''"
  collection.viewRule = "@request.auth.id != ''"
  collection.createRule = "@request.auth.role = 'admin' || @request.auth.role = 'operator'"
  collection.updateRule = "@request.auth.role = 'admin' || @request.auth.role = 'operator'"
  collection.deleteRule = "@request.auth.role = 'admin'"

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("room_groups")
  return app.delete(collection)
})
