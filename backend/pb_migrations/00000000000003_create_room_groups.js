/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const collection = new Collection({
    name: "room_groups",
    type: "base",
    fields: [
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
    ],
    indexes: [],
    listRule:   "@request.auth.id != ''",
    viewRule:   "@request.auth.id != ''",
    createRule: "@request.auth.role = 'admin' || @request.auth.role = 'operator'",
    updateRule: "@request.auth.role = 'admin' || @request.auth.role = 'operator'",
    deleteRule: "@request.auth.role = 'admin'",
  })

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("room_groups")
  return app.delete(collection)
})
