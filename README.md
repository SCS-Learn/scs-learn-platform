This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

Install dependencies with `npm ci` using Node.js 22.13 or later. Copy
`.env.dev.example` to `.env.dev` and fill in the API URL, anon or publishable
key, and service-role or secret key from the same development database. For a
configured local Supabase CLI stack, `supabase start` starts it and
`supabase status` shows its API URL and keys. Keep the service-role key private.

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Personal development profile

Copy `.env.dev.example` to `.env.dev.personal`, fill in the Supabase values for
that environment, and set `NEXT_PUBLIC_SITE_URL=http://localhost:3001` if you use
port 3001. Arguments after the npm separator are passed to the development
launcher, which consumes `--env-file` and forwards the remaining flags to Next.js.

```bash
npm run dev -- --env-file .env.dev.personal --port 3001
```

Both profiles support loopback. Hosted targets require an exact HTTPS API origin
in the matching `shared` or `personal` list in `scripts/dev-targets.mjs`. Those
lists start empty, so use loopback until the team confirms a hosted development
origin. Use a separate worktree to run two Next.js development servers at once.

If you have `.env`, `.env.local`, `.env.development`, or `.env.development.local`
in the project root, move your development settings into the matching profile
and remove the fallback files before starting Next.js. The launcher reads app
settings only from your selected file, with literal values and no shell variable
expansion. Restart it after changing a profile. Both profile files are Git-ignored.

### Course inspection

The scratch script uses the same profile selection and target checks. It needs
the Supabase API URL and service-role key and reads the course by default.

```bash
node -- scratch-inspect-course.mjs --env-file .env.dev.personal 02-180
```

`--delete-from-position <n>` deletes units at or above the given position in the
selected development database. Run the read command first to verify the target
course and positions.

Run the development profile tests with `npm run test:dev`. See the [database
migration guide](supabase/README.md) for local schema setup and `npm run test:rls`.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deployment

Follow the [environment rollout checklist](docs/release-rollout.md) for shared dev,
staging, and production.
