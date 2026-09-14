<div align="center">
  <img width="200" height="200" alt="finPal" src="https://github.com/user-attachments/assets/c6a95689-a223-4f68-8d4e-549fadbcbf53" />
  <h1>finPal</h1>
  <h3>Make the numbers true, then make them better</h3>

  <p>
    <a href="https://findemo.palstack.io"><strong>Try the demo →</strong></a> |
    <a href="docs/install.md">Install</a> |
    <a href="https://palstack.io/finpal/docs">Documentation</a> |
    <a href="https://discord.gg/A4n3MtDgTj">Discord</a>
  </p>

  <p>
    <a href="LICENSE"><img alt="License" src="https://img.shields.io/badge/License-AGPL--3.0-blue"></a>
    <a href="https://github.com/orgs/palStack-io/packages"><img alt="GHCR" src="https://img.shields.io/badge/GHCR-Containers-2496ED"></a>
  </p>
</div>

---

## It started with "did I already pay you for that?"

finPal began as **Dollar Dollar Bill Y'all**, built by two co-founders who happen to be
married, to settle a small recurring argument: by the end of the month, even organised
people lose track of who owes whom. Spreadsheets get messy. The question comes back.

So we built something that just did the maths. No bank connections, no subscriptions,
nothing harvested. Then friends started using it. Then people we had never met were running
it on their own servers, and the requests arrived — budgets, investments, bank sync, shared
expense clubs. Each one made sense. Eventually we had outgrown the name and the code
underneath it, so we rewrote the whole thing and called it finPal.

What never changed is the part we started with: **it is your money, on your server, and
nobody is selling anything about you.**

---

## Why it feels different to use

Most money apps open by telling you what to do. This one opens by getting your own figures
straight, because almost every decision people regret was made on a number they had wrong.

And because knowing the number is the hard part, finPal makes *that* the game.

### Mountains

Anything you are working towards is drawn as a mountain. The height is the size of the
problem — what the debt is costing you every month, what is still left to save — **not how
hard you have tried.** A mountain never shrinks because you had a bad month, and it never
grows to make a point.

### Coins

You earn coins for telling finPal the truth about your money: naming an account, recording
an interest rate, sorting a month of transactions. The reward and the benefit are the same
act — the coin arrives *because* the picture got more accurate, and an accurate picture is
the thing that actually changes decisions.

### Gear

Coins buy kit for your climber. It looks good and **it gates nothing, ever.** No feature is
behind it, no number is inflated by it. It is there because finishing something small should
feel like finishing something.

### Badges

Given, not bought — for reading a short lesson. Lessons unlock from your own figures rather
than from a schedule: what your debt actually costs, where your money goes, what a month of
yours looks like.

### Four promises, and they are structural

These are not policies we intend to keep. They are properties of how the thing is built:

- **Nothing is ever taken away.** No streak to break, no score to decay.
- **No score you did not ask for.** The only progress bar is one whose target you chose.
- **Studying cannot flatter your finances.** Only your actual money moves a mountain.
- **You are never rewarded for your circumstances, only for what you did.**

That last one matters more than it sounds. It is easy to write a money game that quietly
pays people for having a mortgage, or for being able to save. This one does not.

---

## Your money stays on your server

finPal has no analytics, no tracking and no AI. Nothing you tell it about your money is sent
to us. There is no "us" in the path.

The only things that ever leave are ones you switch on yourself — a bank connection, a
share-price lookup, an email — and each one carries the least it can. The full inventory,
with the commands to re-derive it yourself, is in
**[docs/DATA_BOUNDARIES.md](docs/DATA_BOUNDARIES.md)**.

finPal is open source and runs on a server somebody chose. If that is not you, whoever runs
it holds the database, the backups and the mail server. That is worth knowing, and it is
true of any app you do not host yourself — the difference is that you can read every line of
this one.

---

## What you get

- **Expenses** that categorise themselves, with rules that learn your patterns
- **Budgets** grouped into Fixed / Flexible / Non-Monthly, so the page can tell *the ground
  is expensive* from *you overspent* — with a pace mark showing where you should be by now
