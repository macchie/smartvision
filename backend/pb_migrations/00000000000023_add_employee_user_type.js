/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const usersCol = app.findCollectionByNameOrId("users")

  const userTypeField = usersCol.fields.find((field) => field.name === "user_type")
  if (userTypeField) {
    const existingValues = Array.isArray(userTypeField.values) ? userTypeField.values : []
    if (!existingValues.includes("employee")) {
      userTypeField.values = ["person", "employee", "company"]
      app.save(usersCol)
    }
  }

  return
}, (app) => {
  const usersCol = app.findCollectionByNameOrId("users")

  const userTypeField = usersCol.fields.find((field) => field.name === "user_type")
  if (userTypeField) {
    userTypeField.values = ["person", "company"]
    app.save(usersCol)
  }

  return
})
