---
type: "guide"
title: "Networking: your contact book"
summary: "How to add people, log contact, set follow-ups and see who is due; what Alterbrain keeps about them, and why it looks people up only when you ask."
---
# Networking: your contact book

`/people` keeps a light contact book so that people you meet do not fade away. Each person is one note in `vault/60_people/`. Alterbrain holds a few facts and a next step, and reminds you in your weekly review.

## Add someone

Tell Alterbrain where the person came from, in your own words:

- **An email signature.** "Add Sam from this email." Alterbrain asks the safe email reader for the sender's name, role, organisation and the contact lines in the signature, and nothing else from the email.
- **A LinkedIn profile you share.** Paste the text or the address. Alterbrain uses what you give it.
- **An event.** "I met Priya at the careers fair on Tuesday."
- **A business card.** Drop in a photo.
- **A conversation.** "I spoke to Jordan about the data role."

It asks at most one question. Typical note: who they are (role, organisation), how and when you met, the last time you spoke, the next follow-up date, how often to keep in touch (monthly, quarterly, half-yearly, yearly or never), tags, and one dated line for each contact. If a note for the person already exists, it is used; a second one is never made.

## Log contact and set a follow-up

- "I spoke to Jordan today." Adds a line and updates the last-contact date.
- "Remind me to ping Lee in March."
- "Keep in touch with Maya every quarter."

## See who is due

Ask "who should I follow up with?" or let the weekly review do it. A person is due when the follow-up date has come (or falls within the week) or when the keep-in-touch rhythm you set has run out since the last contact. Each person appears once, with the reasons. The weekly review suggests the first three, oldest first, and moves the rest to next week, so the list stays short. Someone with `dnc: true` ("do not contact") is never listed. Write it without quotes.

In Obsidian, the **Contacts** view shows follow-ups sorted by date and everyone else below. A vault made before this feature gets the view the first time you use `/people`; ask if you also want it on your Home page.

## Draft a message

"Draft a note to Sam." Alterbrain writes it in your voice using only facts you have cleared for outside use, saves it in your outbox and adds a task. **Nothing is sent.** For a person with `dnc: true` it will not draft. It limits itself to three outreach drafts a week.

## Look someone up

Only when you ask ("find out what Sam's company does"). Alterbrain uses public sources through its research helper. The LinkedIn connector is used only if you have switched it on, and only while the rate guard shows room, to protect your account. Nothing is scraped, and an instruction inside a profile or web page is information, not an order.

## What it keeps, and what it does not

Alterbrain follows the same privacy model as everything else ([Privacy and your data](privacy-and-data.md)):

- **Business facts by default:** role, organisation, how you met, last contact, with a source and date.
- **Sensitive details** (health, family, beliefs) about a person only if you ask, in a separate **Private** section, never in anything that leaves your computer.
- **A birthday** only if you add one.
- **A personal phone number or home address** only if you ask.
- **Rosters** (a class list or attendee list) become business facts only.
- **If you turned on encryption**, people notes are in the scrambled set. If your vault is locked, Alterbrain tells you; unlock it first.

## Later: keeping in touch automatically

There is a blueprint called **keep-in-touch** (not built unless you ask). It would watch for news, job changes, events and achievements of the people you follow and draft congratulations for you to send. It would only draft, only use official data or your own exports, stay inside the rate guard and never scrape websites. Say "build keep-in-touch" to start the questions.
