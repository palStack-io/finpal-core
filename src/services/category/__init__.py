"""
Category Service
Handles category management and auto-categorization mappings

The five API routes that used to live here (`api_routes.py`, the `category_api`
blueprint) are flask-restx Resources in api/v1/categories.py, so they carry swagger
annotations and the categories API is documented for the first time. It was the last
plain-Flask blueprint in the app.

Deleting it also closed **D-20**: its slash-less collection rule and restx's slashed
one were two different implementations of `GET/POST /api/v1/categories`, and
`url_map.strict_slashes = False` let a trailing slash choose between them — web-ui
reaching the per-user one and mobile the household-wide one. `CategoryService` is
what the Resources delegate to and keeps its name; its permission checks moved from
per-user to household (`can_manage`), which is the ruling, not a side effect —
with demo accounts explicitly excluded, because they are on the instance but are
not household members and their password is published.
"""
