/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const roomGroupsCol = app.findCollectionByNameOrId("room_groups")

  const collection = new Collection({
    name: "rooms",
    type: "base",
    fields: [
      // Room identifier e.g. "101", "A-5"
      new Field({
        name: "number",
        type: "text",
        required: true,
        min: null,
        max: null,
        pattern: "",
      }),
      // Optional human-readable name
      new Field({
        name: "name",
        type: "text",
        min: null,
        max: null,
        pattern: "",
      }),
      // True when the physical room key is currently checked out
      new Field({
        name: "key_collected",
        type: "bool",
      }),
      new Field({
        name: "room_group",
        type: "relation",
        collectionId: roomGroupsCol.id,
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
    ],
    indexes: [
      "CREATE INDEX idx_rooms_number     ON rooms (number)",
      "CREATE INDEX idx_rooms_room_group ON rooms (room_group)",
    ],
    listRule:   "@request.auth.id != ''",
    viewRule:   "@request.auth.id != ''",
    createRule: "@request.auth.role = 'admin' || @request.auth.role = 'operator'",
    updateRule: "@request.auth.role = 'admin' || @request.auth.role = 'operator'",
    deleteRule: "@request.auth.role = 'admin'",
  })

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("rooms")
  return app.delete(collection)
})
