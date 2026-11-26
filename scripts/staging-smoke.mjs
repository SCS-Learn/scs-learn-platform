import { chromium } from "playwright";
import { pathToFileURL } from "node:url";

function required(env, key) {
  const value = env[key];
  if (!value?.trim()) throw new Error(`Missing ${key}`);
  return value;
}

function origin(env, key) {
  const value = required(env, key);
  try {
    const url = new URL(value);
    if (url.protocol === "https:" && url.origin === value) return value;
  } catch {
    // Keep configuration values out of release logs.
  }
  throw new Error(`Invalid HTTPS origin in ${key}`);
}

async function readSubmission(page, url, lessonId) {
  const lesson = await page.evaluate(async (endpoint) => {
    const response = await fetch(endpoint, { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error("Learner lesson endpoint failed");
    return response.json();
  }, url);
  if (lesson.id !== lessonId) throw new Error("Learner lesson endpoint returned the wrong lesson");
  return lesson.quizSubmission;
}

export async function runStagingSmoke(env = process.env, launch = () => chromium.launch()) {
  if (env.DEPLOY_ENV !== "staging") throw new Error("Smoke check requires the staging environment");
  const appOrigin = origin(env, "EXPECTED_APP_ORIGIN");
  const supabaseOrigin = origin(env, "NEXT_PUBLIC_SUPABASE_URL");
  if (appOrigin === supabaseOrigin) throw new Error("App and Storage origins must be distinct");
  const mediaPath = required(env, "SMOKE_MEDIA_PATH");
  if (
    !mediaPath.startsWith("/storage/v1/object/public/") ||
    !/^\/[\w./%-]+$/.test(mediaPath) ||
    new URL(mediaPath, supabaseOrigin).pathname !== mediaPath
  ) {
    throw new Error("Smoke media must be a public object path in staging Storage");
  }
  const media = new URL(mediaPath, supabaseOrigin);
  const courseCode = encodeURIComponent(required(env, "SMOKE_COURSE_CODE"));
  const lessonId = required(env, "SMOKE_LESSON_ID");
  const mediaLessonId = required(env, "SMOKE_MEDIA_LESSON_ID");
  const loginEmail = required(env, "SMOKE_EMAIL");
  const loginPassword = required(env, "SMOKE_PASSWORD");
  const correctOption = required(env, "SMOKE_CORRECT_OPTION");
  const coursePath = `/student/${courseCode}/learn`;
  const quizUrl = `${appOrigin}${coursePath}?lesson=${encodeURIComponent(lessonId)}`;
  const mediaRoute = `${coursePath}?lesson=${encodeURIComponent(mediaLessonId)}`;
  const mediaUrl = `${appOrigin}${mediaRoute}`;
  const quizEndpoint = `${appOrigin}${coursePath}/${encodeURIComponent(lessonId)}`;
  const loginUrl = new URL("/login", appOrigin);
  loginUrl.searchParams.set("next", mediaRoute);

  const browser = await launch();
  let phase = "password sign-in";
  try {
    const context = await browser.newContext({ serviceWorkers: "block" });
    context.setDefaultTimeout(30_000);
    await context.route("**/*", async (route) => {
      const request = route.request();
      const requestOrigin = new URL(request.url()).origin;
      if (requestOrigin === appOrigin || (request.url() === media.href && request.method() === "GET")) {
        await route.fallback();
      } else {
        await route.abort();
      }
    });
    const page = await context.newPage();
    const login = await page.goto(loginUrl.href);
    if (!login?.ok() || page.url() !== loginUrl.href) throw new Error("Unexpected login destination");
    await page.getByLabel("Email", { exact: true }).fill(loginEmail);
    await page.getByLabel("Password", { exact: true }).fill(loginPassword);
    const mediaResponse = page.waitForResponse(
      (response) => response.url() === media.href && response.ok() && response.request().resourceType() === "image",
    );
    await Promise.all([
      mediaResponse,
      page.waitForURL(mediaUrl),
      page.getByRole("button", { name: "Sign in", exact: true }).click(),
    ]);

    phase = "staging Storage image";
    await page.waitForFunction((url) => Array.from(document.images).some(
      (img) => img.currentSrc === url && img.complete && img.naturalWidth > 0,
    ), media.href);

    phase = "quiz submission";
    const before = await readSubmission(page, quizEndpoint, lessonId);
    const quizPage = await page.goto(quizUrl);
    if (!quizPage?.ok() || page.url() !== quizUrl) throw new Error("Unexpected quiz destination");
    if (before) await page.getByRole("button", { name: "Try again", exact: true }).click();
    await page.getByRole("radio", { name: correctOption, exact: true }).check();
    await page.getByRole("button", { name: "Check answers", exact: true }).click();
    await page.getByRole("status").filter({ hasText: /^Score:.*\(100%\)$/ }).waitFor();
    const after = await readSubmission(page, quizEndpoint, lessonId);
    if (!after?.submittedAt || after.submittedAt === before?.submittedAt || after.scorePercent !== 100) {
      throw new Error("A new successful submission could not be verified");
    }
  } catch {
    // Browser exceptions can include locators, URLs or user-supplied settings.
    throw new Error(`Staging smoke failed during ${phase}`);
  } finally {
    await browser.close();
  }
  console.log("Staging password sign-in, Storage image and persisted quiz submission passed.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runStagingSmoke().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
