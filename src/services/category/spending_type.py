"""
Starting positions for the three spending groups.

*** THESE ARE DEFAULTS, NOT INFERENCES, AND THE DIFFERENCE IS THE WHOLE POINT. ***
A default the user can see and change is a starting position. An inference used to
compute a figure is a claim finPal is making about someone's life. A car is
flexible until it is how someone gets to work -- finPal cannot know, so it may
suggest and must never decide.

*** FIXED MEANS CONTRACTUALLY COMMITTED, NOT ESSENTIAL. *** Changing a fixed cost
takes a big decision -- a different flat, a refinance, cancelling a contract --
not a different Tuesday. Groceries is therefore FLEXIBLE: you must eat, but you
choose weekly, and that is exactly where a budget does useful work. Classifying by
necessity instead would put most spending in `fixed` and leave the flexible total
too small to act on, which defeats the page.

*** THE MAP IS KEYED BY PATH, NOT BY BARE NAME. *** finPal has TWO default
category sets and they collide:

    AuthService.create_default_categories    28 paths, is_system=False
    src/data/default_categories              147 paths, is_system=True (the demo)

They share 18 names and three of those mean different things. `Gas` is the
UTILITY BILL under the demo's `Housing` and PETROL under the signup set's
`Transportation`; `Gifts` sits under both `Shopping` and `Charity`; `Education` is
a top-level parent in one tree and a child of `Personal` in the other. Keyed by
bare name, this map writes `flexible` onto a gas bill -- the one thing `fixed`
exists for. The key is therefore `'Parent/Child'` for a subcategory and the bare
name for a top-level one, which is the convention `seed_defaults.py:59` already
builds for its own category map.

MATCHED EXACTLY, never fuzzily. Category names are user-editable, so a
case-insensitive or trimmed match would silently reclassify a renamed category.

*** SOME ENTRIES ARE DELIBERATELY None AND SOME ARE DELIBERATELY ABSENT, AND THE
TWO ARE DIFFERENT. ***

  None    -- "finPal declines to guess." A gym contract is fixed and
             pay-as-you-go is flexible; a repeat prescription is committed and an
             occasional one is not. Health especially: guessing there is both
             wrong and intrusive. These surface in Unsorted, which is what makes
             that section worth showing rather than empty.

  ABSENT  -- "this is not expense spending at all." `Income` and
             `Savings & Investments`. Spec §1 decision 4 rejected a fourth
             `saving` value because `Goal` already owns that money and counting
             it here would count it twice. They carry no `Expense` rows, so they
             never reach the expense groups or Unsorted either.

Owner decisions, 2026-09-10: the 28 signup defaults approved unchanged; the map
extended to both seed sets and keyed by path; Income and Savings excluded; every
debt repayment `fixed`; taxes `non_monthly` except sales tax.
"""

import logging

logger = logging.getLogger(__name__)

FIXED = 'fixed'
FLEXIBLE = 'flexible'
NON_MONTHLY = 'non_monthly'

#: Underscore, not hyphen. A guard keyed to a spelling goes blind.
VALID_SPENDING_TYPES = (FIXED, FLEXIBLE, NON_MONTHLY)


def category_path(name, parent_name=None):
    """The map key for a category: 'Parent/Child', or the bare name at top level.

    `parent_name` of None means top level -- and it must not be interpolated,
    because 'None/Gas' would silently match nothing.
    """
    if parent_name is None:
        return name
    return f'{parent_name}/{name}'


