"""What each page is for — the copy behind the first-visit card and the tours.

Server-side, in both languages, for two reasons that are the same reason: core's
web UI has no i18n layer at all (this is core's copy of the premium registry; the two differ only where the
edition does: SimpleFIN here, Plaid there), and copy in a client can only be corrected by
shipping the client. The server answers in ONE language (`resolve_lang`) and never
sends both. `tests/unit/test_page_guides_registry.py` is the parity gate that
`i18n check` is for the client files.

*** THE WORDS ARE DRAFTS FOR THE OWNER TO EDIT. *** Voice: name the conditions, then
name what is still the reader's. No promises the page cannot keep, and no number
the server does not compute. Spanish is `draft` until a fluent reviewer flips it.

`pose` is a `NovaPose` from `web-ui/src/components/onboarding/NovaArt.tsx`.
`tour[].target` is a `data-guide="…"` attribute on an element of that page; a
target that is not on the page is skipped by the client, and
`tests/unit/test_guide_targets_exist.py` fails if one is not in the source at all.
"""
import re

PAGES = ('accounts', 'budgets', 'goals', 'dashboard', 'transactions', 'investments', 'recurring',
         'categories', 'rules', 'review', 'kit', 'analytics', 'groups', 'settings',
         # Module pages: served only when their module is enabled on this deployment.
         'pointspal', 'pointspal-caps', 'pointspal-recommend', 'pointspal-cards', 'pointspal-redeem',
         'learnpal', 'learnpal-lessons', 'learnpal-range')

POSES = frozenset({'portrait', 'summit', 'wave', 'pack', 'map', 'lookout', 'camp'})

SUPPORTED = ('en', 'es')

