# By Their Fruit â€” Deployment Guide

## Your Setup
- **Domain:** bytheirfruit.church (Cloudflare)
- **Database:** Supabase (ffqmbhftivmiubvtzhhr)
- **GitHub:** TDunndy/bytheirfruit
- **Hosting:** Cloudflare Pages

---

## Step 1: Set Up the Database

1. Go to your Supabase dashboard: https://supabase.com/dashboard
2. Click on your `bytheirfruit` project
3. In the left sidebar, click **SQL Editor**
4. Click **New query**
5. Open the file `supabase/schema.sql` from this project
6. Copy ALL the contents and paste into the SQL editor
7. Click **Run** (or Ctrl+Enter)
8. You should see "Success. No rows returned" â€” that means it worked

### Set up Google Auth (do this first â€” it's the most common login):
1. In Supabase sidebar â†’ **Authentication** â†’ **Providers**
2. Click **Google**
3. Toggle it ON
4. You'll need a Google OAuth Client ID â€” follow Supabase's guide:
   https://supabase.com/docs/guides/auth/social-login/auth-google
5. Set the redirect URL to: `https://ffqmbhftivmiubvtzhhr.supabase.co/auth/v1/callback`

### Enable Email auth:
1. Authentication â†’ Providers â†’ Email should already be ON
2. That's it â€” email/password works out of the box

---

## Step 2: Push Code to GitHub

Open a terminal on your computer and run these commands one at a time:

```bash
# Clone your empty repo
git clone https://github.com/TDunndy/bytheirfruit.git
cd bytheirfruit
```

Then copy ALL the project files into this folder (everything from the download).

Then run:

```bash
git add .
git commit -m "Initial deploy - By Their Fruit"
git push origin main
```

---

## Step 3: Connect Cloudflare Pages

1. Go to your Cloudflare dashboard: https://dash.cloudflare.com
2. Click **Workers & Pages** in the left sidebar
3. Click **Create**
4. Click **Pages** tab â†’ **Connect to Git**
5. Select your GitHub account and the `bytheirfruit` repository
6. Configure the build:
   - **Framework preset:** Next.js (Static HTML Export)
   - **Build command:** `npm run build`
   - **Build output directory:** `out`
7. Add environment variables (click "Add variable"):
   - `NEXT_PUBLIC_SUPABASE_URL` = `https://ffqmbhftivmiubvtzhhr.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = your anon key (the eyJ... one)
8. Click **Save and Deploy**
9. Wait 2-3 minutes for the build

---

## Step 4: Connect Your Domain

1. After deploy, go to your Pages project in Cloudflare
2. Click **Custom domains** tab
3. Click **Set up a custom domain**
4. Enter: `bytheirfruit.church`
5. Cloudflare will auto-configure the DNS since you already own the domain there
6. Wait a few minutes for SSL to activate

---

## Done!

Your site should now be live at https://bytheirfruit.church

- Main app: https://bytheirfruit.church
- Admin dashboard: https://bytheirfruit.church/admin

---

## Future Updates

Every time you push code to GitHub, Cloudflare auto-deploys:

```bash
# Make changes, then:
git add .
git commit -m "describe what you changed"
git push origin main
```

Cloudflare will rebuild and deploy within 2-3 minutes.

---

## File Structure

```
bytheirfruit/
â”œâ”€â”€ src/
â”‚   â”œâ”€â”€ app/
â”‚   â”‚   â”œâ”€â”€ layout.tsx          # HTML shell, meta tags, fonts
â”‚   â”‚   â”œâ”€â”€ page.tsx            # Main app entry
â”‚   â”‚   â””â”€â”€ admin/
â”‚   â”‚       â””â”€â”€ page.tsx        # Admin dashboard entry
â”‚   â”œâ”€â”€ components/
â”‚   â”‚   â”œâ”€â”€ ByTheirFruit.tsx    # Main app (public-facing)
â”‚   â”‚   â””â”€â”€ AdminDashboard.tsx  # Admin panel
â”‚   â””â”€â”€ lib/
â”‚       â””â”€â”€ supabase.ts         # Supabase client
â”œâ”€â”€ supabase/
â”‚   â””â”€â”€ schema.sql              # Database schema (run in SQL Editor)
â”œâ”€â”€ public/                     # Static files (favicon, images)
â”œâ”€â”€ .env.local                  # Environment variables (local dev)
â”œâ”€â”€ next.config.js              # Next.js config (static export)
â”œâ”€â”€ package.json                # Dependencies
â””â”€â”€ tsconfig.json               # TypeScript config
```
