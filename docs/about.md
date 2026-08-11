# About finPal and palStack

The background, the roadmap and who builds this. Kept out of the README so the front page
answers "what is this and how do I run it" first.

## The Story Behind finPal

**finPal started as Dollar Dollar Bill Y'all** - built by two co-founders (who happen to be married) to solve a very specific problem: by month's end, even organized couples lose track of who owes whom. Spreadsheets get messy. "Did I already pay you for that?" becomes a recurring conversation.

So we built something simple: track who owes whom, settle up, move on. No bank connections, no subscriptions, no data harvesting. Just math and fairness.

Then it worked. Friends started using it. Then their friends. People we'd never met were running it on their own servers.

The feature requests followed - budgets, investment tracking, bank sync, expense clubs. Each one made sense, so we kept building. Eventually we'd outgrown both the name and the architecture.

**Dollar Dollar Bill Y'all became finPal.** Complete rewrite, modern stack, all the features people asked for - while keeping what always mattered: privacy-first, self-hosted, no tracking.

finPal is also the foundation for what's next: **debtFree** - a gamified debt payoff platform with financial literacy built in. finPal is where we learn what people need. debtFree is where we focus that on helping people get out of debt.

### Roadmap

```
Dollar Dollar Bill Y'all (2023) - bill splitting
    ↓
finPal (2024-2025) - full financial management
    ↓
debtFree (future) - gamified debt payoff + financial literacy
```

We didn't come from fintech. We learned as we built - bank APIs, multi-currency, secure data handling - with AI tools helping us move faster and human review on everything. finPal is part of **palStack**, our collection of privacy-first tools.

> The original [Dollar Dollar Bill Y'all](#) repo is still available for anyone who just needs simple bill-splitting.

### The palStack Family

**Production Ready:**
- **[pantryPal](https://palstack.io/pantrypal)** - Never buy duplicate groceries again

**Final Testing Stage:**
- **[finPal](https://palstack.io/finpal)** - You're here! Complete financial management platform

**In Active Development:**
- **[propertyPal](https://palstack.io/propertypal)** - Track home maintenance, warranties, documents, plus **petPal** (pet care) and **carPal** (vehicle maintenance)
- **[clubPal](https://palstack.io/clubpal)** - Group coordination for dining, activities, and social clubs

**Future Vision:**
- **debtFree** - Gamified debt payoff with financial literacy built in (finPal's ultimate evolution)

**Learn more at [palstack.io](https://palstack.io)**

*Why "Pal"? Because that's what these tools are—friendly helpers for the everyday stuff we all struggle with.*

---

## Why Self-Hosted?

Because your financial data is nobody's business but yours. You shouldn't need:
- Permission from a cloud service to see your own transactions
- A subscription to track your own money
- To trust a third party with your complete financial profile
- Internet connectivity to check your budget

Self-hosting means:
- Complete privacy and control
- No recurring costs
- Works offline
- Integrate with anything
- Modify as needed
- Your data never leaves your server

---

## Roadmap

**Completed:**
- [x] Backend API with Flask + PostgreSQL
- [x] Web UI with React + TypeScript
- [x] Expense tracking with auto-categorization
- [x] Smart budgeting with alerts
- [x] Bill splitting and group management
- [x] Investment portfolio tracking
- [x] SimpleFin bank sync (US banks)
- [x] Multi-currency support
- [x] OIDC/SSO authentication

**In Progress:**
- [ ] Mobile apps (React Native + Expo)
- [ ] GoCardless integration (European banks)
- [ ] Progressive Web App (PWA) support

**finPal Near-Term:**
- [ ] Receipt scanning with OCR
- [ ] Credit card points tracking
- [ ] Multi-language support (i18n)
- [ ] Recurring transaction automation
- [ ] Advanced reporting and exports
- [ ] Managed hosting service

**The Ultimate Vision: debtFree**

finPal is our stepping stone to **debtFree**—a gamified debt payoff platform with financial literacy at its core:

- 🎮 **Gamification**: Progress bars, achievements, milestones that motivate
- 📚 **Financial Literacy**: Educational content built into the experience
- 🏆 **Community Challenges**: Make debt reduction social and supportive
- 📊 **Debt Payoff Strategies**: Snowball, avalanche, custom methods
- 💪 **Motivation System**: Celebrate wins, learn from setbacks
- 🎓 **Built-in Education**: Financial literacy without the boring textbooks

finPal teaches us what works for financial management. debtFree will laser-focus that knowledge on helping people escape debt and build financial freedom.

**palStack Vision:**
Cross-Pal integration: grocery spending from pantryPal, home expenses from propertyPal, all feeding into finPal's budgets and debtFree's payoff strategies.

---

## About palStack

**Privacy-first tools for everyday life.** That's what pals do—they show up and help with the everyday stuff.

We're not building engagement platforms or harvesting data. We solve real problems we've experienced, then share the solution.

**Core Values:**
- **Your Data**: Zero telemetry, no tracking, privacy by design
- **Open Source**: AGPL-3.0, free forever, improvements benefit everyone
- **Human-Centered**: Plain English, accessible design, forgiving UX
- **AI-Assisted**: LLM-agnostic (Claude, ChatGPT, Qwen), all code human-reviewed
- **Dog-Fooded**: We use what we build daily

**Two Paths:**
1. **Self-Host** - Free forever, full features, community support
2. **Managed Hosting** - Coming soon! We handle infrastructure, you enjoy the app

We're building sustainable tools that help people, not chasing unicorns. If we can pay our bills doing it—and sleep well at night—that's success.

---

## The palStack Ecosystem

**Production Ready:**
- **[pantryPal](https://pantrypal.palstack.io)** - Food waste reduction | [Docs](https://pantrypal.palstack.io/docs) | [GitHub](https://github.com/palStack-io/pantrypal-core)

**Final Testing:**
- **[finPal](https://palstack.io/finpal)** - Personal finance tracking | [Docs](https://palstack.io/finpal/docs) | [GitHub](https://github.com/palStack-io/finpal-core)

**In Development:**
- **[propertyPal](https://propertypal.palstack.io)** - Home, pet, and vehicle tracking | [GitHub](https://github.com/palStack-io/propertypal-core)
- **[clubPal](https://clubpal.palstack.io)** - Group coordination | [GitHub](https://github.com/palStack-io/clubpal-core)

*Privacy-first • Family-focused • Home Assistant ready • AGPL-3.0*

**Explore:** [palstack.io](https://palstack.io)

---

## The Team

- **Harun Gunasekaran** - Founder & Lead Developer
- **Chris Macioci** - Co-Founder & Lead DevOps
- **Rachel Surette** - Co-Founder, Marketing & Branding
- **Elle Russel Chopra** - Co-Founder, Lead UI/UX Designer
- **Chaitanya Gunupudi** - Senior Advisor, Cybersecurity & DevOps
- **AI Assistants** - LLM-agnostic: Claude, ChatGPT, Qwen (all code human-reviewed)

---

