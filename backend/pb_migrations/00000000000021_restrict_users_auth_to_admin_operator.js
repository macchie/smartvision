/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const collection = app.findCollectionByNameOrId("users")

  // Only enabled admin/operator accounts are allowed to authenticate.
  collection.authRule = "enabled = true && (role = 'admin' || role = 'operator')"

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("users")

  // Restore previous behavior where any valid users credentials could authenticate.
  collection.authRule = ""

  return app.save(collection)
})
