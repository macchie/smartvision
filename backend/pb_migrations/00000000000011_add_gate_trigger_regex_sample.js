/// <reference path="../pb_data/types.d.ts" />

// Adds `regex_sample` to gate_triggers: a persisted example source string
// (filename or socket message) that admins use to test `plate_regex` in the
// trigger dialog. Stored so the test case survives edits and documents the
// expected input for the trigger.
migrate((app) => {
  const collection = app.findCollectionByNameOrId("gate_triggers")
  collection.fields.add(new Field({
    name: "regex_sample",
    type: "text",
    min: null,
    max: 2000,
    pattern: "",
  }))
  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("gate_triggers")
  collection.fields.removeByName("regex_sample")
  return app.save(collection)
})
