# Connecting external tools: Cogniterra and Autolab

SCS Learn hosts graded work in tools that already exist rather than building an
autograder. This document covers how that connection works, what each tool can
and cannot do, and how to set one up.

## The headline: the two tools do not speak the same protocol

There is no single LTI version that reaches both, so the platform speaks both.

| | Cogniterra (Stepik) | Autolab |
|---|---|---|
| LTI version | **1.1 only** | **1.3 only** (LTI Advantage) |
| Credential model | consumer key + shared secret, per course or per lesson | OAuth2 client_id + JWKS keypair |
| Learner launch | yes, renders in our iframe | not usefully (see below) |
| Grade passback | **yes**, Basic Outcomes | **no** |
| Roster sync | no | yes, NRPS |
| How SCS Learn gets grades | **pushed** to `/api/lti/outcomes` | **pulled** from its REST API |

Sources: Stepik's own LTI documentation states it supports LTI 1.1, and the
Cogniterra API exposes `lti_consumer_key` / `lti_secret_key` string fields on a
course, which is the 1.1 credential model. Autolab's docs state "Currently, only
course roster synchronization is supported", and its repository contains
`lti_launch_controller.rb` and `lti_nrps_controller.rb` with no AGS controller.

### Three Autolab constraints worth knowing before planning around it

1. **No grade passback.** Autolab has no Assignment and Grade Services. An
   Autolab score cannot arrive over LTI at all. This is why `lib/autolab/`
   exists alongside `lib/lti/`.
2. **Its LTI launch is an instructor flow, not a learner flow.** The controller
   is declared `action_auth_level :launch, :instructor` and its purpose is to
   let an instructor link a course so rosters can sync. It does not carry a
   learner into an assessment.
3. **One issuer only.** The controller compares the incoming `iss` against a
   single configured value, with the code commenting that only one integration
   is supported for now. If CMU's Autolab instance is already registered to
   Canvas, it cannot also register SCS Learn without changing that.

The practical consequence: **Cogniterra is the tool that makes the graded-lesson
demo work.** Autolab is reachable, but through its REST API, with the learner
opening it in a new tab.

## What is implemented

```
lib/lti/oauth1.ts        OAuth 1.0a HMAC-SHA1 signing and verification
lib/lti/launch.ts        Builds and renders the signed launch form
lib/lti/config.ts        Platform identity, public URL, the current learner
lib/lti/tools.ts         Reads and writes for the lti_* tables
app/api/lti/launch/[linkId]   Signed launch, rendered into the lesson iframe
app/api/lti/outcomes          Basic Outcomes endpoint (grades arrive here)
app/api/lti/return            launch_presentation_return_url

lib/autolab/client.ts    OAuth2 token handling for the Autolab REST API
lib/autolab/grades.ts    Pulls scores into Supabase
app/api/autolab/sync            Pull this learner's score for one lesson
app/api/autolab/oauth/callback  One-time OAuth bootstrap

components/lti/ExternalActivity.tsx   The learner-facing embed

supabase/lti.sql         LTI tables. Run after schema.sql
supabase/autolab.sql     Autolab tables. Run after lti.sql
```

Run the unit tests with `npm run test:lti`.

