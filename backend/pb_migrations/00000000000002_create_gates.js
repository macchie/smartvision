/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const collection = new Collection({
    name: "gates",
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
    // External ID sent in the FTP filename / gate-event payload
    new Field({
      name: "gate_id",
      type: "text",
      required: true,
      min: null,
      max: null,
      pattern: "",
    }),
    // "in" = entry gate, "out" = exit gate, "checkpoint" = tracking point
    new Field({
      name: "direction",
      type: "select",
      required: true,
      maxSelect: 1,
      values: ["in", "out", "checkpoint"],
    }),
    // Arbitrary gate metadata (IP, location, model …)
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
    // gate_id is the lookup key during plate-recognition events
    "CREATE UNIQUE INDEX idx_gates_gate_id ON gates (gate_id)",
  ]

  collection.listRule = "@request.auth.id != ''"
  collection.viewRule = "@request.auth.id != ''"
  collection.createRule = "@request.auth.role = 'admin'"
  collection.updateRule = "@request.auth.role = 'admin'"
  collection.deleteRule = "@request.auth.role = 'admin'"

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("gates")
  return app.delete(collection)
})
