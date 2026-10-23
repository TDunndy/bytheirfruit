import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Page not found — By Their Fruit',
  robots: { index: false, follow: true },
}

// Static 404 (exported as out/404.html and served by Cloudflare Pages for
// unknown paths). No React on this page: a link home, a search form that lands
// on Discover ("/?q=...#/discover", read by the app's hash router) and a tiny
// inline script that applies the theme saved by the app (btf-theme).
export default function NotFound() {
  return (
    <>
      <style>{`
        :root { --bg:#fafafa; --surface:#fff; --border:#e4e4e7; --text:#18181b; --soft:#52525b; --accent:#2563eb; }
        @media (prefers-color-scheme: dark) {
          :root:not([data-theme="light"]) { --bg:#0a0a0b; --surface:#18181b; --border:#2e2e33; --text:#fafafa; --soft:#e4e4ea; }
        }
        :root[data-theme="dark"] { --bg:#0a0a0b; --surface:#18181b; --border:#2e2e33; --text:#fafafa; --soft:#e4e4ea; }
        .nf { min-height:100vh; display:flex; align-items:center; justify-content:center; background:var(--bg); color:var(--text); font-family:'Plus Jakarta Sans',system-ui,sans-serif; padding:24px; }
        .nf-card { max-width:440px; width:100%; text-align:center; }
        .nf h1 { font-family:'Sora',system-ui,sans-serif; font-size:28px; font-weight:800; letter-spacing:-0.03em; margin:16px 0 8px; }
        .nf p { color:var(--soft); font-size:15px; line-height:1.6; margin:0 0 24px; }
        .nf form { display:flex; gap:8px; margin-bottom:16px; }
        .nf input { flex:1; padding:12px 14px; border-radius:10px; border:1.5px solid var(--border); background:var(--surface); color:var(--text); font-size:15px; }
        .nf button, .nf a.btn { padding:12px 18px; border-radius:9999px; border:none; background:var(--accent); color:#fff; font-weight:700; font-size:14px; cursor:pointer; text-decoration:none; display:inline-block; }
        .nf a.home { color:var(--accent); font-weight:600; font-size:14px; text-decoration:none; }
      `}</style>
      <script dangerouslySetInnerHTML={{ __html: "try{var m=localStorage.getItem('btf-theme');if(m==='dark'||m==='light')document.documentElement.setAttribute('data-theme',m)}catch(e){}" }} />
      <main className="nf">
        <div className="nf-card">
          <svg width="56" height="56" viewBox="0 0 32 32" aria-hidden="true">
            <rect width="32" height="32" rx="8" fill="#18181b" />
            <path d="M16 6C16 6 10 13 10 18C10 21.3 12.7 24 16 24C19.3 24 22 21.3 22 18C22 13 16 6 16 6Z" fill="#2563eb" />
          </svg>
          <h1>We couldn&apos;t find that page</h1>
          <p>The link may be old, or the church may have been removed. Try searching for it instead.</p>
          <form action="/#/discover" method="get">
            <input type="search" name="q" placeholder="Church name, city, or zip" aria-label="Search churches" />
            <button type="submit">Search</button>
          </form>
          <a className="home" href="/">← Back to By Their Fruit</a>
        </div>
      </main>
    </>
  )
}
