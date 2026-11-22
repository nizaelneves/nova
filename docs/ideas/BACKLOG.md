# Feature ideas to discuss later

Saved on 2026-10-04. The user asked to talk about these **after the current work on Phibe's global voice is finished** (see `docs/specs/global-voice.md`). Nothing here is decided or built.

## 1. Find the client from a meeting, a CRM or another source, and save it in a Workspace
Phibe reads where a client shows up (a meeting transcript or invite, a CRM record, an email, another connected source), works out who the client is, and creates or updates that client's **Workspace** with what it found.
Questions for when we discuss it: which sources first (calendar/meeting notes, a CRM such as HubSpot or Pipedrive, email); how to avoid duplicates (same client, different spellings); what gets saved (contact, company, services contracted, dates, notes) and what the user must confirm before anything is created; where it connects to the existing Workspaces (`workspaces.ts`: workspaces, playbooks, templates) and to Data Sources.

## 2. Quiz on the content you want to review
Phibe turns something the user wants to study or revisit (a note, a document, a memorized topic, a conversation, a Workspace briefing) into a **quiz**, so the user reviews by answering instead of rereading.
Questions for when we discuss it: which sources (Memorize topics, uploaded documents, chat history); question types (multiple choice, short answer, flashcards); how often to bring it back (spaced repetition, ties in with Pings and the "Memorize" idea); where it lives in the app; how answers are scored and stored. Connects naturally to the Fibonacci idea (review at growing intervals: 1, 2, 3, 5, 8 days).

## 3. GSAP for animations: decided, not needed now
Our CSS, canvas and small helpers already cover every effect with ~0 % CPU at rest; GSAP would add bundle size and a ticker for no gain. Revisit only if a timeline-heavy animation shows up.

## Done: Tasks "Calendar" is now a month grid (2026-10-05)
The user's reference image (weeks as rows, colored event chips with a time, "N more..." overflow, today circled, other-month days dimmed) became the new **Calendar** view in Tasks, Sunday to Saturday (`lib/calendar.ts`, `TaskMonthView` in `TasksPage.tsx`). Possible next steps: the same grid for Workspaces activities (start to due as a bar), click an empty day to create a task on it, drag a chip to another day.
