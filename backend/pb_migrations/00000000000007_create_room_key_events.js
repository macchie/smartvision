/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const roomsCol = app.findCollectionByNameOrId("rooms")
  const usersCol = app.findCollectionByNameOrId("users")

  // Step 1: create without the self-referential return_key_event field
  const collection = new Collection({
    name: "room_key_events",
    type: "base",
  })

  collection.fields = [
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
    "CREATE INDEX idx_room_key_events_room         ON room_key_events (room)",
    "CREATE INDEX idx_room_key_events_user_created ON room_key_events (user, created_at)",
  ]

  collection.listRule = "@request.auth.role = 'admin' || @request.auth.role = 'operator' || @request.auth.id != ''"
  collection.viewRule = "@request.auth.role = 'admin' || @request.auth.role = 'operator' || @request.auth.id != ''"
  collection.createRule = "@request.auth.role = 'admin' || @request.auth.role = 'operator'"
  collection.updateRule = "@request.auth.role = 'admin' || @request.auth.role = 'operator'"
  collection.deleteRule = "@request.auth.role = 'admin'"

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
