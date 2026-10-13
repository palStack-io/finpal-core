# finPal voice

**How finPal talks, for every string in core, premium and mobile.** Approved by Harun on 2026-10-12 (the ten
rules); the phrase bank below is a **draft for Harun to edit**. Phase 1 of `PRODUCT_ROADMAP.md` rewrites the app
against this file. New copy goes into the phrase bank first, then into the code.

## The stance

**Empathetic and real.** Financial literacy matters, and it is also hard. It is a habit you build in small steps,
not a test you pass. finPal says both: it never pretends money is easy, and it never makes anyone feel bad for
finding it hard.

The evidence is in `~/Documents/Palstacks/research/psychology-of-money-and-finpal.md` (and its fourth pass, on tone
and habit). Those figures come from summaries, so **copy never quotes a research number**. "Research suggests",
never "science proves".

**Ethics line:** we use a psychological lever only if the person would approve of it once it was explained.

## The ten rules

| # | Rule | Why | Say | Don't say |
|---|---|---|---|---|
| 1 | **Make looking feel safe.** What is still doable comes before the hard number. No red first. | People look less when they expect bad news; debt stigma drives avoidance | "October was a tight one. Here's what's still open this month." | "You overspent by $412." |
| 2 | **Name the difficulty honestly.** Money is hard and learning takes time; say so, then make the next step small. | Teaching helps a little and fades; skill grows with practice | "Most people were never taught this. One small step today counts." | "It's easy!" |
| 3 | **Credit the person.** Every win is something they did, in their words. | Skill and self-efficacy predict wellbeing; self-rated knowledge barely does | "You sorted 12 transactions. Now finPal knows where your money goes." | "finPal categorised your spending." |
| 4 | **Habits, not willpower.** Talk in routines and triggers. | "When-then" plans have the strongest evidence; habits take weeks to months to settle | "When will you move it: every payday, or on the 1st?" | "Commit to saving more!" |
| 5 | **Every month can start fresh.** A hard month closes; the next one is clean. | Fresh-start effect at landmarks | "New month, clean slate. Want to set this month's plan?" | "You were over budget last month." |
| 6 | **Less to think about when money is tight.** One clear next action. No arithmetic for the reader. Short sentences. | Scarcity uses up attention; the situation, not the person | "$84 left for groceries until the 31st." | "You've used 83.2% of $500.00 with 39% of the month remaining." |
| 7 | **"Not sure" is a real answer.** Never scored as wrong. | The confidence gap shows up as "don't know" | "Not sure yet" (as an option, no penalty) | "Wrong answer." |
| 8 | **Count up, never down; no comparison with others.** No streak to lose. A missed day breaks nothing. | Loss framing and comparison hurt the most stressed users; a missed day did not stop habits forming | "3 months on budget, kept." | "You broke your streak." / "People like you spend less." |
| 9 | **Honest figures stay honest.** Warmth never rounds, pads or hides a number. | Illusory progress destroys trust in every number | Progress from the real first dollar | A bar that starts at 10% "for motivation" |
| 10 | **Errors are ours, and kind.** Say what happened, then the next step. Talk about the action, never the person. No emojis, one exclamation mark at most. | Guilt points at an action, shame at the self; shame drives avoidance | "We couldn't save that goal. Try again, and if it keeps happening, your goal is safe to re-enter later." | "Failed to save goal." |

Plus the house rules: no emojis in copy, "group" never "club", absolute dates in anything that is kept.

## Phrase bank (draft)

Real strings from the app today, with the rewrite. Keys are from `finpal_premium/web-ui/src/i18n/locales/en/` unless
marked; mobile and core get the same lines.

### Errors (rule 10)

| Today | Rewrite |
|---|---|
| "Could not save this goal." | "We couldn't save this goal. Try again in a moment." |
| "Could not load your goals." | "We couldn't load your goals just now. Pull to refresh, or try again in a minute." |
| "Could not sync accounts" | "We couldn't reach your bank this time. We'll try again on the next sync, or you can try now." |
| "Could not load the list of bank providers." | "We couldn't load the list of banks. Try again in a moment, or add this account by hand." |
| "Failed to create account" | "We couldn't create that account. Check the name and balance, then try again." |
| "Failed to change password" | "We couldn't change your password. Check your current one and try again." |
| "Failed to add holding. Please try again." | "We couldn't add that holding. Try again, or check the ticker." |
| "Failed to complete onboarding. Please try again." | "We couldn't finish setting up. Your answers are saved, so try again from here." (only if they are saved; check first) |
| "Could not start." | "That didn't start. Try again in a moment." |
| "Could not fetch recommendation. Please try again." | "We couldn't work out the best card just now. Try again in a moment." |

### Empty states (rules 2, 3)

| Today | Rewrite |
|---|---|
| "No accounts yet" | "No accounts yet. Add one, by bank or by hand, and finPal starts from there." |
| "No budgets yet. Create your first budget to start tracking!" | "No budgets yet. Start with one category you'd like to keep an eye on." |
| "No goals yet" | "No goals yet. Name one thing you're saving for, and finPal will track it with you." |
| "No transactions yet" | "Nothing here yet. Transactions show up after your first sync or import." |
| "No transactions found" | "Nothing matches that search. Try fewer words or a wider date range." |