- **Sinking funds** — give a Non-Monthly budget a yearly period and finPal shows what to set
  aside each month, instead of calling a £600 car tax an overspend every March
- **Goals** for savings and debt payoff, tracked against real balances; one goal can watch
  several accounts
- **Shared costs** with your household, and who owes whom
- **Investments** across portfolios, with automatic price updates
- **Bank sync** via [SimpleFin](docs/simplefin.md), or drop statements in a
  [watched folder](docs/csv-import.md) and let them import themselves
- **Optional modules** you can switch off at any time: pointsPal (which card to pay with)
  and learnPal (the lessons above)
- Multi-currency, multi-account, dark mode, and a mobile app in testing

> [!WARNING]
> **finPal is under active development.** Features, APIs and the database schema still
> change. Back up your data before upgrading.

Try it with no install at all on the **[live demo](https://findemo.palstack.io)** — four
pre-seeded people, no account needed.

---

## Running it yourself

Three commands. Nothing to build — the compose file pulls prebuilt images.

```bash
git clone https://github.com/palStack-io/finpal-core.git && cd finpal-core
./scripts/setup-env.sh        # writes .env with generated secrets
docker compose up -d
```

Open **http://localhost**. The first account to sign up becomes the admin.

Port 80 is the default — set `HTTP_PORT` in `.env` to serve elsewhere.

> `setup-env.sh` generates real secrets for you. finPal **refuses to start** on the
> `change_me_*` placeholders in `.env.example`, because those are published in this
> repository and anyone could forge sessions signed with them.

### Upgrading

Pull the new images and restart. The schema catches itself up.

```bash
docker compose pull && docker compose up -d
```

finPal reconciles its own schema on boot and logs what it did. The release notes will say so
explicitly if that ever stops being true. The details, the other compose files, and backup
and restore are all in **[docs/install.md](docs/install.md)**.

---

## Documentation

| Guide | What's in it |
|---|---|
| **[Install](docs/install.md)** | Setup, which compose file to use, upgrades, backup and restore |
| **[Environment variables](docs/ENV_REFERENCE.md)** | Every setting, what it defaults to, what it affects |
| **[Data boundaries](docs/DATA_BOUNDARIES.md)** | Everything that can leave your instance, and how to check |
| **[Architecture](docs/architecture.md)** | What runs where, and the system requirements |
| **[API tokens](docs/api-tokens.md)** | Personal access tokens for scripts and local LLMs |
| **[CSV folder import](docs/csv-import.md)** | Drop statements in a folder and have them imported |
| **[SimpleFin](docs/simplefin.md)** | Connecting bank accounts |
| **[pointsPal](docs/pointspal.md)** | The optional card-rewards module |
| **[Testing](docs/testing.md)** | Running the suites |
| **[Contributing](CONTRIBUTING.md)** | How to propose a change |
| **[About & roadmap](docs/about.md)** | Where this came from and where it is going |
| **[Licensing in full](docs/licensing.md)** | AGPL-3.0, and what the Premium split means |

---

## Hosting

Self-hosting is the whole point, and it is free. If you would rather not run a server,
palStack offers a hosted edition with optional paid modules — that revenue funds this work
and takes nothing away from it. **Everything in this repository stays open source and
complete.**

## Contributing

Bug reports, features, docs and translations are all welcome — see
**[CONTRIBUTING.md](CONTRIBUTING.md)**. If you are reporting a bug, the most useful thing you
can include is what you expected the number to be, and what it actually said.

## Licence

**AGPL-3.0.** Use it, change it, host it. If you run a modified version as a service, share
your changes. See [LICENSE](LICENSE) and [docs/licensing.md](docs/licensing.md).

## Contact

[Discord](https://discord.gg/A4n3MtDgTj) · [palstack.io](https://palstack.io) ·
[Issues](https://github.com/palStack-io/finpal-core/issues)

<div align="center">
  <sub>Built by palStack — privacy-first tools for people who would rather own their data.</sub>
</div>
