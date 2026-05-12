/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const roomsCol = app.findCollectionByNameOrId("rooms")
  const usersCol = app.findCollectionByNameOrId("users")

  // Step 1: create without the self-referential return_key_event field
  const collection = new Collection({
    name: "room_key_events",
    type: "base",
    fields: [
      // Room whose key is being collected or returned
      new Field({
        name: "room",
        type: "relation",
        required: true,
        collectionId: roomsCol.id,
        cascadeDelete: false,
        minSelect: null,
        maxSelect: 1,
      }),
      // User performing the action
      new Field({
        name: "user",
        type: "relation",
        required: true,
        collectionId: usersCol.id,
        cascadeDelete: false,
        minSelect: null,
        maxSelect: 1,
      }),
      // true = collecting the key; false = returning it
      new Field({
        name: "is_collecting",
        type: "bool",
      }),
      // Set to true once the corresponding return event is recorded
      new Field({
        name: "did_return_key",
        type: "bool",
      }),
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
    ],
    indexes: [
      "CREATE INDEX idx_room_key_events_room         ON room_key_events (room)",
      "CREATE INDEX idx_room_key_events_user_created ON room_key_events (user, created)",
    ],
    listRule:   "@request.auth.id != ''",
    viewRule:   "user = @request.auth.id || @request.auth.role = 'admin' || @request.auth.role = 'operator'",
    createRule: "@request.auth.role = 'admin' || @request.auth.role = 'operator'",
    updateRule: "@request.auth.role = 'admin' || @request.auth.role = 'operator'",
    deleteRule: "@request.auth.role = 'admin'",
  })

  app.save(collection)

  // Step 2: add self-referential return_key_event field.
  // When a user returns a key, this field on the original collect event
  // points to the return event, closing the pair.
  const saved = app.findCollectionByNameOrId("room_key_events")
  saved.fields.add(new Field({
    name: "return_key_event",
    type: "relation",
    collectionId: saved.id,
    cascadeDelete: false,
    minSelect: null,
    maxSelect: 1,
  }))
  return app.save(saved)
}, (app) => {
  const collection = app.findCollectionByNameOrId("room_key_events")
  return app.delete(collection)
})
