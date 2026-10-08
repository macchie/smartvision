/// <reference path="../pb_data/types.d.ts" />

// Adds German ("de") to the allowed values of the users_config.language
// select field, keeping it in sync with the frontend translation bundles.
migrate((app) => {
  const collection = app.findCollectionByNameOrId("users_config")
  const field = collection.fields.getByName("language")
  field.values = ["en", "it", "es", "fr", "de"]
  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("users_config")
  const field = collection.fields.getByName("language")
  field.values = ["en", "it", "es", "fr"]
  return app.save(collection)
})