## Environment

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...     # new, and deliberately not NEXT_PUBLIC_
NEXT_PUBLIC_SITE_URL=https://...  # required in production, see below
```

`SUPABASE_SERVICE_ROLE_KEY` is required because `lti_tools` and
`autolab_credentials` hold shared secrets and OAuth refresh tokens. Unlike every
other table in this project they have **RLS enabled with no policy at all**, so
the browser anon key cannot read them. Do not "fix" that by adding a permissive
policy: anyone who can read a shared secret can forge a launch and impersonate
any learner to Cogniterra.

`NEXT_PUBLIC_SITE_URL` matters more than it looks. The OAuth signature is
computed over the absolute URL of the endpoint, and Cogniterra recomputes it
from the URL it was configured with. Behind Vercel the request host may be a
preview or internal hostname, and the mismatch surfaces as a bare "invalid
signature" with no other diagnostic.

## Connecting a Cogniterra course

1. **Pick the Cogniterra course or lesson** and note its numeric id from the URL.

2. **Set a key and secret on it.** In the Cogniterra course settings under
   Settings > Advanced, or through the API by writing `lti_consumer_key` and
   `lti_secret_key` on the course. Generate a real random secret; the ones on the
   old Coursera week courses are human-chosen words and should not be copied.

3. **Set the course privacy to public** if learner name and email should reach
   Cogniterra. Cogniterra suppresses both otherwise, which shows up as anonymous
   learners on its side. This is the `send_learner_identity` column.

4. **Register the tool** in Supabase:

   ```sql
   insert into public.lti_tools (name, vendor, lti_version, launch_url, consumer_key, shared_secret)
   values ('Cogniterra', 'cogniterra', '1.1', 'https://cogniterra.org/lti/', '<key>', '<secret>');
   ```

5. **Attach it to a lesson.** `custom_params` takes exactly one of `course` or
   `lesson`, matching what you chose in step 1. It reaches Cogniterra as
   `custom_course` / `custom_lesson`.

   ```sql
   insert into public.lti_links (lesson_id, tool_id, title, custom_params, points_possible)
   values ('<lesson uuid>', '<tool uuid>', 'Hidden messages exercise',
           '{"course": "782"}'::jsonb, 100);

   update public.lessons set type = 'external' where id = '<lesson uuid>';
   ```

6. **Render it** with `<ExternalActivity kind="lti" url={`/api/lti/launch/${linkId}`} ... />`.

Grades then arrive on their own: Cogniterra POSTs to `/api/lti/outcomes` when a
learner passes a graded step, and the score lands in `lti_results`.

### The course the first demo points at

**Cogniterra course 782, "02-180 Coding Assignments (Spring 2026 Mini 4)"**
(Phillip's decision, 2026-08-31). It already has LTI enabled, and its launch was
verified with the checks below.

Get its consumer key and secret from Phillip or the `SCS Learn` 1Password vault.
They are not in this repo, and should not be: a shared secret in git is a shared
secret in every fork and every CI log.

Two things to know about that course:

- **A Cogniterra course has exactly one consumer key/secret pair.** There is no
  per-consumer registration, so SCS Learn and Canvas share one credential on
  course 782 rather than holding separate ones. Fine for a demo. Before this is
  real, the 02-180 content should be cloned into its own course so SCS Learn gets
  its own credential slot and its own roster.
- 782 is **free and private** and its LTI works anyway, so Stepik's
  documented "paid courses only" restriction does not apply on Cogniterra. There
  is no risk of an LTI launch giving away paid course content here.

### Verified against the live server

The signing implementation was checked end to end against `https://cogniterra.org/lti/`
using the credentials stored on courses 838 and 782:

- Correct secret: accepted, redirects to `/lti/continue/<token>/`.
- Wrong secret: rejected with "Wrong LTI Key (Consumer) or LTI Secret".

One gotcha found in that test: Cogniterra's `/lti/continue/` step is Django and
**requires a Referer header**. A normal browser sends one, but do not set
`Referrer-Policy: no-referrer` on the lesson page or add `referrerpolicy="no-referrer"`
to the iframe, or the launch dies after a signature that verified correctly.

**The full redirect chain was then replayed the way a browser walks it** (POST,
then follow the 302 as a GET carrying the cookies and a Referer):

```
POST /lti/                     302  -> /lti/continue/<token>/   (sets csrftoken, sessionid)
GET  /lti/continue/<token>/    302  -> /lesson/59284/?unit=50771
GET  /lesson/59284/?unit=50771 200
```

The lesson page comes back reporting `is_guest: false` with the launched
learner's name, so the launch really does provision and authenticate the user
inside course 782, not just pass a signature check.

