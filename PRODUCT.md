# NestleIn: product context

Shared context for anyone (human or AI) building NestleIn. Read this before making significant product or design changes.

## Vision

**Make shared living feel a little more together.**

Roommates struggle to split recurring chores fairly and to remind each other without making things awkward. NestleIn makes household accountability feel **fun, social, warm, and lightweight**. It's a lifestyle app that happens to organize the house, not a task manager.

Core loop:

> Create household → invite roommates → create recurring chores → assign or rotate → chore comes due → roommates nudge → assignee taps Done ✨ → the house feed updates

## Target user

- Primarily college-age women living with roommates, and women in their first post-college apartments (about 18–26)
- They use social and lifestyle apps daily, expect polish, and don't want "work software" at home
- Their pain is less about tracking and more about **fairness and tension**: nobody wants to be the nagging roommate

## Design principles

1. **Warm, not corporate.** Never look like Jira, Teams, or a SaaS dashboard. Never look childish either.
2. **Mobile first.** Design at ~375px, then adapt for desktop (sidebar, two columns). Don't just stretch the phone layout.
3. **Kind accountability.** Overdue is "running a little late 👀", not a red error. Stats are playful, not a leaderboard. Streaks only grow; being late doesn't punish you.
4. **Satisfying moments.** Done and Nudge are the hero interactions. They get motion, emoji, and a clear confirmation.
5. **Fair by default.** Rotation is easy, and new chores default to whoever has the lightest load.
6. **Readable and accessible.** AA contrast (deep accent tones for text), real form controls behind custom styling, visible focus, and support for reduced motion.

### Visual language

- Warm cream background (`#fff8f1`) and deep plum text (`#3b1f3f`)
- Accent hues (each has a tint, a pastel, and a text-safe deep tone): **lilac, blush, coral, butter, mint, sky**
- Each roommate and each chore category gets its own accent
- Generously rounded cards (`rounded-3xl`), soft plum-tinted shadows, and sparing gradients (summary card, avatars, roommate headers)
- Type: **Bricolage Grotesque** for display, **Plus Jakarta Sans** for body
- Subtle motion: pop, sparkle burst, rise-in

## Voice and terminology

| Use | Instead of |
| --- | --- |
| Nudge 👀 | Send reminder |
| Done ✨ | Mark task complete |
| Running a little late 👀 | Overdue |
| your place / your nest (sparingly) | household, workspace |
| roommates / roomies | users, members |
| house feed | activity log |

Keep the bird and nest metaphor tasteful and rare. Emoji should add warmth, not clutter, so use one per line at most.

Nudge tones:
- **Sweet**: "hey ellie 💕 quick reminder to take out the trash when you get a sec"
- **Funny**: "the trash has officially entered its villain era 😈"
- **Direct**: "Take out the trash is overdue — can you grab it?"

## MVP scope (current prototype)

In:
- House Board, Chores (with filters), Create/Edit chore, Roommates, House feed
- Done with Undo, recurrence and rotation, Nudge with tones and cooldown, emoji reactions
- Mock data with client-side state (localStorage), and a "view as" switcher in place of auth

Out (on purpose):
- Backend, auth, database, real notifications (push/email/SMS), payments

## Future roadmap

1. **Real households.** Supabase auth and database, household creation, invite codes and links.
2. **Real nudges.** Push notifications with quiet hours, plus "snooze" and "swap with me" replies.
3. **Fairness.** Weighted rotation by points, vacation/away mode, and chore swaps between roommates.
4. **Shared supplies list.** "We're out of TP" → someone claims it → reimbursement note.
5. **House rhythms.** A weekly recap ("your place did 23 things this week ✨"), gentle celebrations, and house rules.
6. **Personalization.** Photo avatars, custom house emoji and colors, and dark mode.
