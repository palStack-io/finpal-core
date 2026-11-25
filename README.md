<div align="center">
  <img width="200" height="200" alt="finPal" src="https://github.com/user-attachments/assets/c6a95689-a223-4f68-8d4e-549fadbcbf53" />
  <h1>finPal</h1>
  <h3>Learn money by managing yours</h3>

  <p>
    <a href="https://findemo.palstack.io"><strong>Try the demo →</strong></a> |
    <a href="docs/install.md">Install</a> |
    <a href="https://palstack.io/finpal/docs">Documentation</a> |
    <a href="https://discord.gg/mcgcp7RdYs">Discord</a>
  </p>

  <p>
    <a href="LICENSE"><img alt="License" src="https://img.shields.io/badge/License-AGPL--3.0-blue"></a>
    <a href="https://github.com/orgs/palStack-io/packages"><img alt="GHCR" src="https://img.shields.io/badge/GHCR-Containers-2496ED"></a>
  </p>
</div>

---

finPal is a budgeting app you run on your own server. It tracks what comes in and goes out, keeps your budgets and
goals honest, splits shared costs, and teaches money from your own figures while you use it. No analytics, no
tracking, no AI, and nothing about your money is ever sent to us.

This repository is **finPal Core**: open source (AGPL-3.0), complete, and free to self-host.

> [!WARNING]
> **finPal is under active development.** Features, APIs and the database schema still change. Back up your data
> before upgrading.

## Quick start

Three commands. Nothing to build: the compose file pulls prebuilt images.

```bash
git clone https://github.com/palStack-io/finpal-core.git && cd finpal-core
./scripts/setup-env.sh        # writes .env with generated secrets
docker compose up -d
```

Open **http://localhost**. The first account to sign up becomes the admin. Set `HTTP_PORT` in `.env` to serve on
another port.

`setup-env.sh` generates real secrets. finPal **refuses to start** on the `change_me_*` placeholders in `.env.example`,
because those are published here and anyone could forge sessions signed with them.

**Upgrading:** `docker compose pull && docker compose up -d`. finPal reconciles its own schema on boot and logs what it
did. Other compose files, backup and restore: **[docs/install.md](docs/install.md)**.

