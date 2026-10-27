# pack-builder (stub)

Offline / CI-only job that will run AGPL solvers and emit:

- `packs/{pack_id}/{version}/manifest.json` (PackManifest schema)
- `blobs/{sha256}` content-addressed strategy + node_index payloads

**Never** deploy this image to Vercel. Web app consumes published packs only.
