GMR CHAT V2.2.55 — ACTIVE SHEET CANCEL CHECKBOX
===============================================

Base: V2.2.54

What changes
------------
1) Backend /sheet-control supports manual_action = CANCEL_JOB.
2) CANCEL_JOB is intentionally limited to Job status = processing.
3) waiting_payment / removed / paid jobs are blocked from checkbox cancellation.
4) No customer notification is sent by CANCEL_JOB.
5) Apps Script deletes the T0_ACTIVE/T2_ACTIVE row ONLY AFTER backend confirms
   the canonical database Job was changed to status=cancelled.
6) Cancelled jobs are no longer processing jobs, so they should no longer be
   eligible for the processing review-monitor / department dispatch queries.

Files
-----
- server.js
- AppsScript_V55_Active_Cancel.gs

Deploy backend
--------------
Replace src/server.js with this server.js and deploy Render.
No new Render environment variable is required.

Google Apps Script
------------------
A) Paste AppsScript_V55_Active_Cancel.gs into the EXISTING Apps Script project.

B) In the existing handleSheetEdit(e), immediately after:
     const sheet = e.range.getSheet();
     const row = e.range.getRow();
     const column = e.range.getColumn();
   add:

     const sheetName = sheet.getName();
     if (["T0_ACTIVE", "T2_ACTIVE"].includes(sheetName)) {
       handleGmrActiveCancelEdit_(e);
       return;
     }

C) Save.

D) Run setupGmrActiveCancelCheckboxes() ONCE manually and authorize if asked.
   It creates column N header "Cancel" and checkboxes in T0_ACTIVE/T2_ACTIVE.

E) Do NOT create a second edit trigger if handleSheetEdit(e) is already your
   installed spreadsheet edit trigger.

Usage
-----
- Tick Cancel on a processing row -> database status becomes cancelled first,
  then that row is deleted from T0_ACTIVE/T2_ACTIVE automatically.
- Tick Cancel on waiting_payment -> backend rejects it, row remains, checkbox
  is reset, and a note/toast explains why.

Safety
------
Do not manually delete Active rows as the cancellation mechanism. The database
Job is canonical; the checkbox ensures DB and Sheet stay consistent.
