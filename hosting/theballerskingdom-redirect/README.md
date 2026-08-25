# theballerskingdom-redirect

Firebase Hosting site that 301-redirects **all** of `theballerskingdom.com`
to `https://ballkingdom.com/`.

Replaces GoDaddy Domain Forwarding (which ran on GoDaddy's AWS Global
Accelerator infrastructure at 3.33.251.168 / 15.197.225.128).

Deployed 2026-08-24. Live at https://theballerskingdom-redirect.web.app

Behaviour vs the GoDaddy forwarding it replaces:
- `/` → 301 https://ballkingdom.com/   (identical)
- any deeper path → 301 https://ballkingdom.com/  (GoDaddy returned 404)

Deploy with:

    cd hosting/theballerskingdom-redirect
    firebase deploy --only hosting --project the-ballers-kingdom

Post-cutover cleanup: fold this into the root `firebase.json` as a second
hosting target so all sites deploy from one config.
