/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const patchRules = (collectionName, rules) => {
    try {
      const col = app.findCollectionByNameOrId(collectionName)
      col.listRule = rules.listRule
      col.viewRule = rules.viewRule
      col.createRule = rules.createRule
      col.updateRule = rules.updateRule
      col.deleteRule = rules.deleteRule
      app.save(col)
    } catch (_) {
      console.log("[crud rules fix] skipping missing collection:", collectionName)
    }
  }

  patchRules("cameras", {
    listRule: "@request.auth.id != ''",
    viewRule: "@request.auth.id != ''",
    createRule: "@request.auth.role = 'admin'",
    updateRule: "@request.auth.role = 'admin'",
    deleteRule: "@request.auth.role = 'admin'",
  })

  patchRules("vehicles", {
    listRule: "@request.auth.id != ''",
    viewRule: "@request.auth.id != ''",
    createRule: "@request.auth.role = 'admin' || @request.auth.role = 'operator'",
    updateRule: "@request.auth.role = 'admin' || @request.auth.role = 'operator'",
    deleteRule: "@request.auth.role = 'admin' || @request.auth.role = 'operator'",
  })

  patchRules("room_groups", {
    listRule: "@request.auth.id != ''",
    viewRule: "@request.auth.id != ''",
    createRule: "@request.auth.role = 'admin' || @request.auth.role = 'operator'",
    updateRule: "@request.auth.role = 'admin' || @request.auth.role = 'operator'",
    deleteRule: "@request.auth.role = 'admin'",
  })

  patchRules("rooms", {
    listRule: "@request.auth.id != ''",
    viewRule: "@request.auth.id != ''",
    createRule: "@request.auth.role = 'admin' || @request.auth.role = 'operator'",
    updateRule: "@request.auth.role = 'admin' || @request.auth.role = 'operator'",
    deleteRule: "@request.auth.role = 'admin'",
  })

  patchRules("users", {
    listRule: "@request.auth.role = 'admin' || @request.auth.role = 'operator'",
    viewRule: "id = @request.auth.id || @request.auth.role = 'admin' || @request.auth.role = 'operator'",
    createRule: "@request.auth.role = 'admin' || @request.auth.role = 'operator'",
    updateRule: "id = @request.auth.id || @request.auth.role = 'admin' || @request.auth.role = 'operator'",
    deleteRule: "@request.auth.role = 'admin'",
  })

  return
}, (app) => {
  // Keep rollback non-destructive to avoid reverting permissions unexpectedly.
  return
})
