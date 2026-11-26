import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "playwright";
import { runStagingSmoke } from "./staging-smoke.mjs";

const config = {
  DEPLOY_ENV: "staging",
  EXPECTED_APP_ORIGIN: "https://app.example.test",
  NEXT_PUBLIC_SUPABASE_URL: "https://db.example.test",
  SMOKE_EMAIL: "learner@example.test",
  SMOKE_PASSWORD: "dummy-password",
  SMOKE_COURSE_CODE: "example",
  SMOKE_MEDIA_PATH: "/storage/v1/object/public/course-media/example/v1/image.png",
  SMOKE_MEDIA_LESSON_ID: "media",
  SMOKE_LESSON_ID: "quiz",
  SMOKE_CORRECT_OPTION: "Option one",
};
const coursePath = "/student/example/learn";
const media = config.NEXT_PUBLIC_SUPABASE_URL + config.SMOKE_MEDIA_PATH;
const pixel = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9uoAAAAASUVORK5CYII=",
  "base64",
);

async function fixtureBrowser({ saveSubmission }) {
  const browser = await chromium.launch();
  let submission = { submittedAt: "2026-01-01T00:00:00Z", scorePercent: 100 };
  let signedIn = false;
  return {
    close: () => browser.close(),
    async newContext(options) {
      const context = await browser.newContext(options);
      await context.route("**/*", async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        const html = (body) => route.fulfill({ contentType: "text/html", body });
        if (url.href === media) {
          return route.fulfill({ contentType: "image/png", body: pixel });
        }
        if (url.pathname === "/login" && request.method() === "GET") {
          return html(`<form><label>Email <input name="email"></label>
            <label>Password <input name="password" type="password"></label><button>Sign in</button></form>
            <script>
              const login = document.querySelector('form');
              login.onsubmit = async (event) => {
                event.preventDefault();
                const response = await fetch(location.href, {
                  method: 'POST', body: new URLSearchParams(new FormData(login)),
                });
                if (response.ok) location.assign(new URLSearchParams(location.search).get('next'));
              };
            </script>`);
        }
        if (url.pathname === "/login" && request.method() === "POST") {
          const data = new URLSearchParams(request.postData());
          signedIn = data.get("email") === config.SMOKE_EMAIL && data.get("password") === config.SMOKE_PASSWORD;
          return route.fulfill({ status: signedIn ? 200 : 401 });
        }
        if (!signedIn) return route.fulfill({ status: 401 });
        if (url.pathname === coursePath && url.searchParams.get("lesson") === "media") {
          return html(`<img src="${media}" alt="Staging fixture">`);
        }
        if (url.pathname === `${coursePath}/quiz`) {
          if (request.method() === "POST" && saveSubmission) {
            submission = { ...submission, submittedAt: "2026-01-02T00:00:00Z" };
          }
          return route.fulfill({ json: { id: "quiz", quizSubmission: submission } });
        }
        if (url.pathname === coursePath && url.searchParams.get("lesson") === "quiz") {
          return html(`<button id="retry">Try again</button>
            <div id="form" hidden>
              <label><input type="radio" name="q">Option one</label><button id="submit">Check answers</button>
            </div>
            <p role="status" id="score">Score: 1 / 1 (100%)</p>
            <script>
              retry.onclick = () => { form.hidden = false; score.textContent = ''; };
              submit.onclick = async () => {
                if (!document.querySelector('input').checked) return;
                await fetch('${coursePath}/quiz', { method: 'POST' });
                score.textContent = 'Score: 1 / 1 (100%)';
              };
            </script>`);
        }
        return route.fulfill({ status: 404 });
      });
      return context;
    },
  };
}

test("rejects non-staging execution and invalid Storage paths before starting the browser", async () => {
  const failIfLaunched = () => assert.fail("browser started");
  await assert.rejects(
    runStagingSmoke({ ...config, DEPLOY_ENV: "production" }, failIfLaunched),
    /requires the staging environment/,
  );
  await assert.rejects(
    runStagingSmoke({ ...config, SMOKE_MEDIA_PATH: "https://other.example.test/image.png" }, failIfLaunched),
    /must be a public object path/,
  );
});

test("signs in, renders the Storage asset, and persists a fresh quiz result", async () => {
  await runStagingSmoke(config, () => fixtureBrowser({ saveSubmission: true }));
});

test("rejects a successful score in the UI when the quiz result was never persisted", async () => {
  await assert.rejects(
    runStagingSmoke(config, () => fixtureBrowser({ saveSubmission: false })),
    /failed during quiz submission/,
  );
});
