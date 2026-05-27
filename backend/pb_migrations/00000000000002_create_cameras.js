/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const collection = new Collection({
    name: "cameras",
    type: "base",
  })

  collection.fields = [
    // Human-readable label
    new Field({
      name: "name",
      type: "text",
      required: true,
      min: null,
      max: null,
      pattern: "",
    }),
    // External ID sent in the FTP filename / camera-event payload
    new Field({
      name: "camera_id",
      type: "text",
      required: true,
      min: null,
      max: null,
      pattern: "",
    }),
    // "in" = entry camera, "out" = exit camera, "checkpoint" = tracking point
    new Field({
      name: "direction",
      type: "select",
      required: true,
      maxSelect: 1,
      values: ["in", "out", "checkpoint"],
    }),
    // Arbitrary camera metadata (IP, location, model …)
    new Field({
      name: "metadata",
      type: "json",
      maxSize: 5242880,
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
    // camera_id is the lookup key during plate-recognition events
    "CREATE UNIQUE INDEX idx_cameras_camera_id ON cameras (camera_id)",
  ]

  collection.listRule = "@request.auth.id != ''"
  collection.viewRule = "@request.auth.id != ''"
  collection.createRule = "@request.auth.role = 'admin'"
  collection.updateRule = "@request.auth.role = 'admin'"
  collection.deleteRule = "@request.auth.role = 'admin'"

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("cameras")
  return app.delete(collection)
})
