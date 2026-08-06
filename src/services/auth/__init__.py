"""
Auth Service Module
Handles user authentication and management

The thirteen API routes that used to live here (`api_routes.py`, the `auth_api`
blueprint) are flask-restx resources in api/v1/auth.py, so they carry swagger
annotations — register, login and refresh among them, which the documented API
previously lacked entirely. `AuthService` in `service.py` is unchanged.

Nothing imported `api_bp` except src/__init__.py, and nothing imported
`native_signin_available` or `_complete_native_signin` from outside that module,
so the move is not a public-surface change for any caller.
"""
