/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const usersCol = app.findCollectionByNameOrId("users")

  const collection = new Collection({
    name: "users_config",
    type: "base",
  })

  collection.fields = [
    // Owner of this configuration record. One config per user.
    new Field({
      name: "user",
      type: "relation",
      required: true,
      collectionId: usersCol.id,
      cascadeDelete: true,
      minSelect: null,
      maxSelect: 1,
    }),

    // Preferred UI language (BCP-47 base tag). Mirrors the locales the
    // frontend ships translation bundles for.
    new Field({
      name: "language",
      type: "select",
      required: false,
      maxSelect: 1,
      values: ["en", "it", "es", "fr"],
    }),

    // Preferred colour scheme. Empty = fall back to app default (light).
    new Field({
      name: "theme",
      type: "select",
      required: false,
      maxSelect: 1,
      values: ["light", "dark"],
    }),

    // Per-user dashboard layout / widget configuration (free-form JSON).
    new Field({
      name: "dashboard_config",
      type: "json",
      required: false,
      maxSize: 100000,
    }),

    // Catch-all for additional UI preferences without a schema migration.
    new Field({
      name: "metadata",
      type: "json",
      required: false,
      maxSize: 100000,
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
    // Exactly one config row per user.
    "CREATE UNIQUE INDEX idx_users_config_user ON users_config (user)",
  ]

  // Owners manage their own config; admins/operators may read all for support.
  collection.listRule = "user = @request.auth.id || @request.auth.role = 'admin' || @request.auth.role = 'operator'"
  collection.viewRule = "user = @request.auth.id || @request.auth.role = 'admin' || @request.auth.role = 'operator'"
  // A user may only create/update a config bound to their own account.
  collection.createRule = "user = @request.auth.id"
  collection.updateRule = "user = @request.auth.id"
  collection.deleteRule = "user = @request.auth.id || @request.auth.role = 'admin'"

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("users_config")
  return app.delete(collection)
})
