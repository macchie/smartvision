/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  // Reports are generated on demand by hooks/routes; no persistent reports
  // collection migration is required in the current schema.
  return
}, (app) => {
  return
})