### Money moments (rules 1, 4, 5, 6, 8)

| Moment | Line |
|---|---|
| A budget goes over | "Food & Dining is $42 past its plan. You can move money from another category, or let this one carry into next month." |
| Coming back after a hard month | "Last month was a tight one. Here's what's still open this month." |
| Coming back after a long gap | "Welcome back. Your accounts are up to date; here's where things stand." |
| The 1st of the month | "New month, clean slate. Want to set this month's plan?" |
| Setting a goal | "When will you move money to it: every payday, or on the 1st?" |
| First budget made | "Your first budget. This is the part most people put off." |
| First month closed on budget | "A month on plan. That's a habit starting." |
| A month off plan | "This month didn't go to plan. That happens. The next one starts clean." |
| Debt with a rate | "This card costs $13.33 a month in interest. Every dollar paid down shrinks that." |
| A lesson unlocked | "This one is about the number you're looking at right now." |

### Nova (premium; rules 1, 3, 8)

| Moment | Line |
|---|---|
| Altitude gained | "241 m since your last visit." |
| A hard month | "Tough month. We'll go slowly." (concerned pose, never cheer) |
| A purchase in Kit | "Good choice. That's going on my pack." |

## Using this file

- Read it before writing any user-facing string. Add the line to the phrase bank first.
- Check a new line against all ten rules, and read it aloud.
- `PRODUCT_ROADMAP.md` Phase 1 tracks the rewrite; done means seen on the demos through the walkthrough.

## Phase 1b additions (draft, 2026-10-12)

Exact replacements shared by core, premium and mobile. Spanish translations remain draft pending fluent review. Confirmations retain their consequences.

