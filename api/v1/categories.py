"""Categories API endpoints"""
from flask import request
from flask_restx import Namespace, Resource, fields
from flask_jwt_extended import jwt_required, get_jwt_identity
from werkzeug.exceptions import HTTPException
from src.models.category import Category
from src.extensions import db
from src.services.category.service import CategoryService
from schemas import category_schema, categories_schema
from schemas.input_schemas import category_input
from src.utils.validation import validate_request, validation_error_response

import logging
from src.models.personal_access_token import SCOPE_READ
from src.utils.api_auth import api_auth_required

logger = logging.getLogger(__name__)


# Create namespace
ns = Namespace('categories', description='Category operations')

category_service = CategoryService()

# Define request/response models
category_model = ns.model('Category', {
    'name': fields.String(required=True, description='Category name'),
    'icon': fields.String(description='Category icon class (e.g., fa-home)'),
    # `color` was missing from this model while `category_input` validated it and
    # the handler discarded it — so the document was wrong in two directions at
    # once. Declared now that it is actually stored. #68's lesson: publishing a
    # model makes its errors real, and a route documented with the wrong contract
    # breaks a generated client as badly as a route that is missing.
    'color': fields.String(description='Hex colour, e.g. #6c757d'),
    'parent_id': fields.Integer(description='Parent category ID for subcategories'),
})


# PUT and PATCH share this. Every field is optional: the handler rejects only a
# wholly absent body, then reads each key with `.get()` and leaves the column
# alone when it is missing. `Category` (the create model) is a different shape
# and cannot be reused - it requires `name`.
category_update_model = ns.model('CategoryUpdate', {
    'name': fields.String(required=False, description='New display name'),
    'icon': fields.String(required=False, description='New icon'),
    'color': fields.String(required=False, description='New colour'),
})


@ns.route('/')
class CategoryList(Resource):
    @ns.doc('list_categories', security='Bearer')
    # Accepts a personal access token as well as a session, so an MCP
    # client or script can read. Reads need authentication only; the
    # write tiering is separate and unchanged.
    @api_auth_required(scope=SCOPE_READ)
    def get(self):
        """Get all categories for household"""
        # `visible_user_ids(caller)`, NOT `get_all_user_ids()`. This list was paired
        # with a `can_manage` gated on `household_user_ids()`, so a demo account was
        # shown the whole instance's categories and could manage none of them, and a
        # real user was shown demo-owned rows that "Invalid category selected"
        # refused. Same shape as D-43/D-66, one table over.
        from src.utils.household import visible_user_ids
        current_user_id = get_jwt_identity()

        # Every category this caller may see — the household for a member, itself
        # alone for a demo account.
        categories = Category.query.filter(
            Category.user_id.in_(visible_user_ids(current_user_id))).all()

        # Serialize
        result = categories_schema.dump(categories)

        return {
            'success': True,
            'categories': result
        }, 200

    @ns.doc('create_category', security='Bearer')
    @ns.expect(category_model)
    @jwt_required()
    def post(self):
        """Create a new category"""
        current_user_id = get_jwt_identity()
        data = request.get_json()

        validated, errors = validate_request(category_input, data)
        if errors:
            return validation_error_response(errors)

        try:
            new_category = Category(
                name=validated['name'],
                icon=validated.get('icon', '🏷️'),  # emoji, not a FontAwesome name — web-ui renders it as text
                # `color` was validated by `category_input` and then dropped on
                # the floor — a client could send it, get a 201, and find no
                # colour stored. The retired blueprint's `create_category` did
                # persist it, and this handler now serves the slash-less spelling
                # that blueprint used to own, so carrying it over is preserving
                # behaviour rather than adding a feature. Default matches the
                # blueprint's.
                color=validated.get('color', '#6c757d'),
                parent_id=validated.get('parent_id'),
                user_id=current_user_id
            )

            db.session.add(new_category)
            db.session.commit()

            result = category_schema.dump(new_category)

            return {
                'success': True,
                'category': result,
                'message': 'Category created successfully'
            }, 201

        except Exception as e:
            db.session.rollback()
            return {
                'success': False,
                'error': 'Internal server error'
            }, 400


