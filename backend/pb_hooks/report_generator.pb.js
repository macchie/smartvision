/// <reference path="../pb_data/types.d.ts" />

/**
 * report_generator.pb.js
 *
 * Custom route: POST /api/reports/generate
 *
 * Replaces the LoopBack Report.generate() remote method.
 * Accepts filter parameters, queries the target collection,
 * serialises results as CSV and stores a report record.
 *
 * Request body:
 * {
 *   "entity":  "accesses" | "room_key_events",
 *   "filter":  "<PocketBase filter expression>",
 *   "sort":    "-created"   (optional, default "-created")
 * }
 *
 * Response:
 * { "report_id": "<id>", "report_url": "/api/files/reports/<id>/<filename>" }
 */

routerAdd("POST", "/api/reports/generate", (e) => {
    // Auth guard: operator or admin
    const auth = e.auth
    if (!auth) {
        return e.unauthorizedError("authentication required", null)
    }
    const userRole = auth.get("role")
    if (userRole !== "admin" && userRole !== "operator") {
        return e.forbiddenError("insufficient permissions", null)
    }

    // Parse body
    const body = $apis.requestInfo(e).body
    const entity = body["entity"]
    const filter = body["filter"] || ""
    const sort   = body["sort"]   || "-created"

    const VALID_ENTITIES = ["accesses", "room_key_events"]
    if (!VALID_ENTITIES.includes(entity)) {
        return e.badRequestError("invalid entity; must be one of: " + VALID_ENTITIES.join(", "), null)
    }

    // Query records
    let records
    try {
        if (filter) {
            records = $app.findRecordsByFilter(entity, filter, sort, 10000, 0)
        } else {
            records = $app.findRecordsByFilter(entity, "id != ''", sort, 10000, 0)
        }
    } catch (err) {
        return e.badRequestError("invalid filter: " + err, null)
    }

    // Build CSV
    const csv = buildCsv(entity, records)

    // Save report record (file storage is out of scope here; store URL as path)
    const reportCollection = $app.findCollectionByNameOrId("reports")
    const report = new Record(reportCollection)
    report.set("entity", entity)
    report.set("filter_options", { filter, sort })
    report.set("report_url", "/api/reports/download/" + report.id)
    report.set("download_count", 0)
    report.set("enabled", true)

    // Expire in 7 days
    const expire = new Date()
    expire.setDate(expire.getDate() + 7)
    report.set("expire", expire.toISOString())

    $app.save(report)

    // Attach CSV as in-memory result (for small datasets)
    return e.json(200, {
        report_id:   report.id,
        entity:      entity,
        total_rows:  records.length,
        csv_preview: csv.split("\n").slice(0, 5).join("\n"),
    })
})

/**
 * Builds a simple CSV from PocketBase records.
 * Column set varies by entity type.
 */
function buildCsv(entity, records) {
    if (records.length === 0) return "no data"

    const columnsByEntity = {
        accesses:         ["id", "access_type", "user", "vehicle", "driver_user", "camera", "did_leave", "deletable", "made_by_user", "reason", "created"],
        room_key_events:  ["id", "room", "user", "is_collecting", "did_return_key", "reason", "created"],
    }

    const columns = columnsByEntity[entity] || Object.keys(records[0].publicExport())
    const header  = columns.join(",")
    const rows    = records.map(r => {
        return columns.map(col => {
            const val = r.get(col)
            if (val === null || val === undefined) return ""
            const str = String(val).replace(/"/g, '""')
            return str.includes(",") || str.includes('"') ? `"${str}"` : str
        }).join(",")
    })

    return [header, ...rows].join("\n")
}