DEFAULT_SPENDING_TYPES = {

    # ==================================================================
    # The SIGNUP set -- AuthService.create_default_categories, 28 paths.
    # Approved unchanged by the owner, 2026-09-10.
    # ==================================================================

    'Housing': FIXED,
    'Housing/Rent/Mortgage': FIXED,          # the name really does contain a slash
    'Housing/Utilities': FIXED,
    'Housing/Home Maintenance': NON_MONTHLY,  # a boiler is not a monthly event

    'Food': FLEXIBLE,
    'Food/Groceries': FLEXIBLE,               # essential, and still a weekly choice
    'Food/Restaurants': FLEXIBLE,
    'Food/Coffee Shops': FLEXIBLE,

    'Transportation': FLEXIBLE,
    'Transportation/Gas': FLEXIBLE,           # PETROL here. Housing/Gas is the bill.
    'Transportation/Public Transit': FLEXIBLE,
    'Transportation/Rideshare': FLEXIBLE,

    'Shopping': FLEXIBLE,
    'Shopping/Clothing': FLEXIBLE,
    'Shopping/Electronics': FLEXIBLE,
    'Shopping/Gifts': NON_MONTHLY,            # December is why this group exists

    'Entertainment': FLEXIBLE,
    'Entertainment/Movies': FLEXIBLE,
    'Entertainment/Music': FLEXIBLE,
    'Entertainment/Subscriptions': FLEXIBLE,  # cancelling one is a different
                                              # Tuesday, and burying them in
                                              # `fixed` hides the thing people
                                              # most need to look at

    # Health is person-dependent and finPal has no business guessing here.
    'Health': None,
    'Health/Medical': None,
    'Health/Pharmacy': None,
    'Health/Fitness': None,                   # gym contract vs pay-as-you-go

    'Personal': None,
    'Personal/Self-care': FLEXIBLE,
    'Personal/Education': NON_MONTHLY,        # termly or annual, rarely monthly

    'Other': None,

    # ==================================================================
    # The DEMO set -- src/data/default_categories.DEFAULT_CATEGORIES.
    # 19 parents, 128 children. This is where all 588 seeded rows that
    # exist anywhere today actually live.
    # ==================================================================

    # -- Housing: the one group where the children genuinely split three ways,
    #    which is why a parent-only map was rejected.
    'Housing/Rent': FIXED,
    'Housing/Mortgage': FIXED,
    'Housing/Property Tax': NON_MONTHLY,
    'Housing/Home Insurance': FIXED,
    'Housing/HOA Fees': FIXED,
    'Housing/Electricity': FIXED,
    'Housing/Water': FIXED,
    'Housing/Gas': FIXED,                     # *** THE UTILITY BILL. ***
    'Housing/Internet': FIXED,
    'Housing/Phone': FIXED,
    'Housing/Cable/Streaming': FLEXIBLE,      # a subscription, and the same
                                              # argument as Subscriptions above
    'Housing/Furniture': FLEXIBLE,
    'Housing/Home Decor': FLEXIBLE,

    # -- Transportation
    'Transportation/Gas/Fuel': FLEXIBLE,
    'Transportation/Car Payment': FIXED,
    'Transportation/Car Insurance': FIXED,
    'Transportation/Car Maintenance': NON_MONTHLY,
    'Transportation/Parking': FLEXIBLE,
    'Transportation/Ride Share': FLEXIBLE,
    'Transportation/Tolls': FLEXIBLE,
    'Transportation/Vehicle Registration': NON_MONTHLY,

    # -- Food & Dining
    'Food & Dining': FLEXIBLE,
    'Food & Dining/Groceries': FLEXIBLE,
    'Food & Dining/Restaurants': FLEXIBLE,
    'Food & Dining/Fast Food': FLEXIBLE,
    'Food & Dining/Coffee Shops': FLEXIBLE,
    'Food & Dining/Bars & Alcohol': FLEXIBLE,
    'Food & Dining/Food Delivery': FLEXIBLE,
    'Food & Dining/Meal Kits': FLEXIBLE,

    # -- Shopping
    'Shopping/Shoes': FLEXIBLE,
    'Shopping/Accessories': FLEXIBLE,
    'Shopping/Books': FLEXIBLE,
    'Shopping/Hobbies': FLEXIBLE,
    'Shopping/Online Shopping': FLEXIBLE,
    'Shopping/Office Supplies': FLEXIBLE,

    # -- Health & Fitness. The parent and the clinical children stay None for
    #    the same reason the signup set's Health does. The two CONTRACTS are
    #    classified, because a contract is a contract.
    'Health & Fitness': None,
    'Health & Fitness/Doctor Visits': None,
    'Health & Fitness/Dentist': None,
    'Health & Fitness/Pharmacy': None,
    'Health & Fitness/Health Insurance': FIXED,
    'Health & Fitness/Gym Membership': FIXED,
    'Health & Fitness/Fitness Classes': FLEXIBLE,
    'Health & Fitness/Sports Equipment': FLEXIBLE,
    'Health & Fitness/Wellness': None,
    'Health & Fitness/Vision Care': None,

    # -- Entertainment
    'Entertainment/Concerts': FLEXIBLE,
    'Entertainment/Sports Events': FLEXIBLE,
    'Entertainment/Streaming Services': FLEXIBLE,
    'Entertainment/Gaming': FLEXIBLE,
    'Entertainment/Hobbies': FLEXIBLE,
    'Entertainment/Events': FLEXIBLE,

    # -- Personal Care. Distinct from the signup set's `Personal`, which is a
    #    catch-all; these are unambiguously discretionary.
    'Personal Care': FLEXIBLE,
    'Personal Care/Hair Care': FLEXIBLE,
    'Personal Care/Salon/Spa': FLEXIBLE,
    'Personal Care/Cosmetics': FLEXIBLE,
    'Personal Care/Toiletries': FLEXIBLE,
    'Personal Care/Skincare': FLEXIBLE,

    # -- Education
    'Education': NON_MONTHLY,
    'Education/Tuition': NON_MONTHLY,
    'Education/Books & Supplies': NON_MONTHLY,
    'Education/Online Courses': FLEXIBLE,
    'Education/Student Loans': FIXED,         # a repayment, filed under the wrong
                                              # parent; it is still a repayment
    'Education/Workshops': FLEXIBLE,

    # -- Travel. Non-monthly as a subtree: a trip is a lump that arrives a few
    #    times a year, and rendering it against a monthly view as an overspend
    #    every time is spec §10 item 3's open question, not a reason to call it
    #    flexible.
    'Travel': NON_MONTHLY,
    'Travel/Flights': NON_MONTHLY,
    'Travel/Hotels': NON_MONTHLY,
    'Travel/Car Rental': NON_MONTHLY,
    'Travel/Activities': NON_MONTHLY,
    'Travel/Travel Insurance': NON_MONTHLY,
    'Travel/Souvenirs': NON_MONTHLY,

    # -- Pets
    'Pets': FLEXIBLE,
    'Pets/Pet Food': FLEXIBLE,
    'Pets/Veterinary': NON_MONTHLY,
    'Pets/Pet Supplies': FLEXIBLE,
    'Pets/Grooming': FLEXIBLE,
    'Pets/Pet Insurance': FIXED,

    # -- Family & Kids
    'Family & Kids': FLEXIBLE,
    'Family & Kids/Childcare': FIXED,         # a nursery place is a contract
    'Family & Kids/Diapers & Baby Care': FLEXIBLE,
    'Family & Kids/Toys': FLEXIBLE,
    'Family & Kids/Child Activities': FLEXIBLE,
    'Family & Kids/Allowance': FLEXIBLE,

    # -- Debt & Loans. Owner decision: every repayment is fixed. It is the
    #    definition of contractually committed, and learnPal's debt route needs
    #    it visible rather than excluded.
    'Debt & Loans': FIXED,
    'Debt & Loans/Credit Card Payment': FIXED,
    'Debt & Loans/Student Loan': FIXED,
    'Debt & Loans/Personal Loan': FIXED,
    'Debt & Loans/Car Loan': FIXED,
    'Debt & Loans/Other Debt': FIXED,

    # -- Savings & Investments: ABSENT. See the module docstring. `Goal` owns it.

    # -- Insurance
    'Insurance': FIXED,
    'Insurance/Life Insurance': FIXED,
    'Insurance/Health Insurance': FIXED,
    'Insurance/Auto Insurance': FIXED,
    'Insurance/Home Insurance': FIXED,
    'Insurance/Disability Insurance': FIXED,

    # -- Taxes. Owner decision: non-monthly, except sales tax, which arrives
    #    with the purchase it is charged on and so moves with spending.
    'Taxes': NON_MONTHLY,
    'Taxes/Federal Tax': NON_MONTHLY,
    'Taxes/State Tax': NON_MONTHLY,
    'Taxes/Property Tax': NON_MONTHLY,
    'Taxes/Sales Tax': FLEXIBLE,

    # -- Charity. Regular giving can be as committed as a direct debit, but it
    #    can also be stopped this month without consequence, which is the test.
    'Charity': FLEXIBLE,
    'Charity/Religious': FLEXIBLE,
    'Charity/Non-Profit': FLEXIBLE,
    'Charity/Gifts': NON_MONTHLY,
    'Charity/Crowdfunding': FLEXIBLE,

    # -- Business
    'Business': FLEXIBLE,
    'Business/Office Rent': FIXED,
    'Business/Equipment': NON_MONTHLY,
    'Business/Software & Tools': FLEXIBLE,
    'Business/Marketing': FLEXIBLE,
    'Business/Professional Services': FLEXIBLE,
    'Business/Business Travel': NON_MONTHLY,
    'Business/Meals & Entertainment': FLEXIBLE,

    # -- Miscellaneous is the one subtree finPal should not characterise at all.
    #    A bank fee can be a monthly account charge or a one-off penalty, and a
    #    late fee is a consequence rather than a choice.
    'Miscellaneous': None,
    'Miscellaneous/Bank Fees': None,
    'Miscellaneous/ATM Fees': None,
    'Miscellaneous/Late Fees': None,
    'Miscellaneous/Other': None,
}