PAGE_GUIDES = {
    'accounts': {
        'pose': 'map',
        'copy': {
            'en': {
                'heading': 'Accounts: where your money actually sits',
                'lines': [
                    'Every account you have, whether a bank, a card, a loan or cash, in one list, '
                    'with what it holds or owes right now.',
                    'Connect a bank through SimpleFIN (Settings, then Integrations) to keep balances current, '
                    'or add an account by hand for anything a bank link cannot see.',
                    'Net worth at the top is simply what you have minus what you owe. It moves '
                    'when a balance does, or when you add or remove an account.',
                ],
            },
            'es': {
                'heading': 'Cuentas: dónde está realmente tu dinero',
                'lines': [
                    'Todas tus cuentas, ya sea una cuenta bancaria, una tarjeta, un préstamo o efectivo, '
                    'en una sola lista, con lo que tienen o deben ahora mismo.',
                    'Conecta un banco mediante SimpleFIN (Ajustes, luego Integraciones) para mantener los '
                    'saldos al día, o agrega una cuenta a mano para lo que una conexión bancaria no puede ver.',
                    'El patrimonio neto de arriba es simplemente lo que tienes menos lo que '
                    'debes. Cambia cuando cambia un saldo, o cuando agregas o quitas una cuenta.',
                ],
            },
        },
    },
    'budgets': {
        'pose': 'pack',
        'copy': {
            'en': {
                'heading': 'Budgets: a plan for the month, then the truth',
                'lines': [
                    'Give a category a limit for the month and watch how much of it is spent so far.',
                    'Limits are grouped as fixed, flexible and non-monthly. Put a big yearly bill '
                    'under non-monthly and it does not look like overspending in the month it lands.',
                    'Nothing here changes your money. It only measures it against what you '
                    'said you would do.',
                ],
            },
            'es': {
                'heading': 'Presupuestos: un plan para el mes, y luego la verdad',
                'lines': [
                    'Ponle un límite a una categoría para el mes y mira cuánto llevas gastado.',
                    'Los límites se agrupan en fijos, flexibles y no mensuales. Pon una factura '
                    'anual grande en no mensuales y no parecerá un exceso en el mes en que llega.',
                    'Nada de aquí cambia tu dinero. Solo lo compara con lo que dijiste que harías.',
                ],
            },
        },
        'tour': [
            {'target': 'budget-month',
             'en': {'title': 'Pick the month',
                    'body': 'Move between months here. Each month keeps its own limits and its own spending.'},
             'es': {'title': 'Elige el mes',
                    'body': 'Cambia de mes aquí. Cada mes tiene sus propios límites y su propio gasto.'}},
            {'target': 'budget-totals',
             'en': {'title': 'Planned against spent',
                    'body': 'The totals compare what you planned with what has actually gone out so far.'},
             'es': {'title': 'Lo planeado frente a lo gastado',
                    'body': 'Los totales comparan lo que planeaste con lo que realmente ha salido hasta ahora.'}},
        ],
    },
    'goals': {
        'pose': 'summit',
        'copy': {
            'en': {
                'heading': 'Goals: every goal is a mountain',
                'lines': [
                    'A goal is something you are saving toward, or a debt you are paying off. '
                    'Each one becomes a peak on your range, which you can see on the Dashboard.',
                    'The size comes from the amount, and the climb is how far along you are.',
                    'Link an account and finPal tracks the progress for you.',
                ],
            },
            'es': {
                'heading': 'Metas: cada meta es una montaña',
                'lines': [
                    'Una meta es algo para lo que ahorras, o una deuda que estás pagando. '
                    'Cada una se convierte en una cumbre de tu cordillera, que puedes ver en el Panel.',
                    'El tamaño depende del monto, y el ascenso es cuánto has avanzado.',
                    'Vincula una cuenta y finPal registra el progreso por ti.',
                ],
            },
        },
        'tour': [
            {'target': 'goal-new',
             'en': {'title': 'Start a goal',
                    'body': 'Name it, give it an amount, and choose whether you are saving up or paying down.'},
             'es': {'title': 'Empieza una meta',
                    'body': 'Ponle un nombre y un monto, y elige si estás ahorrando o pagando una deuda.'}},
            {'target': 'goal-list',
             'en': {'title': 'Your goals',
                    'body': 'Each goal shows how far along it is and what is left to go.'},
             'es': {'title': 'Tus metas',
                    'body': 'Cada meta muestra cuánto has avanzado y cuánto falta.'}},
        ],
    },

    'dashboard': {
        'pose': 'lookout',
        'copy': {
            'en': {
                'heading': 'Dashboard: where you stand today',
                'lines': [
                    'Your goals drawn as a range, so you can see how far up each one you are.',
                    'Below it, your totals and how this month\'s spending is going.',
                    'It only reads your accounts and transactions. Nothing on this page changes your money.',
                ],
            },
            'es': {
                'heading': 'Panel: dónde estás hoy',
                'lines': [
                    'Tus metas dibujadas como una cordillera, para ver cuánto has subido en cada una.',
                    'Debajo, tus totales y cómo va el gasto de este mes.',
                    'Solo lee tus cuentas y transacciones. Nada de esta página cambia tu dinero.',
                ],
            },
        },
        'tour': [
            {'target': 'dashboard-range',
             'en': {'title': 'Your range',
                    'body': 'Each goal is a peak. The higher the marker, the further along you are.'},
             'es': {'title': 'Tu cordillera',
                    'body': 'Cada meta es una cumbre. Cuanto más alto el marcador, más has avanzado.'}},
            {'target': 'dashboard-totals',
             'en': {'title': 'Your totals',
                    'body': 'What you have, what you owe and what is left, from your accounts as they stand now.'},
             'es': {'title': 'Tus totales',
                    'body': 'Lo que tienes, lo que debes y lo que queda, según tus cuentas tal como están ahora.'}},
            {'target': 'dashboard-spend',
             'en': {'title': 'Where the month went',
                    'body': 'This month\'s spending by category, so a surprise has a name.'},
             'es': {'title': 'A dónde fue el mes',
                    'body': 'El gasto de este mes por categoría, para que una sorpresa tenga nombre.'}},
        ],
    },
    'transactions': {
        'pose': 'pack',
        'copy': {
            'en': {
                'heading': 'Transactions: everything that came in or went out',
                'lines': [
                    'Every transaction from your accounts, in one list. Search and filter to find one.',
                    'Change a transaction\'s category, split it between people, or add one yourself when it did not come from a bank.',
                ],
            },
            'es': {
                'heading': 'Transacciones: todo lo que entró o salió',
                'lines': [
                    'Todas las transacciones de tus cuentas, en una sola lista. Busca y filtra para encontrar una.',
                    'Cambia la categoría de una transacción, divídela entre personas o agrega una tú mismo cuando no vino de un banco.',
                ],
            },
        },
    },
    'investments': {
        'pose': 'lookout',
        'copy': {
            'en': {
                'heading': 'Investments: what you put in, and what it is worth',
                'lines': [
                    'Add a holding and finPal looks its price up by ticker. Only the symbol is sent, never what you hold or how much.',
                    'The gap between what you put in and what it is worth now is shown as a gain or a loss.',
                ],
            },
            'es': {
                'heading': 'Inversiones: lo que pusiste y lo que vale',
                'lines': [
                    'Agrega una posición y finPal busca su precio por símbolo. Solo se envía el símbolo, nunca lo que tienes ni cuánto.',
                    'La diferencia entre lo que pusiste y lo que vale ahora se muestra como ganancia o pérdida.',
                ],
            },
        },
    },
    'recurring': {
        'pose': 'camp',
        'copy': {
            'en': {
                'heading': 'Recurring: the bills and subscriptions that come back',
                'lines': [
                    'Rent, subscriptions and anything else that repeats. finPal can spot repeats in your transactions, and you can add one yourself.',
                    'Knowing what repeats shows you what is already spoken for before the month starts.',
                ],
            },
            'es': {
                'heading': 'Recurrentes: las cuentas y suscripciones que vuelven',
                'lines': [
                    'El alquiler, las suscripciones y todo lo que se repite. finPal puede detectar repeticiones en tus transacciones, y tú puedes agregar una.',
                    'Saber qué se repite te muestra qué ya está comprometido antes de que empiece el mes.',
                ],
            },
        },
    },
    'categories': {
        'pose': 'pack',
        'copy': {
            'en': {
                'heading': 'Categories: how your spending is sorted',
                'lines': [
                    'Each transaction belongs to a category, and budgets are set against categories.',
                    'Mark a category as fixed, flexible or non-monthly and Budgets groups it that way. You can rename them or add your own.',
                ],
            },
            'es': {
                'heading': 'Categorías: cómo se ordena tu gasto',
                'lines': [
                    'Cada transacción pertenece a una categoría, y los presupuestos se fijan por categoría.',
                    'Marca una categoría como fija, flexible o no mensual y Presupuestos la agrupa así. Puedes renombrarlas o agregar las tuyas.',
                ],
            },
        },
    },
    'rules': {
        'pose': 'wave',
        'copy': {
            'en': {
                'heading': 'Rules: teach finPal how you sort things',
                'lines': [
                    'A rule says that when a transaction looks like this, it goes in that category.',
                    'Set one up once and finPal sorts matching transactions for you, so you are not doing the same correction every month.',
                ],
            },
            'es': {
                'heading': 'Reglas: enséñale a finPal cómo ordenas',
                'lines': [
                    'Una regla dice que cuando una transacción se ve así, va en esa categoría.',
                    'Crea una vez y finPal ordena las transacciones que coinciden, para que no repitas la misma corrección cada mes.',
                ],
            },
        },
    },
    'review': {
        'pose': 'map',
        'copy': {
            'en': {
                'heading': 'Review: everything finPal had to guess',
                'lines': [
                    'When finPal sorts a transaction or pairs two transfers on its own, it shows up here for you to confirm or correct.',
                    'Either way it stops being a guess. A confirmed one is yours from then on.',
                ],
            },
            'es': {
                'heading': 'Revisión: todo lo que finPal tuvo que adivinar',
                'lines': [
                    'Cuando finPal ordena una transacción o empareja dos transferencias por su cuenta, aparece aquí para que la confirmes o la corrijas.',
                    'De cualquier forma deja de ser una suposición. Una confirmada es tuya desde entonces.',
                ],
            },
        },
    },
    'kit': {
        'pose': 'pack',
        'copy': {
            'en': {
                'heading': 'Kit: what your coins buy',
                'lines': [
                    'Coins come from telling finPal the truth about your own money. Not from opening the app, and not from spending less.',
                    'Kit is what you can spend them on: gear for the climb. It changes nothing about your money.',
                ],
            },
            'es': {
                'heading': 'Equipo: lo que compran tus monedas',
                'lines': [
                    'Las monedas vienen de decirle a finPal la verdad sobre tu propio dinero. No de abrir la app, ni de gastar menos.',
                    'El equipo es en lo que puedes gastarlas: material para la escalada. No cambia nada de tu dinero.',
                ],
            },
        },
    },
    'analytics': {
        'pose': 'lookout',
        'copy': {
            'en': {
                'heading': 'Analytics: where the money went, and where it is heading',
                'lines': [
                    'Spending by category, income against spending, net worth over time, and how money moves between them.',
                    'Pick the period at the top, or compare two periods side by side. Every chart is built from the same transactions.',
                ],
            },
            'es': {
                'heading': 'Analítica: a dónde fue el dinero y hacia dónde va',
                'lines': [
                    'El gasto por categoría, los ingresos frente al gasto, el patrimonio neto en el tiempo y cómo se mueve el dinero entre ellos.',
                    'Elige el periodo arriba, o compara dos periodos lado a lado. Todos los gráficos salen de las mismas transacciones.',
                ],
            },
        },
    },
    'groups': {
        'pose': 'wave',
        'copy': {
            'en': {
                'heading': 'Groups: shared costs, and who owes what',
                'lines': [
                    'Make a group for a trip, a flat or a night out, add what was spent, and finPal works out who owes whom.',
                    'When someone pays someone back, settle it and the balance updates.',
                ],
            },
            'es': {
                'heading': 'Grupos: gastos compartidos y quién debe qué',
                'lines': [
                    'Crea un grupo para un viaje, un piso o una salida, agrega lo que se gastó y finPal calcula quién le debe a quién.',
                    'Cuando alguien le devuelve el dinero a otro, regístralo y el saldo se actualiza.',
                ],
            },
        },
    },
    'settings': {
        'pose': 'camp',
        'copy': {
            'en': {
                'heading': 'Settings: how finPal works for you',
                'lines': [
                    'Your profile, language and number format, notifications, connected banks, and the access tokens other tools use to reach your data.',
                    'Bank connections through SimpleFIN are set up here.',
                ],
            },
            'es': {
                'heading': 'Ajustes: cómo funciona finPal para ti',
                'lines': [
                    'Tu perfil, idioma y formato de números, notificaciones, bancos conectados y los tokens de acceso que otras herramientas usan para llegar a tus datos.',
                    'Las conexiones bancarias mediante SimpleFIN se configuran aquí.',
                ],
            },
        },
    },
    'pointspal': {
        'module': 'pointspal',
        'pose': 'pack',
        'copy': {
            'en': {
                'heading': 'pointsPal: which card to pay with',
                'lines': [
                    'Your rewards at a glance: cap alerts, missed points and the best opportunities right now.',
                    'Add your cards first. Everything else in pointsPal is worked out from them.',
                ],
            },
            'es': {
                'heading': 'pointsPal: con qué tarjeta pagar',
                'lines': [
                    'Tus recompensas de un vistazo: alertas de límite, puntos perdidos y las mejores oportunidades ahora mismo.',
                    'Agrega primero tus tarjetas. Todo lo demás en pointsPal se calcula a partir de ellas.',
                ],
            },
        },
    },
    'pointspal-caps': {
        'module': 'pointspal',
        'pose': 'map',
        'copy': {
            'en': {
                'heading': 'Cap tracker: know when to switch cards',
                'lines': [
                    'Many cards pay a high rate only up to a spending cap each period. This tracks your spending against each cap as it happens.',
                    'When a card is close to its cap, it shows here.',
                ],
            },
            'es': {
                'heading': 'Seguimiento de límites: sabe cuándo cambiar de tarjeta',
                'lines': [
                    'Muchas tarjetas pagan una tasa alta solo hasta un límite de gasto por periodo. Aquí se sigue tu gasto frente a cada límite a medida que ocurre.',
                    'Cuando una tarjeta se acerca a su límite, aparece aquí.',
                ],
            },
        },
    },
    'pointspal-recommend': {
        'module': 'pointspal',
        'pose': 'wave',
        'copy': {
            'en': {
                'heading': 'Best card: what to pay with right now',
                'lines': [
                    'Pick a spending category and finPal ranks your cards by what each would earn today.',
                    'It counts how far along each card is against its cap, so a 5% category does not quietly stop paying halfway through the quarter.',
                ],
            },
            'es': {
                'heading': 'Mejor tarjeta: con cuál pagar ahora mismo',
                'lines': [
                    'Elige una categoría de gasto y finPal ordena tus tarjetas por lo que cada una ganaría hoy.',
                    'Cuenta cuánto llevas de cada tarjeta frente a su límite, para que una categoría del 5% no deje de pagar en silencio a mitad del trimestre.',
                ],
            },
        },
    },
    'pointspal-cards': {
        'module': 'pointspal',
        'pose': 'pack',
        'copy': {
            'en': {
                'heading': 'My cards: what each one earns',
                'lines': [
                    'Your cards with their balances, earn rates, cap rules and whether the details have been verified.',
                    'Keep these right and every recommendation on the other pages is right.',
                ],
            },
            'es': {
                'heading': 'Mis tarjetas: lo que gana cada una',
                'lines': [
                    'Tus tarjetas con sus saldos, tasas de ganancia, reglas de límite y si los detalles han sido verificados.',
                    'Mantenlas correctas y todas las recomendaciones de las otras páginas lo serán.',
                ],
            },
        },
    },
    'pointspal-redeem': {
        'module': 'pointspal',
        'pose': 'camp',
        'copy': {
            'en': {
                'heading': 'Redeem: what your points are worth',
                'lines': [
                    'Redemption options ranked by cents per point, so you can see which use of your points is worth the most.',
                    'This only compares your options. Nothing here spends your points.',
                ],
            },
            'es': {
                'heading': 'Canjear: cuánto valen tus puntos',
                'lines': [
                    'Opciones de canje ordenadas por centavos por punto, para ver cuál uso de tus puntos vale más.',
                    'Esto solo compara tus opciones. Nada de aquí gasta tus puntos.',
                ],
            },
        },
    },
    'learnpal': {
        'module': 'learnpal',
        'pose': 'wave',
        'copy': {
            'en': {
                'heading': 'learnPal: lessons from your own figures',
                'lines': [
                    'Short lessons that unlock from your own figures: what your debt actually costs, where your money goes, what a month of yours looks like.',
                    'Nothing generic, and nothing you have to study.',
                ],
            },
            'es': {
                'heading': 'learnPal: lecciones a partir de tus propias cifras',
                'lines': [
                    'Lecciones cortas que se desbloquean con tus propias cifras: lo que realmente cuesta tu deuda, a dónde va tu dinero, cómo es un mes tuyo.',
                    'Nada genérico, y nada que tengas que estudiar.',
                ],
            },
        },
    },
    'learnpal-lessons': {
        'module': 'learnpal',
        'pose': 'camp',
        'copy': {
            'en': {
                'heading': 'Lessons: read what has unlocked',
                'lines': [
                    'A lesson unlocks when your own figures make it relevant, not on a schedule.',
                    'Each one is short and uses your own numbers.',
                ],
            },
            'es': {
                'heading': 'Lecciones: lee lo que se ha desbloqueado',
                'lines': [
                    'Una lección se desbloquea cuando tus propias cifras la hacen relevante, no según un calendario.',
                    'Cada una es corta y usa tus propios números.',
                ],
            },
        },
    },
    'learnpal-range': {
        'module': 'learnpal',
        'pose': 'summit',
        'copy': {
            'en': {
                'heading': 'Your range: every goal as a mountain',
                'lines': [
                    'Your goals as a range of mountains, with Mount Everest in the middle for everyone.',
                    'Altitude comes from the coins you earn and the lessons you finish, and it only goes up.',
                ],
            },
            'es': {
                'heading': 'Tu cordillera: cada meta como una montaña',
                'lines': [
                    'Tus metas como una cordillera, con el Monte Everest en el centro para todos.',
                    'La altitud viene de las monedas que ganas y las lecciones que terminas, y solo sube.',
                ],
            },
        },
    },
}

