import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'By Their Fruit — Church Reviews by the Congregation',
  description: 'Real reviews from real congregants. Honest, structured feedback to help churches grow and help families find home. Matthew 7:16.',
  openGraph: {
    title: 'By Their Fruit — You will recognize them by their fruit.',
    description: 'Real church reviews from the people who attend. Honest, structured feedback across 10 categories rooted in scripture. Find a church you can trust.',
    url: 'https://bytheirfruit.church',
    siteName: 'By Their Fruit',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'By Their Fruit — Church Reviews by the Congregation',
    description: 'Real church reviews from the people who attend. Honest, structured, and built to help churches grow. Matthew 7:16.',
  },
  keywords: ['church reviews', 'church ratings', 'find a church', 'church near me', 'honest church reviews', 'church community', 'by their fruit', 'congregation reviews'],
  robots: { index: true, follow: true },
  alternates: { canonical: 'https://bytheirfruit.church' },
  icons: {
    icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='8' fill='%2318181b'/><path d='M16 6C16 6 10 13 10 18C10 21.3 12.7 24 16 24C19.3 24 22 21.3 22 18C22 13 16 6 16 6Z' fill='%232563eb'/></svg>",
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600;700;800&family=Plus+Jakarta+Sans:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
        <script dangerouslySetInnerHTML={{ __html: `
          !function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init capture register register_once register_for_session unregister unregister_for_session getFeatureFlag getFeatureFlagPayload isFeatureEnabled reloadFeatureFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSessionId getSurveys getActiveMatchingSurveys renderSurvey canRenderSurvey getNextSurveyStep identify setPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException loadToolbar get_property getSessionProperty createPersonProfile opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing clear_opt_in_out_capturing debug getPageViewId".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);
          posthog.init('phc_VyPWij1bhIgGdYgDm0MIdseMiuxAvE9Y8mKHeuVpCgV', {
            api_host: 'https://us.i.posthog.com',
            person_profiles: 'identified_only',
            capture_pageview: true,
            capture_pageleave: true,
          });
        ` }} />
      </head>
      <body suppressHydrationWarning style={{ margin: 0, padding: 0 }}>
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{var d=window.matchMedia('(prefers-color-scheme:dark)').matches;document.documentElement.style.backgroundColor=d?'#0a0a0b':'#fafafa';document.body.style.backgroundColor=d?'#0a0a0b':'#fafafa'}catch(e){}})()` }} />
        {children}
      </body>
    </html>
  )
}
