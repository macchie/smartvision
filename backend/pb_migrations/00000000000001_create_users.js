/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  // Auth collection — PocketBase provides email, password, emailVisibility,
  // verified, tokenKey, lastResetSentAt, lastVerificationSentAt automatically.
  let collection
  try {
    collection = app.findCollectionByNameOrId("users")
  } catch (_) {
    collection = new Collection({
      name: "users",
      type: "auth",
    })
  }

  // Auth options
  collection.authRule = "" // any valid credentials can authenticate
  collection.passwordAuth = {
    enabled: true,
    identityFields: ["email", "username"],
  }

  collection.fields = [
      // Distinguishes people from companies in this unified collection.
      new Field({
        name: "user_type",
        type: "select",
        required: true,
        maxSelect: 1,
        values: ["person", "employee", "company"],
      }),

      // Display name used for company records and as optional full name.
      new Field({
        name: "name",
        type: "text",
        min: null,
        max: null,
        pattern: "",
      }),

      new Field({
        name: "first_name",
        type: "text",
        min: null,
        max: null,
        pattern: "",
      }),
      new Field({
        name: "last_name",
        type: "text",
        min: null,
        max: null,
        pattern: "",
      }),
      new Field({
        name: "username",
        type: "text",
        min: null,
        max: null,
        pattern: "",
      }),

      // Authorization role.
      // Default "regular" is enforced in lifecycle_hooks.pb.js on create.
      new Field({
        name: "role",
        type: "select",
        required: true,
        maxSelect: 1,
        values: ["regular", "operator", "admin"],
      }),

      // Soft-disable without deleting (mirrors Enabled mixin)
      new Field({
        name: "enabled",
        type: "bool",
      }),

      // Free-text notes (mirrors Notes mixin)
      new Field({
        name: "notes",
        type: "text",
        min: null,
        max: 2000,
        pattern: "",
      }),
  ]

  collection.indexes = [
    "CREATE UNIQUE INDEX idx_users_username ON users (username) WHERE username != ''",
  ]

  // List/view restricted: operators and admins see all; regular users see only themselves
  collection.listRule = "@request.auth.role = 'admin' || @request.auth.role = 'operator'"
  collection.viewRule = "id = @request.auth.id || @request.auth.role = 'admin' || @request.auth.role = 'operator'"
  collection.createRule = "@request.auth.role = 'admin' || @request.auth.role = 'operator'"
  collection.updateRule = "id = @request.auth.id || @request.auth.role = 'admin' || @request.auth.role = 'operator'"
  collection.deleteRule = "@request.auth.role = 'admin'"

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("users")
  return app.delete(collection)
})