_TAG = re.compile(r'^[A-Za-z]{2,3}')


def _primary(tag):
    """`es-MX` -> `es`; anything that is not a language tag -> None."""
    if not isinstance(tag, str):
        return None
    match = _TAG.match(tag.strip())
    return match.group(0).lower() if match else None


def _browser_languages(header):
    """Language tags from an `Accept-Language` header, best first, `q=0` dropped.

    The browser's own ranking decides, not list order: `en;q=0.4, es;q=0.9` prefers Spanish, and
    `es;q=0` says Spanish is NOT acceptable.
    """
    ranked = []
    for index, part in enumerate(header.split(',')):
        tag, _, params = part.partition(';')
        q = 1.0
        for param in params.split(';'):
            name, _, value = param.partition('=')
            if name.strip().lower() == 'q':
                try:
                    q = float(value)
                except ValueError:
                    q = 0.0
        lang = _primary(tag)
        if lang and q > 0:
            ranked.append((-q, index, lang))
    return [lang for _, _, lang in sorted(ranked)]


def resolve_lang(user_locale, accept_language):
    """The user's own setting wins; then the browser's order; then English.

    *** UNSUPPORTED IS ENGLISH, NEVER BLANK. *** A guide in the wrong language is a
    nuisance; an empty one on a page that promised an explanation is a bug.
    """
    own = _primary(user_locale)
    if own in SUPPORTED:
        return own
    if own is None and isinstance(accept_language, str):
        for lang in _browser_languages(accept_language):
            if lang in SUPPORTED:
                return lang
    return 'en'


def guides_for(lang, enabled_modules=None):
    """`{page: {heading, lines, pose, tour?}}` in ONE language.

    *** A MODULE PAGE EXISTS ONLY WHEN ITS MODULE DOES. *** `enabled_modules` is the set of module
    names switched on for this deployment; a page tagged with a module outside it is omitted, not
    blanked (a guide for a page the user cannot reach is noise, and a card on the "not enabled"
    stub says nothing true). `None` means the caller does not know and gets everything.
    """
    lang = lang if lang in SUPPORTED else 'en'
    out = {}
    for page in PAGES:
        entry = PAGE_GUIDES[page]
        if enabled_modules is not None and entry.get('module') and entry['module'] not in enabled_modules:
            continue
        copy = entry['copy'][lang]
        item = {'heading': copy['heading'], 'lines': list(copy['lines']), 'pose': entry['pose']}
        if entry.get('tour'):
            item['tour'] = [
                {'target': s['target'], 'title': s[lang]['title'], 'body': s[lang]['body']}
                for s in entry['tour']]
        out[page] = item
    return out
