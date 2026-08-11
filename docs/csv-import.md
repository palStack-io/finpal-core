# Automatic CSV import (folder watch)

Drop a statement into a watched folder and finPal imports it. The variables that control this
are in [ENV_REFERENCE.md](ENV_REFERENCE.md#csv-folder-import).

## Automatic CSV Import (Folder Watch)

If your bank has no SimpleFin support, point finPal at a folder instead. Drop a
CSV in and it is imported on the next scan, without opening the app.

### 1. Mount a folder

```yaml
services:
  backend:
    volumes:
      - ~/finpal-inbox:/data/inbox
    environment:
      CSV_IMPORT_ROOT: /data/inbox
```

Mount it on the **scheduler** process too — that is what actually runs the scan.
Folder watching needs `RUN_SCHEDULER=true` in exactly one process; see the
scheduler notes in `docker-compose.yml`.

### 2. Import the first file of each format by hand

Upload one file from a given bank through **Transactions → Import CSV** and set
the columns yourself. finPal fingerprints the header row and saves the mapping,
so every later file with the same headers is imported with those exact columns.
This is the difference between a mapping that is *known* and one that is
*guessed* — worth the one-time effort per bank.

### 3. Add the folder in Settings

**Settings → Integrations → Automatic CSV Import.** Add the folder, and use
**Scan now** to check the wiring rather than waiting for the 5-minute schedule.

### What happens to the files

| Directory | Meaning |
|-----------|---------|
| *(the folder itself)* | Waiting to be imported |
| `processed/` | Imported successfully, renamed `YYYY-MM-DD-<original>.csv` |
| `failed/` | Rejected, with a `.txt` sidecar giving the reason |

A file is skipped on the scan that first sees it and imported on the next one.
That is deliberate: it proves the file is not still being written. Duplicate
content is detected by hash, so re-dropping the same file imports nothing.

### Unknown formats are guessed, then flagged

A header shape finPal has never seen is mapped heuristically — the columns most
likely to be date, description and amount. The import still happens, but the
batch is marked as a guessed mapping and a banner appears on the dashboard with
a one-click **Undo**. Ambiguous dates (`01/02/2026`) are resolved from the data
where possible and otherwise assumed month-first, which is exactly the kind of
mistake that banner exists to catch. Review it before trusting the numbers.

A file whose columns cannot be identified at all is moved to `failed/` rather
than imported with garbage.

### Notes and limits

- **Admin-only.** Configuring a watched folder requires an admin account, and
  imports land on that account. One shared folder per server; per-user folders
  are a later extension.
- Paths outside `CSV_IMPORT_ROOT` are rejected, so this cannot be turned into a
  way to read arbitrary files off the host.
- Any batch can be undone from **Settings → Integrations**, which removes exactly
  the transactions that import created. Undo is not repeatable.

---

