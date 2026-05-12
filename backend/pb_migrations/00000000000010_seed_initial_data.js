/// <reference path="../pb_data/types.d.ts" />

// Seeds default accounts:
// 1) App-level admin in the "users" auth collection.
// 2) PocketBase dashboard superuser in the "_superusers" auth collection.
migrate((app) => {
  const usersCol = app.findCollectionByNameOrId("users")
  const superusersCol = app.findCollectionByNameOrId("_superusers")

  const appAdminEmail = "admin@smartvision.local"
  const superuserEmail = "superadmin@smartvision.local"

  // Seed app-level admin in "users" auth collection.
  const appAdminRecords = app.findRecordsByFilter(
    "users",
    "email = '" + appAdminEmail + "'",
    "",
    1,
    0,
  )

  if (appAdminRecords.length === 0) {
    const admin = new Record(usersCol)
    admin.set("user_type", "person")
    admin.set("first_name", "Admin")
    admin.set("last_name", "User")
    admin.set("username", "administrator")
    admin.set("email", appAdminEmail)
    admin.set("emailVisibility", false)
    admin.set("role", "admin")
    admin.set("enabled", true)
    admin.setPassword("Admin123!")
    app.save(admin)
  }

  // Seed PocketBase superuser for the dashboard/admin API.
  const superusers = app.findRecordsByFilter(
    "_superusers",
    "email = '" + superuserEmail + "'",
    "",
    1,
    0,
  )

  if (superusers.length === 0) {
    const superuser = new Record(superusersCol)
    superuser.set("email", superuserEmail)
    superuser.set("emailVisibility", false)
    superuser.setPassword("Admin123!")
    app.save(superuser)
  }

  return
}, (app) => {
  const appAdminEmail = "admin@smartvision.local"
  const superuserEmail = "superadmin@smartvision.local"

  const records = app.findRecordsByFilter(
    "users",
    "email = '" + appAdminEmail + "'",
    "", 1, 0,
  )
  if (records.length > 0) {
    app.delete(records[0])
  }

  const superusers = app.findRecordsByFilter(
    "_superusers",
    "email = '" + superuserEmail + "'",
    "",
    1,
    0,
  )
  if (superusers.length > 0) {
    app.delete(superusers[0])
  }

  return
})