| Today | Rewrite (draft) | Spanish (draft) |
|---|---|---|
| Account created successfully | Account added. | Cuenta añadida. |
| Account created successfully! | Account added. | Cuenta añadida. |
| Account deleted successfully | Account deleted. | Cuenta eliminada. |
| Account updated successfully | Account updated. | Cuenta actualizada. |
| Account updated successfully! | Account updated. | Cuenta actualizada. |
| Are you sure you want to cancel this invitation? | Cancel this invitation? | Existing Spanish consequence retained; shorter question. |
| Are you sure you want to delete "{{description}}"? | Delete "{{description}}"? | Existing Spanish consequence retained; shorter question. |
| Are you sure you want to delete "{{name}}"? | Delete "{{name}}"? | Existing Spanish consequence retained; shorter question. |
| Are you sure you want to delete this account? | Delete this account? | Existing Spanish consequence retained; shorter question. |
| Are you sure you want to delete this budget? | Delete this budget? | Existing Spanish consequence retained; shorter question. |
| Are you sure you want to delete this category? This action cannot be undone. | Delete this category? This action cannot be undone. | Existing Spanish consequence retained; shorter question. |
| Are you sure you want to delete this recurring transaction? | Delete this recurring transaction? | Existing Spanish consequence retained; shorter question. |
| Are you sure you want to delete this rule? | Delete this rule? | Existing Spanish consequence retained; shorter question. |
| Are you sure you want to delete this transaction? | Delete this transaction? | Existing Spanish consequence retained; shorter question. |
| Are you sure you want to delete {{name}}? | Delete {{name}}? | Existing Spanish consequence retained; shorter question. |
| Are you sure you want to delete {{name}}? This action cannot be undone. | Delete {{name}}? This action cannot be undone. | Existing Spanish consequence retained; shorter question. |
| Are you sure you want to disable {{biometricType}}? | Disable {{biometricType}}? | Existing Spanish consequence retained; shorter question. |
| Are you sure you want to disconnect SimpleFin? Your existing accounts and transactions will remain. | Disconnect SimpleFin? Your existing accounts and transactions will remain. | Existing Spanish consequence retained; shorter question. |
| Are you sure you want to logout? | Logout? | Existing Spanish consequence retained; shorter question. |
| Are you sure you want to remove {{name}} from the team? | Remove {{name}} from the team? | Existing Spanish consequence retained; shorter question. |
| Budget created successfully | Budget added. | Presupuesto añadido. |
| Budget deleted successfully | Budget deleted. | Presupuesto eliminado. |
| Budget updated successfully | Budget updated. | Presupuesto actualizado. |
| CSV imported successfully! | CSV imported. | CSV importado. |
| Could not add that co-owner. | We couldn't add that co-owner. Try again in a moment. | No pudimos añadir ese cotitular. Inténtalo de nuevo en un momento. |
| Could not add the holding | We couldn't add the holding. Try again in a moment. | No pudimos añadir esa posición. Inténtalo de nuevo en un momento. |
| Could not add the portfolio | We couldn't add the portfolio. Try again in a moment. | No pudimos añadir esa cartera. Inténtalo de nuevo en un momento. |
| Could not apply the rules | We couldn't apply the rules. Try again in a moment. | No pudimos aplicar las reglas. Inténtalo de nuevo en un momento. |
| Could not archive that goal. | We couldn't archive that goal. Try again in a moment. | No pudimos archivar esa meta. Inténtalo de nuevo en un momento. |
| Could not archive this goal. | We couldn't archive this goal. Try again in a moment. | No pudimos archivar esta meta. Inténtalo de nuevo en un momento. |
| Could not build the contribution link | We couldn't build the contribution link. Try again in a moment. | No pudimos crear el enlace de contribución. Inténtalo de nuevo en un momento. |
| Could not change that group | We couldn't change that group. Try again in a moment. | No pudimos cambiar ese grupo. Inténtalo de nuevo en un momento. |
| Could not change that rule | We couldn't change that rule. Try again in a moment. | No pudimos cambiar esa regla. Inténtalo de nuevo en un momento. |
| Could not change that type | We couldn't change that type. Try again in a moment. | No pudimos cambiar ese tipo. Inténtalo de nuevo en un momento. |
| Could not change the accounts on this goal. | We couldn't change the accounts on this goal. Try again in a moment. | No pudimos cambiar las cuentas de esta meta. Inténtalo de nuevo en un momento. |
| Could not confirm that account | We couldn't confirm that account. Try again in a moment. | No pudimos confirmar esa cuenta. Inténtalo de nuevo en un momento. |
| Could not confirm that category | We couldn't confirm that category. Try again in a moment. | No pudimos confirmar esa categoría. Inténtalo de nuevo en un momento. |
| Could not connect. Check the URL and try again. | We couldn't connect to that server. Check the URL and try again. | No pudimos conectar con ese servidor. Revisa la URL e inténtalo de nuevo. |
| Could not create that goal. | We couldn't create that goal. Try again in a moment. | No pudimos crear esa meta. Inténtalo de nuevo en un momento. |
| Could not create this goal. | We couldn't create this goal. Try again in a moment. | No pudimos crear esta meta. Inténtalo de nuevo en un momento. |
| Could not create this recurring transaction. | We couldn't create this recurring transaction. Try again in a moment. | No pudimos crear esta transacción recurrente. Inténtalo de nuevo en un momento. |
| Could not create your account. Please try again. | We couldn't create your account. Check your details and try again. | No pudimos crear tu cuenta. Revisa tus datos e inténtalo de nuevo. |
| Could not delete that goal. | We couldn't delete that goal. Try again in a moment. | No pudimos eliminar esa meta. Inténtalo de nuevo en un momento. |
| Could not delete that rule | We couldn't delete that rule. Try again in a moment. | No pudimos eliminar esa regla. Inténtalo de nuevo en un momento. |
| Could not delete this goal. | We couldn't delete this goal. Try again in a moment. | No pudimos eliminar esta meta. Inténtalo de nuevo en un momento. |
| Could not disconnect. | We couldn't disconnect that. Try again in a moment. | No pudimos desconectar eso. Inténtalo de nuevo en un momento. |
| Could not fetch recommendation. Please try again. | We couldn't work out the best card just now. Try again in a moment. | No pudimos determinar la mejor tarjeta ahora. Inténtalo de nuevo en un momento. |
| Could not import those accounts. | We couldn't import those accounts. Try again in a moment. | No pudimos importar esas cuentas. Inténtalo de nuevo en un momento. |
| Could not load analytics | We couldn't load analytics. Try again in a moment. | No pudimos cargar tus análisis. Inténtalo de nuevo en un momento. |
| Could not load analytics. Check your connection and try again. | We couldn't load analytics. Try again in a moment. | No pudimos cargar tus análisis. Inténtalo de nuevo en un momento. |
| Could not load learnPal. | We couldn't load learnPal. Try again in a moment. | No pudimos cargar learnPal. Inténtalo de nuevo en un momento. |
| Could not load rules. Pull down to try again. | We couldn't load your rules. Try again in a moment. | No pudimos cargar tus reglas. Inténtalo de nuevo en un momento. |
| Could not load the lessons. | We couldn't load the lessons. Try again in a moment. | No pudimos cargar las lecciones. Inténtalo de nuevo en un momento. |
| Could not load the list of bank providers. | We couldn't load the list of banks. Try again in a moment, or add this account by hand. | No pudimos cargar la lista de bancos. Inténtalo de nuevo en un momento o añade esta cuenta a mano. |
| Could not load this breakdown. | We couldn't load this breakdown. Try again in a moment. | No pudimos cargar este desglose. Inténtalo de nuevo en un momento. |
| Could not load who contributed. | We couldn't load who contributed. Try again in a moment. | No pudimos cargar quién ha contribuido. Inténtalo de nuevo en un momento. |
| Could not load your bank connections. | We couldn't load your bank connections. Try again in a moment. | No pudimos cargar tus conexiones bancarias. Inténtalo de nuevo en un momento. |
| Could not load your goals. | We couldn't load your goals just now. Try again in a minute. | No pudimos cargar tus metas ahora. Inténtalo de nuevo en un minuto. |
| Could not load your lessons. | We couldn't load your lessons. Try again in a moment. | No pudimos cargar tus lecciones. Inténtalo de nuevo en un momento. |
| Could not load your range. | We couldn't load your range. Try again in a moment. | No pudimos cargar tu cordillera. Inténtalo de nuevo en un momento. |
| Could not load your review list. Try again in a moment. | We couldn't load your review list. Try again in a moment. | No pudimos cargar tu lista de revisión. Inténtalo de nuevo en un momento. |
| Could not open that lesson. | We couldn't open that lesson. Try again in a moment. | No pudimos abrir esa lección. Inténtalo de nuevo en un momento. |
| Could not open the community contribution | We couldn't open the community contribution. Try again in a moment. | No pudimos abrir la contribución a la comunidad. Inténtalo de nuevo en un momento. |
| Could not open the community contribution. Please try again. | We couldn't open the community contribution. Try again in a moment. | No pudimos abrir la contribución a la comunidad. Inténtalo de nuevo en un momento. |
| Could not reach Google sign-in. Check your connection and try again. | We couldn't reach Google sign-in. Check your connection and try again. | No pudimos conectar con el inicio de sesión de Google. Revisa tu conexión e inténtalo de nuevo. |
| Could not reach the clipboard — this browser only allows it over HTTPS. Select the {{what}} and copy it by hand. | We couldn't copy to the clipboard. This browser needs HTTPS for that. Select the {{what}} and copy it by hand. | No pudimos copiar al portapapeles. Este navegador necesita HTTPS para hacerlo. Selecciona {{what}} y cópialo a mano. |
| Could not remove that co-owner. | We couldn't remove that co-owner. Try again in a moment. | No pudimos quitar ese cotitular. Inténtalo de nuevo en un momento. |
| Could not reset password | We couldn't reset your password. Request a new reset link and try again. | No pudimos restablecer tu contraseña. Solicita un enlace nuevo e inténtalo de nuevo. |
| Could not save | We couldn't save that. Try again in a moment. | No pudimos guardar eso. Inténtalo de nuevo en un momento. |
| Could not save that preference | We couldn't save that preference. Try again in a moment. | No pudimos guardar esa preferencia. Inténtalo de nuevo en un momento. |
| Could not save this goal. | We couldn't save this goal. Try again in a moment. | No pudimos guardar esta meta. Inténtalo de nuevo en un momento. |
| Could not send the reset email. Please try again. | We couldn't send the reset email. Try again in a moment. | No pudimos enviar el correo para restablecer la contraseña. Inténtalo de nuevo en un momento. |
| Could not sign in. Please try again. | We couldn't sign you in. Check your connection and try again. | No pudimos iniciar tu sesión. Revisa tu conexión e inténtalo de nuevo. |
| Could not start. | That didn't start. Try again in a moment. | No se inició. Inténtalo de nuevo en un momento. |
| Could not sync accounts | We couldn't reach your bank this time. Try syncing again in a moment. | No pudimos conectar con tu banco esta vez. Intenta sincronizar de nuevo en un momento. |
| Could not update currency | We couldn't update currency. Try again in a moment. | No pudimos actualizar la moneda. Inténtalo de nuevo en un momento. |
| Could not update number format | We couldn't update number format. Try again in a moment. | No pudimos actualizar el formato de números. Inténtalo de nuevo en un momento. |
| Could not update that goal. | We couldn't update that goal. Try again in a moment. | No pudimos actualizar esa meta. Inténtalo de nuevo en un momento. |
| Could not update timezone | We couldn't update your time zone. Try again in a moment. | No pudimos actualizar la zona horaria. Inténtalo de nuevo en un momento. |
| Could not work that out. Try again. | We couldn't work that out just now. Try again in a moment. | No pudimos calcularlo ahora. Inténtalo de nuevo en un momento. |
| FMP API key saved successfully | FMP API key saved. | Clave API de FMP guardada. |
| Failed to add holding. Please try again. | We couldn't add that holding. Try again, or check the ticker. | No pudimos añadir esa posición. Inténtalo de nuevo o revisa el símbolo bursátil. |
| Failed to add member | We couldn't add that member. Try again in a moment. | No pudimos añadir ese miembro. Inténtalo de nuevo en un momento. |
| Failed to add the folder | We couldn't add the folder. Try again in a moment. | No pudimos añadir la carpeta. Inténtalo de nuevo en un momento. |
| Failed to add transaction | We couldn't add that transaction. Try again in a moment. | No pudimos añadir esa transacción. Inténtalo de nuevo en un momento. |
| Failed to apply rules | We couldn't apply your rules. Try again in a moment. | No pudimos aplicar tus reglas. Inténtalo de nuevo en un momento. |
| Failed to apply the change | We couldn't apply the change. Try again in a moment. | No pudimos aplicar el cambio. Inténtalo de nuevo en un momento. |
| Failed to cancel invitation | We couldn't cancel that invitation. Try again in a moment. | No pudimos cancelar esa invitación. Inténtalo de nuevo en un momento. |
| Failed to change password | We couldn't change your password. Check your current one and try again. | No pudimos cambiar tu contraseña. Revisa la actual e inténtalo de nuevo. |
| Failed to complete onboarding. Please try again. | We couldn't finish setting up. Try again from this step. | No pudimos terminar la configuración. Inténtalo de nuevo desde este paso. |
| Failed to connect SimpleFin | We couldn't connect SimpleFin. Try again in a moment. | No pudimos conectar SimpleFin. Inténtalo de nuevo en un momento. |
| Failed to create account | We couldn't create that account. Check the name and balance, then try again. | No pudimos crear esa cuenta. Revisa el nombre y el saldo e inténtalo de nuevo. |
| Failed to create budget | We couldn't create that budget. Try again in a moment. | No pudimos crear ese presupuesto. Inténtalo de nuevo en un momento. |
| Failed to create group | We couldn't create that group. Try again in a moment. | No pudimos crear ese grupo. Inténtalo de nuevo en un momento. |
| Failed to create portfolio. Please try again. | We couldn't create that portfolio. Try again in a moment. | No pudimos crear esa cartera. Inténtalo de nuevo en un momento. |
| Failed to create recurring transaction | We couldn't create that recurring transaction. Try again in a moment. | No pudimos crear esa transacción recurrente. Inténtalo de nuevo en un momento. |
| Failed to create the token | We couldn't create the token. Try again in a moment. | No pudimos crear el token. Inténtalo de nuevo en un momento. |
| Failed to create transaction | We couldn't create that transaction. Try again in a moment. | No pudimos crear esa transacción. Inténtalo de nuevo en un momento. |
| Failed to delete | We couldn't delete that. Try again in a moment. | No pudimos eliminar eso. Inténtalo de nuevo en un momento. |
| Failed to delete account | We couldn't delete that account. Try again in a moment. | No pudimos eliminar esa cuenta. Inténtalo de nuevo en un momento. |
| Failed to delete budget | We couldn't delete that budget. Try again in a moment. | No pudimos eliminar ese presupuesto. Inténtalo de nuevo en un momento. |
| Failed to delete category. It may have associated transactions. | We couldn't delete that category. Check whether it has transactions, then try again. | No pudimos eliminar esa categoría. Revisa si tiene transacciones e inténtalo de nuevo. |
| Failed to delete group | We couldn't delete that group. Try again in a moment. | No pudimos eliminar ese grupo. Inténtalo de nuevo en un momento. |
| Failed to delete recurring transaction | We couldn't delete that recurring transaction. Try again in a moment. | No pudimos eliminar esa transacción recurrente. Inténtalo de nuevo en un momento. |
| Failed to delete rule | We couldn't delete that rule. Try again in a moment. | No pudimos eliminar esa regla. Inténtalo de nuevo en un momento. |
| Failed to delete transaction | We couldn't delete that transaction. Try again in a moment. | No pudimos eliminar esa transacción. Inténtalo de nuevo en un momento. |
| Failed to detect patterns | We couldn't detect patterns. Try again in a moment. | No pudimos detectar los patrones. Inténtalo de nuevo en un momento. |
| Failed to disconnect SimpleFin | We couldn't disconnect SimpleFin. Try again in a moment. | No pudimos desconectar SimpleFin. Inténtalo de nuevo en un momento. |
| Failed to export data | We couldn't export data. Try again in a moment. | No pudimos exportar tus datos. Inténtalo de nuevo en un momento. |
| Failed to find stock. Please try again. | We couldn't find that stock. Try again in a moment. | No pudimos encontrar esa acción. Inténtalo de nuevo en un momento. |
| Failed to ignore pattern | We couldn't ignore that pattern. Try again in a moment. | No pudimos ignorar ese patrón. Inténtalo de nuevo en un momento. |
| Failed to import transactions | We couldn't import your transactions. Try again in a moment. | No pudimos importar tus transacciones. Inténtalo de nuevo en un momento. |
| Failed to load accounts | We couldn't load your accounts. Try again in a moment. | No pudimos cargar tus cuentas. Inténtalo de nuevo en un momento. |
| Failed to load budgets | We couldn't load your budgets. Try again in a moment. | No pudimos cargar tus presupuestos. Inténtalo de nuevo en un momento. |
| Failed to load cap data. Please try again. | We couldn't load cap data. Try again in a moment. | No pudimos cargar los datos de límites. Inténtalo de nuevo en un momento. |
| Failed to load cards. Please try again. | We couldn't load your cards. Try again in a moment. | No pudimos cargar tus tarjetas. Inténtalo de nuevo en un momento. |
| Failed to load dashboard data | We couldn't load dashboard data. Try again in a moment. | No pudimos cargar los datos del resumen. Inténtalo de nuevo en un momento. |
| Failed to load group data | We couldn't load group data. Try again in a moment. | No pudimos cargar los datos del grupo. Inténtalo de nuevo en un momento. |
| Failed to load investment data | We couldn't load investment data. Try again in a moment. | No pudimos cargar los datos de inversiones. Inténtalo de nuevo en un momento. |
| Failed to load invitations | We couldn't load your invitations. Try again in a moment. | No pudimos cargar tus invitaciones. Inténtalo de nuevo en un momento. |
| Failed to load overview. Please try again. | We couldn't load overview. Try again in a moment. | No pudimos cargar el resumen. Inténtalo de nuevo en un momento. |
| Failed to load recurring transactions | We couldn't load your recurring transactions. Try again in a moment. | No pudimos cargar tus transacciones recurrentes. Inténtalo de nuevo en un momento. |
| Failed to load redemption options. Please try again. | We couldn't load redemption options. Try again in a moment. | No pudimos cargar las opciones de canje. Inténtalo de nuevo en un momento. |
| Failed to load rules | We couldn't load your rules. Try again in a moment. | No pudimos cargar tus reglas. Inténtalo de nuevo en un momento. |
| Failed to load team members | We couldn't load team members. Try again in a moment. | No pudimos cargar los miembros de tu equipo. Inténtalo de nuevo en un momento. |
| Failed to load transactions | We couldn't load your transactions. Try again in a moment. | No pudimos cargar tus transacciones. Inténtalo de nuevo en un momento. |
| Failed to parse CSV file | We couldn't parse CSV file. Try again in a moment. | No pudimos leer ese archivo CSV. Inténtalo de nuevo en un momento. |
| Failed to pick file | We couldn't pick file. Try again in a moment. | No pudimos seleccionar el archivo. Inténtalo de nuevo en un momento. |
| Failed to preview CSV | We couldn't preview CSV. Try again in a moment. | No pudimos mostrar la vista previa de el archivo CSV. Inténtalo de nuevo en un momento. |
| Failed to record settlement | We couldn't record settlement. Try again in a moment. | No pudimos registrar esa liquidación. Inténtalo de nuevo en un momento. |
| Failed to refresh prices | We couldn't refresh prices. Try again in a moment. | No pudimos actualizar los precios. Inténtalo de nuevo en un momento. |
| Failed to reject the proposal | We couldn't reject the proposal. Try again in a moment. | No pudimos rechazar la propuesta. Inténtalo de nuevo en un momento. |
| Failed to remove member | We couldn't remove that member. Try again in a moment. | No pudimos quitar ese miembro. Inténtalo de nuevo en un momento. |
| Failed to remove the folder | We couldn't remove the folder. Try again in a moment. | No pudimos quitar la carpeta. Inténtalo de nuevo en un momento. |
| Failed to resend invitation | We couldn't resend that invitation. Try again in a moment. | No pudimos reenviar esa invitación. Inténtalo de nuevo en un momento. |
| Failed to reset password. The link may have expired. | We couldn't reset your password. Request a new reset link and try again. | No pudimos restablecer tu contraseña. Solicita un enlace nuevo e inténtalo de nuevo. |
| Failed to revoke the token | We couldn't revoke the token. Try again in a moment. | No pudimos revocar el token. Inténtalo de nuevo en un momento. |
| Failed to save API key | We couldn't save that API key. Try again in a moment. | No pudimos guardar la clave API. Inténtalo de nuevo en un momento. |
| Failed to save budget | We couldn't save that budget. Try again in a moment. | No pudimos guardar ese presupuesto. Inténtalo de nuevo en un momento. |
| Failed to save card. Please try again. | We couldn't save that card. Try again in a moment. | No pudimos guardar esa tarjeta. Inténtalo de nuevo en un momento. |
| Failed to save category | We couldn't save that category. Try again in a moment. | No pudimos guardar esa categoría. Inténtalo de nuevo en un momento. |
| Failed to save notification settings | We couldn't save notification settings. Try again in a moment. | No pudimos guardar tus preferencias de notificaciones. Inténtalo de nuevo en un momento. |
| Failed to save rule | We couldn't save that rule. Try again in a moment. | No pudimos guardar esa regla. Inténtalo de nuevo en un momento. |
| Failed to save your account changes | We couldn't save your account changes. Try again in a moment. | No pudimos guardar los cambios de tu cuenta. Inténtalo de nuevo en un momento. |
| Failed to save. | We couldn't save that. Try again in a moment. | No pudimos guardar eso. Inténtalo de nuevo en un momento. |
| Failed to send invitation | We couldn't send that invitation. Try again in a moment. | No pudimos enviar esa invitación. Inténtalo de nuevo en un momento. |
| Failed to send reset email | We couldn't send reset email. Try again in a moment. | No pudimos enviar el correo para restablecer la contraseña. Inténtalo de nuevo en un momento. |
| Failed to send verification email | We couldn't send verification email. Try again in a moment. | No pudimos enviar el correo de verificación. Inténtalo de nuevo en un momento. |
| Failed to toggle recurring transaction | We couldn't change that recurring transaction. Try again in a moment. | No pudimos cambiar esa transacción recurrente. Inténtalo de nuevo en un momento. |
| Failed to toggle rule | We couldn't change that rule. Try again in a moment. | No pudimos cambiar esa regla. Inténtalo de nuevo en un momento. |
| Failed to toggle status | We couldn't change status. Try again in a moment. | No pudimos cambiar el estado. Inténtalo de nuevo en un momento. |
| Failed to transfer ownership | We couldn't transfer ownership. Try again in a moment. | No pudimos transferir la titularidad. Inténtalo de nuevo en un momento. |
| Failed to undo the change | We couldn't undo the change. Try again in a moment. | No pudimos deshacer el cambio. Inténtalo de nuevo en un momento. |
| Failed to undo the import | We couldn't undo the import. Try again in a moment. | No pudimos deshacer la importación. Inténtalo de nuevo en un momento. |
| Failed to update account | We couldn't update that account. Try again in a moment. | No pudimos actualizar esa cuenta. Inténtalo de nuevo en un momento. |
| Failed to update budget | We couldn't update that budget. Try again in a moment. | No pudimos actualizar ese presupuesto. Inténtalo de nuevo en un momento. |
| Failed to update group | We couldn't update that group. Try again in a moment. | No pudimos actualizar ese grupo. Inténtalo de nuevo en un momento. |
| Failed to update holding | We couldn't update that holding. Try again in a moment. | No pudimos actualizar esa posición. Inténtalo de nuevo en un momento. |
| Failed to update recurring transaction | We couldn't update that recurring transaction. Try again in a moment. | No pudimos actualizar esa transacción recurrente. Inténtalo de nuevo en un momento. |
| Failed to update role | We couldn't update that role. Try again in a moment. | No pudimos actualizar ese rol. Inténtalo de nuevo en un momento. |
| Failed to update settings | We couldn't update settings. Try again in a moment. | No pudimos actualizar tus ajustes. Inténtalo de nuevo en un momento. |
| Failed to update transaction | We couldn't update that transaction. Try again in a moment. | No pudimos actualizar esa transacción. Inténtalo de nuevo en un momento. |
| Group created successfully | Group created. | Grupo creado. |
| Group updated successfully | Group updated. | Grupo actualizado. |
| Holding added successfully | Holding added. | Posición añadida. |
| Invitation resent successfully | Invitation sent again. | Invitación reenviada. |
| Invitation sent successfully | Invitation sent. | Invitación enviada. |
| Member added successfully | Member added. | Miembro añadido. |
| Member removed successfully | Member removed. | Miembro eliminado. |
| No Holdings Yet | No holdings yet. Add one to start tracking your investments. | Aún no tienes posiciones. Añade una para empezar a seguir tus inversiones. |
| No accounts yet | No accounts yet. Add one, by bank or by hand, and finPal starts from there. | Aún no tienes cuentas. Añade una, mediante tu banco o a mano, y finPal empieza desde ahí. |
| No budgets yet | No budgets yet. Start with one category you'd like to keep an eye on. | Aún no tienes presupuestos. Empieza por una categoría que quieras seguir. |
| No budgets yet. Create your first budget to start tracking! | No budgets yet. Start with one category you'd like to keep an eye on. | Aún no tienes presupuestos. Empieza por una categoría que quieras seguir. |
| No cards added yet | No cards yet. Add one to keep track of its rewards. | Aún no tienes tarjetas. Añade una para seguir sus recompensas. |
| No categories found | No categories here yet. Add one to start sorting your spending. | Aún no hay categorías aquí. Añade una para empezar a ordenar tus gastos. |
| No categories yet | No categories yet. Add one to start sorting your spending. | Aún no tienes categorías. Añade una para empezar a ordenar tus gastos. |
| No goals yet | No goals yet. Name one thing you're saving for, and finPal will track it with you. | Aún no tienes metas. Piensa en algo para lo que quieras ahorrar y finPal te ayudará a seguirlo. |
| No groups yet | No groups yet. Create one to keep shared expenses together. | Aún no tienes grupos. Crea uno para reunir los gastos compartidos. |
| No recurring transactions yet | No recurring transactions yet. Add a regular bill or income to start. | Aún no tienes transacciones recurrentes. Añade una factura o un ingreso habitual para empezar. |
| No rules yet | No rules yet. Start with one transaction you often sort the same way. | Aún no tienes reglas. Empieza por una transacción que suelas ordenar de la misma manera. |
| No transactions found | Nothing matches that search. Try fewer words or a wider date range. | Nada coincide con esa búsqueda. Prueba con menos palabras o un intervalo de fechas más amplio. |
| No transactions yet | Nothing here yet. Transactions show up after your first sync or import. | Aquí aún no hay nada. Las transacciones aparecen después de la primera sincronización o importación. |
| Not included above, because finPal could not read who owes whom: {{join}}. | We couldn't read who owes whom for {{join}}, so these groups aren't included above. Try refreshing in a moment. | No pudimos consultar quién debe a quién en {{join}}, así que estos grupos no se incluyen arriba. Intenta actualizar en un momento. |
| Nothing to show here. This server does not report how many expenses the group has, so finPal cannot tell an empty group from a list it failed to load. | We can't show this group's expenses. The server doesn't report whether there are any. Try refreshing in a moment. | No podemos mostrar los gastos de este grupo. El servidor no indica si hay alguno. Intenta actualizar en un momento. |
| Password changed successfully! | Password changed. | Contraseña cambiada. |
| Password reset successfully! | Password reset. | Contraseña restablecida. |
| Prices updated successfully | Prices updated. | Precios actualizados. |
| Recurring transaction created successfully | Recurring transaction added. | Transacción recurrente añadida. |
| Recurring transaction deleted successfully | Recurring transaction deleted. | Transacción recurrente eliminada. |
| Recurring transaction updated successfully | Recurring transaction updated. | Transacción recurrente actualizada. |
| Role updated successfully | Role updated. | Rol actualizado. |
| Rule saved successfully! | Rule saved. | Regla guardada. |
| Settlement recorded successfully | Settlement recorded. | Liquidación registrada. |
| SimpleFin connected successfully! | SimpleFin connected. | SimpleFin conectado. |
| SimpleFin disconnected successfully | SimpleFin disconnected. | SimpleFin desconectado. |
| Status updated successfully | Status updated. | Estado actualizado. |
| Stock holding updated successfully | Holding updated. | Posición actualizada. |
| Successfully applied rules to {{transactions_updated}} of {{transactions_processed}} transactions | Rules applied to {{transactions_updated}} of {{transactions_processed}} transactions. | Reglas aplicadas a {{transactions_updated}} de {{transactions_processed}} transacciones. |
| The bank was linked but finPal could not finish setting it up. | Your bank is linked, but we couldn't finish setting it up. Try connecting it again. | Tu banco está vinculado, pero no pudimos terminar la configuración. Intenta conectarlo de nuevo. |
| Transaction added successfully | Transaction added. | Transacción añadida. |
| Transaction created successfully! | Transaction added. | Transacción añadida. |
| Transaction updated successfully | Transaction updated. | Transacción actualizada. |
| Transaction updated successfully! | Transaction updated. | Transacción actualizada. |
| We could not finish signing you in | We couldn't finish signing you in. Return to sign-in and try again. | No pudimos terminar de iniciar tu sesión. Vuelve al inicio de sesión e inténtalo de nuevo. |
| Your kit could not be loaded. | We couldn't load your Kit. Try again in a moment. | No pudimos cargar tu Kit. Inténtalo de nuevo en un momento. |
| finPal could not load its introduction. Nothing is wrong with your account, and you can carry on and read it later in Settings. | We couldn't load the introduction. You can carry on and read it later in Settings. | No pudimos cargar la introducción. Puedes continuar y leerla después en Ajustes. |
| ✓ Category created successfully! | Category added. | Categoría añadida. |
| ✓ Category updated successfully! | Category updated. | Categoría actualizada. |
| ✓ Group created successfully! | Group created. | Grupo creado. |
| ✓ Notification preferences saved successfully! | Notification preferences saved. | Preferencias de notificaciones guardadas. |
| ✓ Settings saved successfully! | Settings saved. | Ajustes guardados. |

