"""
Transaction Service Module
Handles transaction (expense/income/transfer) and tag management

There is deliberately no `api_bp` here any more. This package used to export a
legacy Flask blueprint at /api/v1/transactions whose list, detail and create
routes all shadowed the flask-restx handlers in api/v1/transactions.py. The
blueprint registered first in src/__init__.py, so it won the slash-less spelling
while restx served the slashed one, and web-ui (which omits the slash) and mobile
(which includes it) were reaching different code for the same endpoint.

PR #42 retired the list and detail routes; the create route followed, which left
the blueprint with no rules at all — so it is gone rather than registered empty.
`api/v1/transactions.py` is now the only implementation, for both spellings.
"""
