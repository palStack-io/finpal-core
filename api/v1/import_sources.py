"""Import source, batch and profile endpoints.

Three namespaces, not one. The spec's API table mandates top-level
`/api/v1/import-batches` and `/api/v1/import-profiles` (see the design doc), and
the integration tests call `/api/v1/import-batches/<id>`. Nesting the batch routes
inside the import-sources namespace would put them at
`/api/v1/import-sources/batches/...` instead, which matches neither.
"""
from __future__ import annotations

import logging

from flask import request
from flask_jwt_extended import get_jwt_identity, jwt_required
from flask_restx import Namespace, Resource, fields

from src.extensions import db
from src.services.csv_import.review import batch_needs_review
from src.models.import_source import ImportBatch, ImportProfile, ImportSource
from src.models.user import User
from src.services.csv_import.batches import remap_batch, revert_batch
from src.services.csv_import.paths import PathOutsideRootError, resolve_within_root
from src.services.csv_import.scanner import scan_source
from src.utils.decorators import demo_restricted

logger = logging.getLogger(__name__)

ns = Namespace('import-sources', description='Automatic CSV import sources')
batches_ns = Namespace('import-batches', description='CSV import batch history')
profiles_ns = Namespace('import-profiles', description='Saved CSV column mappings')


def _require_admin():
    """Return (user_id, None) or (None, error_response)."""
    user_id = get_jwt_identity()
    user = User.query.filter_by(id=user_id).first()
    if not user or not user.is_admin:
        return None, ({'error': 'Administrator access required'}, 403)
    return user_id, None


def _serialize_source(s):
    return {
        'id': s.id, 'kind': s.kind, 'path': (s.config or {}).get('path'),
        'enabled': s.enabled, 'scan_interval_minutes': s.scan_interval_minutes,
        'last_scanned_at': s.last_scanned_at.isoformat() if s.last_scanned_at else None,
    }


def _serialize_batch(b):
    return {
        'id': b.id, 'filename': b.filename, 'status': b.status,
        'confidence': b.confidence, 'row_count': b.row_count,
        'imported': b.imported_count, 'skipped': b.skipped_count,
        'errors': b.error_count, 'error_details': b.errors or [],
        'mapping_used': b.mapping_used,
        # 'heuristic' means the columns were guessed and want a human's eyes.
        # confidence cannot carry that: the heuristics return 1.0 for an
        # unambiguous header, so it looks identical to a learned mapping.
        'profile_origin': b.profile.origin if b.profile else None,
        # The SERVER owns "does this want a human?" now. It used to be computed
        # in TypeScript inside ImportReviewBanner, and the review email would
        # have made that a second copy in a second language — the shape behind
        # D-52, D-57, D-64 and the two Categories implementations. One
        # definition, two consumers.
        'needs_review': batch_needs_review(b),
        'created_at': b.created_at.isoformat() if b.created_at else None,
        'reverted_at': b.reverted_at.isoformat() if b.reverted_at else None,
    }


import_source_model = ns.model('ImportSourceCreate', {
    'path': fields.String(required=True, description='Directory to watch, inside the permitted import root'),
    'scan_interval_minutes': fields.Integer(
        required=False, description='How often to rescan; server default when omitted'),
})

remap_mapping_model = batches_ns.model('RemapMapping', {
    # These three are required *inside* mapping - the handler loops over exactly
    # these keys and 400s on any that is falsy.
    'date': fields.String(required=True, description='CSV column holding the date'),
    'description': fields.String(required=True, description='CSV column holding the description'),
    'amount': fields.String(required=True, description='CSV column holding the amount'),
})

remap_model = batches_ns.model('RemapBatch', {
    'csv': fields.String(required=True, description='Raw CSV content to re-map'),
    'mapping': fields.Nested(remap_mapping_model, required=True,
                             description='Column mapping to apply'),
    'date_format': fields.String(required=False, description='strptime format for the date column'),
    'sign_convention': fields.String(required=False, description='How to interpret the amount sign'),
})


