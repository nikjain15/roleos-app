# Setup — Google sign-in + Gmail/Calendar (Gate 2 + Flag C)

Gate 2 (screening answers + recruiter replies) reads your **Gmail + Calendar**
with permission (Flag C: real OAuth in v1). This also enables "Continue with
Google" sign-in. ~15 minutes of setup in two consoles.

## 1 · Google Cloud — create an OAuth client

1. Go to **https://console.cloud.google.com/** → create a project (e.g. "RoleOS").
2. **APIs & Services → Enabled APIs → + Enable APIs**: enable **Gmail API** and
   **Google Calendar API**.
3. **APIs & Services → OAuth consent screen**:
   - User type: **External**. Fill app name, your email, dev contact.
   - **Scopes → Add**: `.../auth/userinfo.email`, `.../auth/userinfo.profile`,
     `openid`, **`.../auth/gmail.readonly`**, **`.../auth/calendar.readonly`**.
   - **Test users → Add**: add **your own email**. (Sensitive scopes work for
     test users immediately; non-test users need Google verification — see §3.)
4. **APIs & Services → Credentials → + Create Credentials → OAuth client ID**:
   - Type: **Web application**.
   - **Authorized redirect URI** (exactly):
     `https://qaubhkrgcdllnqvtrccr.supabase.co/auth/v1/callback`
   - Create → copy the **Client ID** and **Client secret**.

## 2 · Supabase — enable the Google provider

1. Supabase dashboard → **Authentication → Sign In / Providers → Google** → enable.
2. Paste the **Client ID** + **Client secret** from step 1.4.
3. Under **Additional scopes**, add: `https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/calendar.readonly`
4. Save. (The redirect URLs / site URL are already configured for localhost.)

Hand me the Client ID + secret (or just say it's done) and "Continue with
Google" works immediately for you + any added test users. I'll then wire Gate 2
to read recruiter mail + calendar via the Google provider token.

## 3 · Google verification (only for non-test users — later)

The Gmail/Calendar scopes are **sensitive**, so before *other* people can grant
them, Google requires **app verification** (privacy policy URL, a recorded demo,
sometimes a security assessment). It can take days–weeks. **Not on the critical
path** — you and added test users work without it. Kick it off from the OAuth
consent screen ("Publish app" → "Prepare for verification") whenever you want to
open it beyond test users.
