/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const patchRules = (collectionName, listRule, viewRule) => {
    try {
      const col = app.findCollectionByNameOrId(collectionName)
      col.listRule = listRule
      col.viewRule = viewRule
      app.save(col)
    } catch (_) {
      console.log("[rules migration] skipping missing collection:", collectionName)
    }
  }

  // Admin/operator can read all dashboard entities; regular users can keep
  // collection-specific constraints where needed.
  patchRules(
    "accesses",
    "@request.auth.role = 'admin' || @request.auth.role = 'operator' || @request.auth.id != ''",
    "@request.auth.role = 'admin' || @request.auth.role = 'operator' || @request.auth.id != ''",
  )

  patchRules(
    "room_key_events",
    "@request.auth.role = 'admin' || @request.auth.role = 'operator' || @request.auth.id != ''",
    "@request.auth.role = 'admin' || @request.auth.role = 'operator' || @request.auth.id != ''",
  )

  patchRules(
    "cameras",
    "@request.auth.role = 'admin' || @request.auth.role = 'operator' || @request.auth.id != ''",
    "@request.auth.role = 'admin' || @request.auth.role = 'operator' || @request.auth.id != ''",
  )

  patchRules(
    "vehicles",
    "@request.auth.role = 'admin' || @request.auth.role = 'operator' || @request.auth.id != ''",
    "@request.auth.role = 'admin' || @request.auth.role = 'operator' || @request.auth.id != ''",
  )

  patchRules(
    "rooms",
    "@request.auth.role = 'admin' || @request.auth.role = 'operator' || @request.auth.id != ''",
    "@request.auth.role = 'admin' || @request.auth.role = 'operator' || @request.auth.id != ''",
  )

  patchRules(
    "room_groups",
    "@request.auth.role = 'admin' || @request.auth.role = 'operator' || @request.auth.id != ''",
    "@request.auth.role = 'admin' || @request.auth.role = 'operator' || @request.auth.id != ''",
  )

  patchRules(
    "reports",
    "@request.auth.role = 'admin' || @request.auth.role = 'operator'",
    "@request.auth.role = 'admin' || @request.auth.role = 'operator'",
  )

  try {
    const users = app.findCollectionByNameOrId("users")
    users.listRule = "@request.auth.role = 'admin' || @request.auth.role = 'operator'"
    users.viewRule = "@request.auth.role = 'admin' || @request.auth.role = 'operator' || id = @request.auth.id"
    app.save(users)
  } catch (_) {
    console.log("[rules migration] skipping missing collection: users")
  }

  return
}, (app) => {
  // Keep rollback simple: preserve current rules on downgrade.
  return
})
