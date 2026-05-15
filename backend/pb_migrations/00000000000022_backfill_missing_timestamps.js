/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const TARGET_COLLECTIONS = ["users", "cameras", "room_groups", "rooms", "vehicles", "accesses", "room_key_events"]

  const hasField = (collection, fieldName) => {
    for (const field of collection.fields) {
      if (field.name === fieldName) {
        return true
      }
    }
    return false
  }

  const toPocketBaseDate = (value) => {
    const raw = String(value || "").trim()
    if (!raw) {
      return ""
    }

    if (raw.indexOf("T") >= 0) {
      return raw.replace("T", " ")
    }

    return raw
  }

  const now = () => new Date().toISOString().replace("T", " ")

  const readExistingTimestamp = (record, primary, fallback) => {
    const first = toPocketBaseDate(record.getString(primary))
    if (first) {
      return first
    }

    const second = toPocketBaseDate(record.getString(fallback))
    if (second) {
      return second
    }

    return now()
  }

  for (const name of TARGET_COLLECTIONS) {
    const collection = app.findCollectionByNameOrId(name)

    let changedCollection = false
    if (!hasField(collection, "created_at")) {
      collection.fields.add(new Field({ name: "created_at", type: "date" }))
      changedCollection = true
    }

    if (!hasField(collection, "updated_at")) {
      collection.fields.add(new Field({ name: "updated_at", type: "date" }))
      changedCollection = true
    }

    if (changedCollection) {
      app.save(collection)
    }

    const records = app.findRecordsByFilter(name, "id != ''", "", 10000, 0)
    for (const record of records) {
      const createdAt = toPocketBaseDate(record.getString("created_at"))
      const updatedAt = toPocketBaseDate(record.getString("updated_at"))

      const nextCreatedAt = createdAt || readExistingTimestamp(record, "created", "updated")
      const nextUpdatedAt = updatedAt || readExistingTimestamp(record, "updated", "created")

      record.set("created_at", nextCreatedAt)
      record.set("updated_at", nextUpdatedAt)
      app.save(record)
    }
  }

  return
}, (app) => {
  return
})