# CategoryDetail is BACK, below, and this time it is the live handler: the
# `category_api` blueprint is deleted and its five rules are all served here, so
# the categories API appears in swagger for the first time and **D-20 is closed**.
#
# The note that used to sit here said the detail half "could be settled now while
# the collection stays deferred", because converging the collection would have
# decided person-vs-household by accident. That is no longer a risk: the owner
# settled the model on 2026-08-06 — a household is the instance, ownership sits on
# the *account*, and "budget, categories and rest is for household". So categories
# are household property by decision, `_KNOWN_DUPLICATE_ROUTES` is empty, and one
# implementation serves both slash spellings.
#
# What that changes, deliberately, and why each was necessary rather than
# incidental:
#
#   * `GET /api/v1/categories` (no trailing slash — the spelling **web-ui** sends)
#     was per-user and is now household-wide. This is the D-20 fix and it is
#     visible: the web category list starts showing every member's categories.
#   * Editing and deleting are permitted for any category in the household, via
#     `CategoryService.can_manage`. Not optional — web-ui's delete button is the
#     only live category mutation in either client, so a household-wide list with a
#     per-user permission would have rendered rows whose delete answered 400.
#   * `POST` now persists `color`, which restx validated and silently discarded.
#     The blueprint stored it, and this handler inherits the blueprint's callers.
#
# What it deliberately does NOT change: the response shapes. The detail routes keep
# the blueprint's bare bodies — a plain six-field dict from `GET`, `{'message'}`
# from `PUT`/`PATCH`/`DELETE` — rather than adopting the `{'success', ...}`
# envelope their sibling collection uses. #64 made the same call for
# `POST /groups/<id>/members`: a port changes routing, not contracts. Both clients
# do read `response.data.category` from create/update/detail and get `undefined`
# today, but that code is dead on both sides (web-ui's Categories.tsx only lists
# and deletes; no mobile screen uses the detail hooks), so it is noted in AUDIT.md
# and left for 1c, which regenerates the service layer anyway.
#
# All of it is pinned by tests/integration/test_categories_contract.py, which is
# split into PINS and THE FIX for exactly this reason — every `test_fix_*` there
# was watched failing against the pre-port code.
#
# PATCH is spelled out separately: the blueprint shared one decorator between PUT
# and PATCH, and restx does not.


@ns.route('/<int:category_id>')
@ns.param('category_id', 'The category identifier')
class CategoryDetail(Resource):
    @ns.doc('get_category', security='Bearer')
    @jwt_required()
    def get(self, category_id):
        """Get a single category by ID"""
        try:
            category = category_service.get_category(category_id)

            if not category or not category_service.can_manage(
                    category, get_jwt_identity()):
                # One answer for "no such row" and "not in this household", so
                # the endpoint is not an existence oracle for other instances.
                return {'error': 'Category not found'}, 404

            return {
                'id': category.id,
                'name': category.name,
                'icon': category.icon,
                'color': category.color,
                'parent_id': category.parent_id,
                'is_system': category.is_system,
            }, 200

        except HTTPException:
            raise
        except Exception:
            logger.exception('Unhandled error')
            return {'error': 'An internal error occurred'}, 500

    @ns.doc('update_category', security='Bearer')
    @ns.expect(category_update_model)
    @jwt_required()
    def put(self, category_id):
        """Update a category"""
        try:
            identity = get_jwt_identity()
            data = request.get_json()

            if not data:
                return {'error': 'Request body is required'}, 400

            success, message = category_service.update_category(
                category_id,
                identity,
                name=data.get('name'),
                icon=data.get('icon'),
                color=data.get('color')
            )

            if success:
                return {'message': message}, 200
            return {'error': message}, 400

        except HTTPException:
            raise
        except Exception:
            db.session.rollback()
            logger.exception('Unhandled error')
            return {'error': 'An internal error occurred'}, 500

    @ns.doc('patch_category', security='Bearer')
    @ns.expect(category_update_model)
    @jwt_required()
    def patch(self, category_id):
        """Update a category (alias for PUT, which the blueprint shared)"""
        return self.put(category_id)

    @ns.doc('delete_category', security='Bearer')
    @jwt_required()
    def delete(self, category_id):
        """Delete a category"""
        try:
            identity = get_jwt_identity()

            success, message = category_service.delete_category(
                category_id, identity)

            if success:
                return {'message': message}, 200
            return {'error': message}, 400

        except HTTPException:
            raise
        except Exception:
            db.session.rollback()
            logger.exception('Unhandled error')
            return {'error': 'An internal error occurred'}, 500
