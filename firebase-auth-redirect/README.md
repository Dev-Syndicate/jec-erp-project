# firebase-auth-redirect

**This is NOT the ERP app.** The app is Next.js, deployed to Vercel from the repo root.
This folder is a near-empty Firebase Hosting site whose only job is to own the domain that
Firebase Auth puts in its emails.

## Why it exists

Firebase Auth's password-reset emails linked to `jec-erp-auth-464c5.firebaseapp.com` — an
unfamiliar domain, reached from a password email, which is the shape of a phishing link (and
one reason Gmail filed these as spam).

The usual fix is Auth → Templates → **Customise action URL**. That is **blocked on this
project**: the API returns `400 EMAIL_TEMPLATE_UPDATE_NOT_ALLOWED`, a project-level
restriction no amount of domain-authorising changes.

The way around it is `authDomain`. The Firebase client SDK builds its links from that value,
so pointing it at a domain we own puts our name in the email without touching the blocked
notification config.

## How it works

```
email link  →  auth.erp.csejeppiaar.in/__/auth/action   ← this site, Firebase's own form
            →  erp.csejeppiaar.in/…                      ← continueUrl returns them to the app
```

Deploying this site is what makes Firebase serve its auth handler on our domain. There is
almost nothing in it: Hosting supplies the handler, we supply the domain.

⚠️ **A redirect on `/__/auth/action` does NOT work — don't add one back.** `/__/` is a
reserved namespace; Hosting serves its own handler there and that beats any `redirects` entry
in `firebase.json`. Tried and verified: the path returns `200` with `fireauth.oob.OobHandler`,
never a `302`. Serving that handler is the entire point of this site, so this is the intended
behaviour — it just means the reset form the user sees is **Firebase's, not our own
[/reset](../src/app/reset/page.tsx) page**. That page still exists and still works when reached
directly; it is simply not what the emailed link opens.

`public/index.html` is a placeholder for a bare visit to the domain; it bounces to the app.

## Deploying

```bash
cd firebase-auth-redirect
firebase deploy --only hosting
```

`--only hosting`, plus a `public/` holding nothing but the placeholder, is what keeps this
from touching the Vercel deployment. **Never point `public` at the Next.js build output** —
that would publish the whole app to Firebase, which is not what this site is for.

## The env var that activates it

`NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` must be `auth.erp.csejeppiaar.in` (was
`jec-erp-auth-464c5.firebaseapp.com`). For the live site that means the **Vercel dashboard** —
editing `.env.production.local` does not change production.

⚠️ `authDomain` is used by the whole client SDK, not just password reset. If this domain or
the redirect breaks, **sign-in breaks too**. Set it on a Vercel *Preview* deployment first,
confirm both sign-in and reset, then promote to Production.

## What this does NOT fix

The sender is still `noreply@jec-erp-auth-464c5.firebaseapp.com`, which has no DKIM/SPF
alignment to our domain, so spam filing remains a risk. Only sending the mail ourselves fixes
that — `generatePasswordResetLink` (Admin SDK) behind our own provider.
