<div align="center">
  <img width="200" height="200" alt="finPal" src="https://github.com/user-attachments/assets/c6a95689-a223-4f68-8d4e-549fadbcbf53" />
  <h1>finPal</h1>
  <h3>Take control of your money</h3>

  <p>
    <a href="https://palstack.io/finpal"><strong>Try Demo →</strong></a> |
    <a href="docs/install.md">Install</a> |
    <a href="https://palstack.io/finpal/docs">Documentation</a> |
    <a href="https://discord.gg/A4n3MtDgTj">Discord</a>
  </p>
</div>

---

> [!WARNING]
> **🚧 finPal is under major active development.**
>
> Features, APIs, and the database schema are changing frequently. Things may break between
> updates. **Use at your own risk** — back up your data before upgrading.

---

**Open source, privacy-first financial management from [palStack](https://palstack.io).**
Self-host it, own your data, pay nothing.

[![Status](https://img.shields.io/badge/Status-Web%20Ready-success)](https://github.com/palStack-io/finpal-core)
[![Platform](https://img.shields.io/badge/Platform-Web%20%7C%20Mobile%20Soon-blue)](https://github.com/palStack-io/finpal-core)
[![License](https://img.shields.io/badge/License-AGPL--3.0-blue)](LICENSE)
[![GHCR](https://img.shields.io/badge/GHCR-Containers-2496ED)](https://github.com/orgs/palStack-io/packages)

---

## Quick start

Three commands. Nothing to build — the compose file pulls prebuilt images.

```bash
git clone https://github.com/palStack-io/finpal-core.git && cd finpal-core
./scripts/setup-env.sh        # writes .env with generated secrets
docker compose up -d
```

Open **http://localhost**. The first account to sign up becomes the admin.

Port 80 is the default — set `HTTP_PORT` in `.env` to serve elsewhere. Full options, other
compose files and upgrade notes are in **[docs/install.md](docs/install.md)**.

> `setup-env.sh` generates real secrets for you. finPal **refuses to start** on the
> `change_me_*` placeholders in `.env.example`, because they are published in this repository
> and anyone could forge sessions signed with them.

---

## What it does

**The problem:** "where did all my money go this month?"

- Track expenses with auto-categorization and transaction rules that learn your patterns
- Budgets with real-time tracking and alerts before you overspend
- Split shared costs with your household and see who owes whom
- Investments across portfolios, with automatic price updates
- Bank sync via [SimpleFin](docs/simplefin.md), or drop CSVs in a
  [watched folder](docs/csv-import.md) and let them import themselves
- Multi-currency, multi-account, dark mode
- No tracking, no data selling, no subscriptions

<div align="center">
  <img width="1881" alt="Dashboard — budget overview and spending trends" src="https://github.com/user-attachments/assets/f46cf834-d34d-40d1-bf78-5d6e9f7ff2d7" />
  <p><em>Dashboard</em></p>
  <img width="1881" alt="Accounts" src="https://github.com/user-attachments/assets/f2bb17d6-5e12-4ff0-9e55-b89673b1f756" />
  <p><em>Accounts</em></p>
  <img width="1881" alt="Budgets" src="https://github.com/user-attachments/assets/9f83245a-fc02-41cb-a21b-42b8af0cfcc7" />
  <p><em>Budgets</em></p>
  <img width="1881" alt="Analytics" src="https://github.com/user-attachments/assets/d584f50e-d5c5-48ef-a397-cf71938ed752" />
  <p><em>Analytics</em></p>
</div>

Or try the [live demo](https://palstack.io/finpal) without installing anything.

---

## Documentation

| Guide | What's in it |
|---|---|
| **[Install](docs/install.md)** | Setup, which compose file to use, upgrades, backup and restore |
| **[Environment variables](docs/ENV_REFERENCE.md)** | Every setting, what it defaults to, and what it affects |
| **[Architecture](docs/architecture.md)** | What runs where, and the system requirements |
| **[API tokens](docs/api-tokens.md)** | Personal access tokens for scripts and local LLMs, and their scopes |
| **[CSV folder import](docs/csv-import.md)** | Drop statements in a folder and have them imported |
| **[SimpleFin](docs/simplefin.md)** | Connecting bank accounts |
| **[pointsPal](docs/pointspal.md)** | The optional credit-card rewards module |
| **[Testing](docs/testing.md)** | Running the suites |
| **[Contributing](CONTRIBUTING.md)** | How to propose a change |
| **[About & roadmap](docs/about.md)** | Why this exists, where it's going, who builds it |
| **[Licensing in full](docs/licensing.md)** | AGPL-3.0, and what the Premium split means |

---

## Hosting

**Self-host** — available now, full features, free forever. That's the quick start above.

**Managed hosting** — coming soon, for people who would rather not run servers. Updates,
backups and support handled for a subscription. Watch [palstack.io](https://palstack.io).

**Mobile** — a React Native app (iOS and Android) is in active development, with biometric
login and offline sync. The backend and web UI are ready today.

---

## Contributing

Contributions are welcome — bug reports, feature requests and pull requests alike.

- **Bugs and features:** [GitHub Issues](https://github.com/palStack-io/finpal-core/issues)
- **Code:** see [CONTRIBUTING.md](CONTRIBUTING.md) for setup and the review process

PRs need approval from two palStack developers, and review usually takes 24–48 hours. Please
keep tests passing and follow the patterns already in the file you're editing. By contributing
you agree your work is licensed under AGPL-3.0.

---

## Licence

**[AGPL-3.0](LICENSE).** Self-host it, modify it, share it — free forever. If you run a
modified version as a network service, the AGPL asks you to publish your changes.

Managed hosting (finPal Premium) is a separate proprietary offering; it does not change
anything about this repository. The [full explanation is here](docs/licensing.md).

---

## Acknowledgments

- **[Dollar Dollar Bill Y'all](https://github.com/harung1993/dollardollar)** — the debt tracker
  finPal grew out of, and proof that privacy-first finance apps work. The
  [story is in docs/about.md](docs/about.md).
- **SimpleFin** — privacy-respecting bank sync infrastructure
- **Our early testers** — for breaking things before anyone else had to
- **The open source community** — for showing that building in public makes better software

---

## Contact

- 🌐 [palstack.io](https://palstack.io) · 💬 [Discord](https://discord.gg/A4n3MtDgTj) · 📧 palstack4u@gmail.com
- 💻 [@palStack-io](https://github.com/palStack-io) · 📦 [Containers](https://github.com/orgs/palStack-io/packages)
- ❤️ [GitHub Sponsors](https://github.com/sponsors/harung1993) · [Buy Me a Coffee](https://buymeacoffee.com/cCFW6gZz28)

<div align="center">
  <br />
  <strong>Built by <a href="https://palstack.io">palStack</a></strong><br />
  <em>Privacy-first tools for everyday life</em>
</div>
