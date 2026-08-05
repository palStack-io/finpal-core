"""Categories API endpoints"""
from flask import request
from flask_restx import Namespace, Resource, fields
from flask_jwt_extended import jwt_required, get_jwt_identity
from src.models.category import Category
from src.extensions import db
from schemas import category_schema, categories_schema
from schemas.input_schemas import category_input
from src.utils.validation import validate_request, validation_error_response

import logging
from src.models.personal_access_token import SCOPE_READ
from src.utils.api_auth import api_auth_required

logger = logging.getLogger(__name__)


# Create namespace
ns = Namespace('categories', description='Category operations')

# Define request/response models
category_model = ns.model('Category', {
    'name': fields.String(required=True, description='Category name'),
    'icon': fields.String(description='Category icon class (e.g., fa-home)'),
    'parent_id': fields.Integer(description='Parent category ID for subcategories'),
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
        from src.utils.household import get_all_user_ids
        current_user_id = get_jwt_identity()

        # Get all categories for the household
        categories = Category.query.filter(Category.user_id.in_(get_all_user_ids())).all()

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
                icon=validated.get('icon', 'fa-tag'),
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


# CategoryDetail used to live here and has been retired. It was dead code: the
# legacy `category_api` blueprint registers first and its
# `/api/v1/categories/<int:category_id>` matches exactly the same requests as
# `<int:id>` did, since the converter variable name plays no part in matching. So
# GET, PUT and DELETE here never ran, under either spelling.
#
# Unlike the categories *collection* above, the detail route carried no scope
# disagreement to resolve: this handler filtered `user_id=current_user_id` and the
# blueprint's checks `category.user_id != identity`, so both are per-user and only
# the status code for someone else's category differed (404 here, 403 there). That
# is why this half could be settled now while the collection stays deferred —
# see _KNOWN_DUPLICATE_ROUTES in src/__init__.py and AUDIT.md D-20.
#
# The blueprint also serves PATCH, which this never did.
