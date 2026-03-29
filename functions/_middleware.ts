// Password protection for staging/preview deployments only
// Production (bytheirfruit.church) is never affected

const STAGING_PASSWORD = "btf2026";

function isProtectedHost(hostname: string): boolean {
  // Only protect *.pages.dev preview URLs — never production
  return hostname.endsWith(".pages.dev");
}

function getLoginPage(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>By Their Fruit — Staging</title>
  <link href="https://fonts.googleapis.com/css2?family=Sora:wght@600;800&family=Plus+Jakarta+Sans:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #0a0a0b; font-family: 'Plus Jakarta Sans', sans-serif; color: #fafafa; }
    .card { background: #18181b; border: 1.5px solid #27272a; border-radius: 16px; padding: 40px 36px; max-width: 380px; width: 100%; text-align: center; }
    .badge { display: inline-block; background: #1e3a5f; color: #60a5fa; font-size: 11px; font-weight: 600; padding: 4px 12px; border-radius: 999px; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 20px; }
    h1 { font-family: 'Sora', sans-serif; font-size: 22px; font-weight: 800; margin-bottom: 8px; letter-spacing: -0.03em; }
    p { font-size: 13.5px; color: #a1a1aa; margin-bottom: 28px; line-height: 1.5; }
    input { width: 100%; padding: 11px 16px; border-radius: 8px; font-size: 14px; border: 1.5px solid #27272a; background: #0a0a0b; color: #fafafa; outline: none; font-family: inherit; margin-bottom: 12px; }
    input:focus { border-color: #2563eb; }
    button { width: 100%; padding: 11px; border-radius: 8px; font-size: 14px; font-weight: 600; background: #2563eb; color: #fff; border: none; cursor: pointer; font-family: inherit; transition: opacity 0.15s; }
    button:hover { opacity: 0.9; }
    .error { color: #ef4444; font-size: 13px; margin-bottom: 12px; display: none; }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">Staging Environment</div>
    <h1>By Their Fruit</h1>
    <p>This is the private testing site. Enter the password to continue.</p>
    <div class="error" id="err">Incorrect password. Try again.</div>
    <form method="POST">
      <input type="password" name="password" placeholder="Enter password" autofocus required />
      <button type="submit">Enter Staging Site</button>
    </form>
  </div>
</body>
</html>`;
}

export const onRequest: PagesFunction = async (context) => {
  const url = new URL(context.request.url);

  // Never protect production
  if (!isProtectedHost(url.hostname)) {
    return context.next();
  }

  // Check for auth cookie
  const cookie = context.request.headers.get("Cookie") || "";
  if (cookie.includes("btf_staging_auth=1")) {
    return context.next();
  }

  // Handle password submission
  if (context.request.method === "POST") {
    const formData = await context.request.formData();
    const password = formData.get("password")?.toString() || "";

    if (password === STAGING_PASSWORD) {
      // Set auth cookie (expires in 7 days)
      const response = new Response(null, {
        status: 302,
        headers: {
          Location: url.pathname + url.search + url.hash,
          "Set-Cookie": `btf_staging_auth=1; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${7 * 24 * 60 * 60}`,
        },
      });
      return response;
    }

    // Wrong password — show page with error visible
    const html = getLoginPage().replace('display: none', 'display: block');
    return new Response(html, {
      status: 401,
      headers: { "Content-Type": "text/html;charset=UTF-8" },
    });
  }

  // Show login page
  return new Response(getLoginPage(), {
    status: 401,
    headers: { "Content-Type": "text/html;charset=UTF-8" },
  });
};
