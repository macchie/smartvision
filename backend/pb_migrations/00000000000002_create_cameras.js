/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const collection = new Collection({
    name: "cameras",
    type: "base",
    fields: [
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
      // "in" = entry camera, "out" = exit camera
      new Field({
        name: "direction",
        type: "select",
        required: true,
        maxSelect: 1,
        values: ["in", "out"],
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
    ],
    indexes: [
      // camera_id is the lookup key during plate-recognition events
      "CREATE UNIQUE INDEX idx_cameras_camera_id ON cameras (camera_id)",
    ],
    listRule:   "@request.auth.id != ''",
    viewRule:   "@request.auth.id != ''",
    createRule: "@request.auth.role = 'admin'",
    updateRule: "@request.auth.role = 'admin'",
    deleteRule: "@request.auth.role = 'admin'",
  })

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("cameras")
  return app.delete(collection)
})
