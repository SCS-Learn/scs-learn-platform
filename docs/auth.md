# Sign-in (Supabase Auth)

Everyday login is **email + password** - nothing is emailed, so it is fast and
never hits Supabase's email rate limits. Email is only sent for one-time
things:

| Email | When | Lands on |
|---|---|---|
| Confirm signup | creating an account | `/auth/confirm` → where they were going |
| Reset password | "Forgot password?" (also how link-only accounts get a password) | `/auth/confirm` → `/account/password` |
| Magic link | "Email me a sign-in link instead" | `/auth/confirm` → where they were going |

Signed-in users can set or change their password on `/account`.

Instructor access is granted by email (`instructors.email`), but only a
**confirmed** address can claim an instructor row - see
`lib/instructor/data/current-instructor.ts`.

`npm run dev` skips email entirely: new accounts are auto-confirmed and the
link fallback signs in instantly (Supabase's built-in mailer only reaches the
project's own team).

## Supabase dashboard settings

**Authentication → Sign In / Providers → Email**
- Enable Email provider: **on**
- Confirm email: **on** (required - instructor access trusts confirmed emails)
- Minimum password length: 8 (matches the app)

**Authentication → URL Configuration**
- Site URL: the deployed origin, e.g. `https://your-app.vercel.app`
- Redirect URLs: `https://your-app.vercel.app/**` and `http://localhost:3000/**`

**Authentication → Emails → Templates** - point every link at `/auth/confirm`
with a `token_hash`. These links are verified server-side, so they work in any
browser or device (the default `{{ .ConfirmationURL }}` links use PKCE and only
work in the browser that requested them).

Confirm signup:
```html
<h2>Confirm your SCS Learn account</h2>
<p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/dashboard">Confirm my email</a></p>
```

Reset password:
```html
<h2>Reset your SCS Learn password</h2>
<p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery">Choose a new password</a></p>
```

Magic link:
```html
<h2>Sign in to SCS Learn</h2>
<p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/dashboard">Sign in</a></p>
```

(`{{ .SiteURL }}` must be the deployed origin - set it in URL Configuration.)

For real students (not just the Supabase team) to receive any of these, set up
custom SMTP (Authentication → Emails → SMTP Settings) and then raise
Authentication → Rate Limits → "Rate limit for sending emails".