### Other empty states (draft, 2026-10-12)

| Today | Rewrite (draft) | Spanish (draft) |
|---|---|---|
| No activity yet. | No activity yet. Agent actions will appear here when they run. | Aún no hay actividad. Las acciones de agentes aparecerán aquí cuando se ejecuten. |
| No tokens yet. | No tokens yet. Create one when you want to connect an agent. | Aún no tienes tokens. Crea uno cuando quieras conectar un agente. |
| No folders are being watched yet. | No folders yet. Add one to import files as they arrive. | Aún no tienes carpetas. Añade una para importar archivos cuando lleguen. |
| No net worth history yet | No history yet. Your net worth snapshots will appear here over time. | Aún no hay historial. Los registros de tu patrimonio neto aparecerán aquí con el tiempo. |
| No accounts found | No accounts to show here. Add one on the Accounts page to start. | No hay cuentas que mostrar aquí. Añade una en la página Cuentas para empezar. |
| No expense data found | No spending to show here yet. Add a transaction, sync your bank or import a file to start. | Aún no hay gastos que mostrar aquí. Añade una transacción, sincroniza tu banco o importa un archivo para empezar. |
| No income recorded this month yet | No income recorded this month. Add it when you have it. | No hay ingresos registrados este mes. Añádelos cuando los tengas. |
| No programs found. Fill in a nickname below to add manually. | That search didn't find a program. Add a nickname below to enter the card by hand. | La búsqueda no encontró ningún programa. Añade un nombre abajo para introducir la tarjeta a mano. |
| No cards yet — add one to start tracking points. | No cards yet. Add one to start tracking its points. | Aún no tienes tarjetas. Añade una para empezar a seguir sus puntos. |
| No expenses have been added to this group yet. | No shared expenses yet. Add one when you have something to split. | Aún no hay gastos compartidos. Añade uno cuando tengas algo que repartir. |
| No {{toLowerCase}} budgets yet. | No {{toLowerCase}} budgets yet. Start with one category. | Aún no tienes presupuestos de {{toLowerCase}}. Empieza por una categoría. |
| No transactions yet in this category | Nothing recorded in this category yet. Transactions you put here will appear in this list. | Aún no hay nada registrado en esta categoría. Las transacciones que asignes aquí aparecerán en esta lista. |
| No contributions recorded yet. | No contributions recorded yet. Add one when you move money toward this goal. | Aún no hay aportaciones registradas. Añade una cuando destines dinero a esta meta. |
| No goals yet. Link one to an account and finPal will track it for you. | No goals yet. Choose one thing to work toward, then link it to an account or track it by hand. | Aún no tienes metas. Elige algo que quieras conseguir y vincúlalo a una cuenta o síguelo a mano. |
| You have no accounts yet, so this goal will be tracked by hand. | No accounts yet. You can still track this goal by hand. | Aún no tienes cuentas. Puedes seguir esta meta a mano. |
| No cards in your wallet yet — add cards in pointsPal first. | No cards to link yet. Add one in pointsPal first. | Aún no tienes tarjetas que vincular. Añade una en pointsPal primero. |
| No transactions yet — they will arrive on the next sync. | No transactions yet. Check again after the next sync. | Aún no hay transacciones. Vuelve a comprobarlo después de la próxima sincronización. |
| No cash flow recorded yet. | No cash flow recorded yet. Add income or spending to start seeing the picture. | Aún no hay movimientos registrados. Añade ingresos o gastos para empezar a ver el panorama. |
| No portfolios yet | No portfolios yet. Create one to keep your holdings together. | Aún no tienes carteras. Crea una para reunir tus posiciones. |
| No cards yet. Add them in the web app and they will show up here. | No cards yet. Add one in the web app, then come back here to track its rewards. | Aún no tienes tarjetas. Añade una en la aplicación web y vuelve aquí para seguir sus recompensas. |

Core group summary (draft): "We couldn't read who owes whom for these groups, so they aren't included above: [group names]. Try refreshing in a moment."