**Framing is fine.** Cogniterra sends no `X-Frame-Options` and no CSP
`frame-ancestors` on `/`, `/lti/`, a course page, or the lesson page the launch
lands on, so it does not refuse to be embedded. `openInNewTab` on
`ExternalActivity` remains available, and grade passback is unaffected by the
choice either way because it does not travel through the browser.

## Connecting an Autolab assessment

1. **Register an OAuth application** in Autolab (Admin > OAuth applications) with
   redirect URI `https://<site>/api/autolab/oauth/callback` and scopes
   `user_info user_courses user_scores instructor_all`. Reading another user's
   score requires `instructor_all`; `user_scores` only reaches your own.

2. **Store the client credentials:**

   ```sql
   insert into public.autolab_credentials (base_url, client_id, client_secret)
   values ('https://autolab.andrew.cmu.edu', '<client id>', '<client secret>');
   ```

3. **Authorize once, as an instructor account.** Autolab enables only the
   `authorization_code` grant, so a human has to approve in a browser. Visit:

   ```
   https://<autolab>/oauth/authorize?client_id=<id>&redirect_uri=<site>/api/autolab/oauth/callback&response_type=code&scope=user_info+user_courses+user_scores+instructor_all
   ```

   The callback exchanges the code and stores the tokens. After this it is
   self-sustaining, with one caveat: **Autolab rotates the refresh token on every
   refresh.** That is why the tokens live in a table and not in an env var, and
   why losing that row means redoing this step by hand.

4. **Attach an assessment to a lesson**, using the names as they appear in
   Autolab's URLs:

   ```sql
   insert into public.autolab_links (lesson_id, course_name, assessment_name, title, points_possible)
   values ('<lesson uuid>', '02-180-f26', 'hw1', 'Homework 1', 100);
   ```

5. **Render it** with `<ExternalActivity kind="autolab" ... />`. The learner opens
   Autolab in a new tab and pulls their score back with "Check my score", which
   calls `/api/autolab/sync`.

New tab rather than iframe is the default on purpose: Autolab enforces its own
SSO and sets SameSite cookies, both of which are unreliable in a cross-origin
frame. `autolab_links.embed_in_iframe` exists for when someone wants to try.

Scores are joined to learners **by email**, because that is the only identifier
Autolab's scores endpoint accepts. Once real auth lands, that has to be the
learner's CMU address rather than whatever they signed up with.

## Security notes for whoever touches this next

- **The outcomes endpoint is unauthenticated by URL and authenticated by
  signature.** Anyone can POST to it. What stops a forged grade is the OAuth
  signature over the body, the `oauth_body_hash`, and the unguessable
  `lis_result_sourcedid`. A missing body hash is a rejection, not a pass:
  without it the body is unsigned and any score could be swapped in.
- **Nonces are stored** in `lti_nonces` to stop a captured `replaceResult` being
  replayed later to overwrite a better grade. Prune it periodically:
  `delete from public.lti_nonces where seen_at < now() - interval '1 day';`
- **`resource_link_id` and `lis_result_sourcedid` must stay stable** across
  relaunches. They are the link id and a stored uuid for exactly that reason. A
  regenerated sourcedid means the tool reports grades against a row nobody reads.
- **`TOOL_CONSUMER_INSTANCE_GUID` is permanent.** Tools key their learner records
  off it, so changing it after launches have happened orphans every learner's
  progress on the tool side.

## Still open

- Auth is stubbed platform-wide, so every launch currently carries the same stub
  learner (`lib/lti/config.ts`, `getLaunchingUser`). That is the one function to
  change when login lands, and it must return a **stable per-learner id**.
- No instructor UI for attaching a tool to a lesson yet. Links are inserted by
  SQL, which is deliberate while the instructor side is intentionally minimal.
- LTI 1.3 as a *platform* (OIDC, JWKS, NRPS) is not built. It is only worth
  building if Autolab roster sync is actually wanted, since it cannot carry
  grades, and it collides with Autolab's single-issuer limit.
