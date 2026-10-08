"""The guide registry is bilingual by construction, and a test says so.

Server copy has no `i18n check` gate (core has no client i18n at all), so this file
is the gate: both languages, the same shape, the same placeholders, real poses.
"""
import re

import pytest

from src.services.onboarding import guides
from src.services.onboarding.guides import PAGE_GUIDES, PAGES, POSES, guides_for, resolve_lang

_PLACEHOLDER = re.compile(r'\{[a-z_]+\}')


def test_every_page_has_both_languages_with_the_same_shape():
    for page in PAGES:
        entry = PAGE_GUIDES[page]
        en, es = entry['copy']['en'], entry['copy']['es']
        assert en['heading'] and es['heading'], page
        assert len(en['lines']) == len(es['lines']) >= 2, page
        assert all(l.strip() for l in en['lines'] + es['lines']), page
        assert entry['pose'] in POSES, (page, entry['pose'])
        for en_l, es_l in zip(en['lines'], es['lines']):
            assert _PLACEHOLDER.findall(en_l) == _PLACEHOLDER.findall(es_l), (page, en_l)


def test_every_tour_step_has_both_languages_and_a_target():
    for page in PAGES:
        steps = PAGE_GUIDES[page].get('tour', [])
        for step in steps:
            assert step['target'] and re.fullmatch(r'[a-z][a-z-]*', step['target'])
            for lang in ('en', 'es'):
                assert step[lang]['title'].strip() and step[lang]['body'].strip(), (page, step)


def test_registry_pages_are_exactly_PAGES():
    assert set(PAGE_GUIDES) == set(PAGES)


@pytest.mark.parametrize('user_locale,accept,expected', [
    (None, None, 'en'),
    ('es', None, 'es'),
    ('es-MX', None, 'es'),
    ('ES', None, 'es'),
    ('fr', None, 'en'),
    ('', None, 'en'),
    ('not a locale!!', None, 'en'),
    (None, 'es-ES,es;q=0.9,en;q=0.8', 'es'),
    (None, 'fr-FR,fr;q=0.9', 'en'),
    ('en', 'es-ES', 'en'),
    (None, 'es;q=0, en', 'en'),                  # q=0 means "not acceptable"
    (None, 'en;q=0.4, es;q=0.9', 'es'),           # the browser's own ranking, not list order
    (None, 'fr, es;q=0.1', 'es'),
])
def test_resolve_lang(user_locale, accept, expected):
    assert resolve_lang(user_locale, accept) == expected


def test_guides_for_serves_one_language_only():
    es = guides_for('es')
    assert es['goals']['heading'] == PAGE_GUIDES['goals']['copy']['es']['heading']
    assert 'en' not in es['goals'] and 'copy' not in es['goals']
    assert es['goals']['tour'][0]['title'] == PAGE_GUIDES['goals']['tour'][0]['es']['title']


def test_an_unknown_language_falls_back_to_english_per_entry():
    assert guides_for('xx')['accounts']['heading'] == PAGE_GUIDES['accounts']['copy']['en']['heading']


def test_pages_without_a_tour_have_no_tour_key():
    assert 'tour' not in guides_for('en')['accounts']


# --- module pages: a guide for a module that is off must not exist --------------------

MODULE_PAGES = {
    'pointspal': ['pointspal', 'pointspal-caps', 'pointspal-recommend', 'pointspal-cards', 'pointspal-redeem'],
    'learnpal': ['learnpal', 'learnpal-lessons', 'learnpal-range'],
}


def test_every_module_page_is_registered_and_tagged_with_its_module():
    for module, pages in MODULE_PAGES.items():
        for page in pages:
            assert page in PAGES, page
            assert PAGE_GUIDES[page]['module'] == module, page


def test_core_pages_carry_no_module_tag():
    tagged = {p for p in PAGES if PAGE_GUIDES[p].get('module')}
    assert tagged == {p for pages in MODULE_PAGES.values() for p in pages}


def test_a_disabled_module_has_no_guides():
    none = guides_for('en', enabled_modules=set())
    assert not [p for p in none if p.startswith(('pointspal', 'learnpal'))]
    assert 'accounts' in none                      # core pages are unaffected


def test_only_the_enabled_modules_guides_are_served():
    only_points = guides_for('en', enabled_modules={'pointspal'})
    assert {'pointspal', 'pointspal-caps'} <= set(only_points)
    assert not [p for p in only_points if p.startswith('learnpal')]


def test_no_filter_means_everything_for_callers_that_do_not_know():
    assert set(guides_for('en')) == set(PAGES)
