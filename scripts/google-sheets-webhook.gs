We are upgrading this client project to match my new Agency Workflow & POV.

First, read my updated global skill at `C:\Users\zone\.gemini\config\skills\social-media-agency-system\SKILL.md` and inspect this workspace's existing `GEMINI.md`, strategy docs, folder structure, and automation scripts/workflows.

Then prepare a clear migration plan (and wait for my confirmation before modifying live workflows or publishing settings) to upgrade this client to the new standard:

1. **Grid & Style DNA Alignment (Continuity Check):**
   - Check whether this client is an established page that needs **Continuity Mode** (preserve their existing graphic design, post style, and Reels DNA while subtly polishing quality so the client and audience never feel an abrupt agency change) or **Redesign Mode**.
   - Keep visual language aligned with the chosen mode, and ensure all captions, scripts, and DMs pass `instagram-agent` (`ig-human`) checks with zero AI slop and zero em-dashes.

2. **Strategy & Content Cadence Upgrade (`instagram-agent` skills):**
   - Use the `instagram-agent` skills to verify/update the strategy and 30-day calendar so feed content posts **alternate days (day after day — Posts/Carousels alternating with Reels, never daily feed posts)**, while **Stories run EVERY SINGLE DAY without stopping (30/30 days)**.

3. **Upgrade to the 6-Folder Cloud Structure (Google Drive Primary + Optional Local Mirror):**
   - `01_client_materials/` — Raw client photos & videos (sacred, never modified or deleted).
   - `02_edited_for_approval/` — Auto-pulled photos edited with the client's brand design + paired IG/FB captions waiting for my email approval.
   - `03_ready_to_post_today/` — Today's approved static/carousel Post ready for auto-publish or manual scheduling.
   - `04_reel_ready_to_post/` — Where I upload my finished Flow Labs Reel MP4 to be auto-published or held for manual scheduling.
   - `05_daily_story/` — Dedicated daily Story queue prepared every single day so Stories never stop.
   - `06_already_posted/` — Automatic archive (`YYYY-MM-DD_<slug>/`) after publishing.

4. **Migrate Automation to 24/7 Cloud (MUST Work When My Laptop Is OFF):**
   - Remove any requirement for my laptop to stay open. Move daily triggers, auto-editing, email approvals, Reel prompt dispatch, daily Story prep, publishing, and archiving to **24/7 cloud execution** (n8n Cloud + Google Drive + Gmail + cloud rendering/editing + Meta Graph API / Composio).
   - **Gmail Approval Flow (Human-in-the-Loop):**
     - **Post Days (Alternate Days):** Auto-pick unused raw photo(s) from `01_client_materials/`, apply brand graphic edits into `02_edited_for_approval/`, and email me the visual previews + IG & FB captions.
       - If I reply **`OK` or `APPROVE`** -> Move to `03_ready_to_post_today/`, verify the exact target Instagram handle & Facebook Page ID, auto-publish to IG & FB, and archive to `06_already_posted/`.
       - If I reply **`SCHEDULE` or `SCHEDULED`** -> Move to `03_ready_to_post_today/` and **do NOT auto-publish** so I can schedule it manually myself.
     - **Reel Days (Alternate Days):** Inspect `01_client_materials/`, select the best video(s) (or tell me which clips and exact order to shoot/assemble), and email me the full **Flow Labs Reel Kit** (Flow prompt, Reel idea, hooks, beat sheet, on-screen text, and IG/FB captions). Once I create the Reel and upload the MP4 into `04_reel_ready_to_post/`, run the same `OK`/`APPROVE` (auto-publish + archive) vs. `SCHEDULE` (manual schedule) email flow.
     - **Daily Stories (Every Day):** Prepare `05_daily_story/` daily and email me for `OK`/`APPROVE` vs. `SCHEDULE` so daily Stories never pause.

5. **Safety & Memory:**
   - Never hardcode API keys/tokens (use n8n encrypted Credentials/Variables).
   - Programmatically verify the exact Instagram handle and Facebook Page ID before every publish action.
   - Once I confirm the migration plan, update the folders, n8n cloud workflow, and this project's `GEMINI.md`.

First, inspect the existing files in this workspace, list what needs to change, and ask me for my approval Gmail address, n8n Cloud / cloud renderer details, or any missing Drive/Account IDs before making edits.