@ns.route('')
class ImportSourceList(Resource):
    @jwt_required()
    def get(self):
        user_id, err = _require_admin()
        if err:
            return err
        sources = ImportSource.query.filter_by(user_id=user_id).all()
        return {'sources': [_serialize_source(s) for s in sources]}, 200

    @ns.expect(import_source_model)
    @jwt_required()
    @demo_restricted
    def post(self):
        user_id, err = _require_admin()
        if err:
            return err
        data = request.get_json() or {}
        path = (data.get('path') or '').strip()
        if not path:
            return {'error': 'path is required'}, 400
        try:
            resolve_within_root(path)
        except PathOutsideRootError:
            return {'error': 'Path is outside the permitted import root'}, 400

        source = ImportSource(
            kind='local_folder', config={'path': path}, user_id=user_id,
            scan_interval_minutes=int(data.get('scan_interval_minutes', 5)),
        )
        db.session.add(source)
        db.session.commit()
        return {'source': _serialize_source(source)}, 201


@ns.route('/<int:source_id>')
class ImportSourceItem(Resource):
    @jwt_required()
    @demo_restricted
    def delete(self, source_id):
        user_id, err = _require_admin()
        if err:
            return err
        source = ImportSource.query.filter_by(id=source_id, user_id=user_id).first()
        if not source:
            return {'error': 'Import source not found'}, 404
        db.session.delete(source)
        db.session.commit()
        return {'deleted': True}, 200


@ns.route('/<int:source_id>/scan')
class ImportSourceScan(Resource):
    @jwt_required()
    @demo_restricted
    def post(self, source_id):
        user_id, err = _require_admin()
        if err:
            return err
        source = ImportSource.query.filter_by(id=source_id, user_id=user_id).first()
        if not source:
            return {'error': 'Import source not found'}, 404
        batches = scan_source(source)
        return {'batches': [_serialize_batch(b) for b in batches]}, 200


@batches_ns.route('')
class ImportBatchList(Resource):
    @jwt_required()
    def get(self):
        user_id = get_jwt_identity()
        page = request.args.get('page', 1, type=int)
        per_page = min(request.args.get('per_page', 25, type=int), 100)
        query = (ImportBatch.query.filter_by(user_id=user_id)
                 .order_by(ImportBatch.created_at.desc()))
        items = query.paginate(page=page, per_page=per_page, error_out=False)
        return {
            'batches': [_serialize_batch(b) for b in items.items],
            'total': items.total, 'page': page,
        }, 200


@batches_ns.route('/<int:batch_id>')
class ImportBatchItem(Resource):
    @jwt_required()
    @demo_restricted
    def delete(self, batch_id):
        user_id = get_jwt_identity()
        try:
            deleted = revert_batch(batch_id, user_id)
        except LookupError:
            return {'error': 'Import batch not found'}, 404
        except ValueError as exc:
            return {'error': str(exc)}, 409
        return {'reverted': deleted}, 200


@batches_ns.route('/<int:batch_id>/remap')
class ImportBatchRemap(Resource):
    @batches_ns.expect(remap_model)
    @jwt_required()
    @demo_restricted
    def post(self, batch_id):
        user_id = get_jwt_identity()
        data = request.get_json() or {}
        mapping = data.get('mapping') or {}
        raw_csv = data.get('csv')
        for key in ('date', 'description', 'amount'):
            if not mapping.get(key):
                return {'error': f'mapping.{key} is required'}, 400
        if not raw_csv:
            return {'error': 'csv content is required'}, 400
        try:
            batch = remap_batch(
                batch_id, user_id, mapping,
                data.get('date_format', '%Y-%m-%d'),
                data.get('sign_convention', 'negative_is_expense'),
                raw_csv)
        except LookupError:
            return {'error': 'Import batch not found'}, 404
        return {'batch': _serialize_batch(batch)}, 200


@profiles_ns.route('')
class ImportProfileList(Resource):
    @jwt_required()
    def get(self):
        user_id = get_jwt_identity()
        profiles = ImportProfile.query.filter_by(user_id=user_id).all()
        return {'profiles': [{
            'id': p.id, 'name': p.name, 'mapping': p.mapping,
            'date_format': p.date_format, 'sign_convention': p.sign_convention,
            'origin': p.origin, 'confidence': p.confidence,
            'times_used': p.times_used,
        } for p in profiles]}, 200
