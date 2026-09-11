"""UserModulePreference — whether a user WANTS to see a module.

*** THIS IS A DIFFERENT QUESTION FROM `UserModuleAccess` NEXT DOOR, AND KEEPING
THEM APART IS AN OWNER DECISION (2026-09-11). ***

    UserModuleAccess      "MAY you"    entitlement.  Written by adminPal over
                                       HMAC; `test_the_demo_covers_every_feature`
                                       records it as a Premium concept that core
                                       grants by config.
    UserModulePreference  "DO you WANT TO"  preference. Written by the user, from
                                       Settings -> Modules.

Reusing one row for both was the obvious shortcut and was rejected: a user hiding
learnPal and adminPal revoking a paid entitlement would be the same row, so an
adminPal sync would silently erase a user's choice, or a user's toggle would
silently restore an entitlement they are not owed. Only a `granted_by` string
would have stood between those, and `finpal_premium` is out of scope from here,
so what adminPal actually does could not be verified. **An unverifiable
assumption about someone else's writer is not a foundation.**

*** ABSENT MEANS VISIBLE. *** No row is the overwhelmingly common case, and it
has to mean "show it" — a default of hidden would make every module vanish for
every existing user the moment this table appeared. `visible` is therefore
written explicitly on every upsert and never inferred.

**Preference cannot grant anything.** Effective visibility is
`deployment_enabled AND entitled AND preferred`, and this table only ever
contributes the last term. Hiding a module you are not entitled to is a no-op,
not a grant.

**Release-gating:** a NEW table is created by `create_all()` at boot even on an
existing database, unlike a new column (D-121). No reconcile needed — but it is
only created if this model is imported, which `src/models/__init__.py` does
unconditionally, because preference is a core concern and not a module's.
"""

from datetime import datetime

from src.extensions import db


class UserModulePreference(db.Model):
    __tablename__ = 'user_module_preferences'

    user_id = db.Column(
        db.String(120),
        # *** `ondelete='CASCADE'`. *** A preference is worthless once the user
        # is gone, and it must never be the row that refuses a user deletion --
        # D-184 was exactly that class of defect, and `learn_completions` was a
        # second instance of it on the same day.
        db.ForeignKey('users.id', ondelete='CASCADE'),
        primary_key=True,
        nullable=False,
    )
    # The module slug. Deliberately NOT a foreign key: modules are code, not
    # rows, and a preference for a module that has been uninstalled should be
    # inert rather than un-deletable.
    module_name = db.Column(db.String(100), primary_key=True, nullable=False)

    visible = db.Column(db.Boolean, nullable=False, default=True)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow,
                           onupdate=datetime.utcnow)

    def __repr__(self):
        return f'<UserModulePreference {self.user_id}/{self.module_name} visible={self.visible}>'


def hidden_modules_for(user_id):
    """The slugs this user has hidden. Absent rows are visible, so this is short.

    Returns a plain sorted list -- it goes straight into the auth payload, and a
    stable order keeps the contract tests meaningful.
    """
    rows = db.session.query(UserModulePreference.module_name).filter(
        UserModulePreference.user_id == user_id,
        UserModulePreference.visible.is_(False),
    ).all()
    return sorted(r[0] for r in rows)


def set_module_visibility(user_id, module_name, visible):
    """Upsert one preference. Does NOT commit -- the caller owns the transaction.

    Writes `visible` explicitly in both directions rather than deleting the row
    for the default case: a deleted row and an explicit `visible=True` mean the
    same thing to every reader, but keeping the row preserves `updated_at`, and
    "the user has considered this" is worth knowing when C1f's guided setup asks
    whether to offer the module chooser again.
    """
    row = UserModulePreference.query.filter_by(
        user_id=user_id, module_name=module_name).first()
    if row is None:
        row = UserModulePreference(user_id=user_id, module_name=module_name)
        db.session.add(row)
    row.visible = bool(visible)
    row.updated_at = datetime.utcnow()
    return row