def default_for_path(path):
    """The seeded default for a category PATH, or None.

    Exact match only. A user's own category, or a renamed seeded one, gets None --
    theirs to classify.
    """
    return DEFAULT_SPENDING_TYPES.get(path)


def default_for(name, parent_name=None):
    """The seeded default for a category by name and parent name."""
    return default_for_path(category_path(name, parent_name))


def backfill_spending_types():
    """Apply the defaults to seeded categories that have none. Returns the count set.

    *** CONDITION-KEYED, NOT VERSION-KEYED (D-178). *** Nothing stores "this ran".
    Both conditions below are read from the data itself, so re-running is a no-op
    and an instance that was already live when this shipped gets corrected rather
    than skipped -- which is the exact failure D-178 records.

    *** THE PREDICATE DOES NOT MENTION `is_system`, AND THAT IS DELIBERATE. *** The
    flag points the wrong way in both directions: `create_default_categories` sets
    it only on "Other", so 27 of the 28 signup categories are `is_system=False`,
    while the demo seeder sets it on all 147. Keying on it selects the wrong
    population whichever value you pick. The path being in the map is a stronger
    statement than the flag ever was.

    *** THE ONCE-PER-INSTANCE GUARD, AND THE HOLE IT EXISTS FOR. *** Clearing a
    category back to unsorted writes NULL -- which is precisely this function's
    other condition -- and this runs at EVERY boot, so without the guard every
    restart and every deploy would silently re-default a choice the user had just
    made. Spec section 4 promises the opposite. So: if any category on this
    instance already carries a spending_type, the feature has taken effect here and
    there is nothing to do. A fresh install with no categories does NOT arm the
    guard, so an instance that gains rows later still gets them defaulted; users
    created after that get theirs from `create_default_categories` at signup.

    Never raises: this runs at boot and a bad row must not stop the app starting.
    """
    from src.extensions import db
    from src.models.category import Category

    try:
        already_classified = db.session.query(Category.id).filter(
            Category.spending_type.isnot(None)
        ).first()
        if already_classified is not None:
            return 0

        rows = Category.query.filter(Category.spending_type.is_(None)).all()
        if not rows:
            return 0

        # The path needs the parent's NAME, so index every row by id first. One
        # extra pass over a table with a few hundred rows per instance.
        name_by_id = {row.id: row.name for row in Category.query.all()}

        changed = 0
        for row in rows:
            parent_name = name_by_id.get(row.parent_id) if row.parent_id else None
            value = default_for_path(category_path(row.name, parent_name))
            if value is None:
                continue
            row.spending_type = value
            changed += 1

        if changed:
            db.session.commit()
            logger.info('Backfilled spending_type on %d categories.', changed)
        return changed
    except Exception:
        db.session.rollback()
        logger.exception('spending_type backfill failed; continuing boot.')
        return 0