No install at all? The **[live demo](https://findemo.palstack.io)** runs this edition with four ready-made people. No
account needed.

## Core and hosted: what is in this repository

| | finPal Core (this repo, self-hosted) | Hosted finPal (palstack.io) |
|---|---|---|
| Transactions, rules, budgets, goals, debt paydown, sinking funds | Yes | Yes |
| Shared costs and who owes whom, investments, multi-currency | Yes | Yes |
| Bank sync (SimpleFin) and CSV folder import | Yes | Yes |
| **learnPal**: This week, "Why?" cards, short lessons, six skills, recall | Yes | Yes |
| **pointsPal**: which card to pay with | Yes | Yes |
| Coins, gear, badges and the climb up Everest | Yes | Yes |
| Ask (plain questions answered from your budget, no AI), Your next dollar, the Analytics report | No | Yes |
| Module tracks and their mountains (Cards and points, and the paid modules) | No | Yes |
| Paid modules: retirementPal, investmentPal, taxPal, businessTaxPal | No | Coming with paid plans |
| The phone app | No (it connects to hosted finPal only) | In testing |

Everything in Core stays open source and complete. The hosted edition funds this work; it takes nothing away from
it. Licence details: **[docs/licensing.md](docs/licensing.md)**.

## What you get

- **Expenses** that categorise themselves, with rules that learn your patterns.
- **Budgets** grouped into Fixed, Flexible and Non-monthly, so the page can tell *the ground is expensive* from
  *you overspent*, with a pace mark showing where you should be by now.
- **Sinking funds:** give a Non-monthly budget a yearly period and finPal shows what to set aside each month, instead
  of calling a yearly bill an overspend.
- **Goals** for savings and debt, tracked against real balances; one goal can watch several accounts.
  - **Debt paydown:** highest rate first or smallest balance first, each priced in interest. It says *behind* plainly
    and never scolds.
  - **Emergency fund:** what three or six months of your own essentials would cost.
  - **Bills that are not monthly:** last year's total, divided by twelve.
- **Shared costs** with your household, and who owes whom.
- **Investments** across portfolios, with automatic price updates.
- **Bank sync** via [SimpleFin](docs/simplefin.md), or drop statements in a [watched folder](docs/csv-import.md).
- **Optional modules** you can switch off any time: learnPal (below) and [pointsPal](docs/pointspal.md).
- Multi-currency, multi-account, dark mode.

## Learn as you use it (learnPal)

Most of us were never taught how money works, and a course you have to finish rarely sticks. finPal teaches from the
thing you are already doing: your own budget.

- **This week:** the Dashboard opens on one thing to understand and one thing to do, picked from your figures, held
  Monday to Sunday.
- **"Why?" cards** next to the figures they explain, on Budgets, Goals and Accounts.
- **A one-minute lesson** with your own numbers, ending with one small thing to do.
- **Six skills, three marks each** (understood, used on your money, still remembered): read your month, know your
  fixed costs, plan for non-monthly costs, build a buffer, understand interest, pay down debt.
- **A question a few days later**, at most one a day, with "Not sure yet" and "Not now" always there.
- **Quiet on hard days**, and one switch in Settings turns it all off. What you learned is kept.

## The climb, and four promises

Anything you are working towards is drawn as a real mountain. **Coins** come from telling finPal
the truth about your money (naming an account, recording a rate), and buy **gear** for your climber that gates
nothing. **Badges** are given and never taken back. **Everest** (8,849 m) is the one mountain everybody climbs; your
height comes from what you have done and the lessons you have read, never from your balance, and it cannot fall.

These are properties of how it is built, not policies:

- **Nothing is ever taken away.** No streak to break, no score to decay.
- **No score you did not ask for.** The only progress bar is one whose target you chose.
- **Studying cannot flatter your finances.** Only your actual money moves a mountain.
- **You are never paid for your circumstances**, only for what you did: no coin and no metre of altitude can come from
  an outcome like having a mortgage or being able to save.

## Your money stays on your server

No analytics, no tracking, no AI. The only things that ever leave are ones you switch on yourself (a bank connection, a
share-price lookup, an email), each carrying the least it can. The full inventory, with commands to check it yourself:
**[docs/DATA_BOUNDARIES.md](docs/DATA_BOUNDARIES.md)**.

If someone else runs your instance, they hold the database, the backups and the mail server. That is true of any app
you do not host yourself; the difference is that you can read every line of this one.

## Documentation

| Guide | What's in it |
|---|---|
| **[Install](docs/install.md)** | Setup, which compose file to use, upgrades, backup and restore |
| **[Environment variables](docs/ENV_REFERENCE.md)** | Every setting, its default, what it affects |
| **[Data boundaries](docs/DATA_BOUNDARIES.md)** | Everything that can leave your instance, and how to check |
| **[Architecture](docs/architecture.md)** | What runs where, and the system requirements |
| **[API tokens](docs/api-tokens.md)** | Personal access tokens for scripts and local LLMs |
| **[CSV folder import](docs/csv-import.md)** | Drop statements in a folder and have them imported |
| **[SimpleFin](docs/simplefin.md)** | Connecting bank accounts |
| **[pointsPal](docs/pointspal.md)** | The optional card-rewards module |
| **[Testing](docs/testing.md)** | Running the suites |
| **[Contributing](CONTRIBUTING.md)** | How to propose a change |
| **[About](docs/about.md)** | Where finPal came from, and what is next |
| **[Licensing](docs/licensing.md)** | AGPL-3.0, and what is hosted only |

## Contributing

We have paused code contributions while we work out how to review AI-assisted changes well. Bug reports, ideas and
questions are very welcome: open an [issue](https://github.com/palStack-io/finpal-core/issues) or join us on
[Discord](https://discord.gg/mcgcp7RdYs). For a bug, the most useful thing you can include is what you expected the
number to be, and what it actually said.

Found a security problem? Please report it privately; see [SECURITY.md](https://github.com/palStack-io/.github/blob/main/SECURITY.md).

## Licence

**AGPL-3.0.** Use it, change it, self-host it. If you run a modified version as a network service, you must publish
your changes under the same licence. See [LICENSE](LICENSE) and [docs/licensing.md](docs/licensing.md).

finPal is built for personal and household use. To run it commercially, or as a service without the AGPL's
obligations, contact **support@palstack.io** about a commercial licence.

## Contact

[Discord](https://discord.gg/mcgcp7RdYs) · [palstack.io](https://palstack.io) ·
[Issues](https://github.com/palStack-io/finpal-core/issues)

<div align="center">
  <sub>Built by palStack. Everyday tools for food, money, home and friends.</sub>
</div>
