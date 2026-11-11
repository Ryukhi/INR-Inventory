# INR Inventory Management — Decoupled Architecture (GitHub Pages + Google Apps Script REST API)

A bilingual (English / Thai) mobile-friendly inventory, procedure usage, consignment/exchange, loan/transfer, and capital asset management application for **Interventional Neuroradiology (INR)**.

This codebase uses a decoupled client-server architecture:
- **Frontend (GitHub Pages / Static Hosting):** `index.html`, `styles.css`, `app.js`, `manifest.json`
- **Backend (Google Apps Script REST API):** `Code.gs` (connected to Google Sheets & Google Drive)

---

## 1. Repository File Layout

Push the following static frontend files to the root of your GitHub repository:

```text
├── index.html       # Standalone HTML5 entry point (links styles.css, app.js, manifest.json)
├── styles.css       # Consolidated stylesheet (Noto Sans & Noto Sans Thai Light, responsive layout)
├── app.js           # Consolidated frontend logic + fetch() API client (callApi)
├── manifest.json    # Web App Manifest for iOS / Android "Add to Home Screen" (PWA)
└── README.md        # Architecture, deployment, and verification guide
```

*(Note: `Code.gs` lives in your Google Apps Script project bound to the Google Sheet, though you may also keep a copy in the repo for version control.)*

---

## 2. Phase 1: Deploying the Google Apps Script Backend (`Code.gs`)

1. Open your Google Sheet and navigate to **Extensions > Apps Script**.
2. Replace the entire contents of `Code.gs` in the Apps Script editor with your updated `Code.gs` file (you may remove legacy `index.html`, `styles.html`, `app1.html`, and `app2.html` from the Apps Script project if desired, as HTML is no longer served from Apps Script).
3. Click **Save** (💾).
4. Click **Deploy > New deployment** (or **Manage deployments > Edit ✏️ > Version: New version**).
5. Select type: **Web app**:
   - **Description:** `INR REST API v1`
   - **Execute as:** `Me` (Project Owner)
   - **Who has access:** `Anyone` *(Required so cross-origin `fetch()` requests from GitHub Pages succeed without OAuth redirect errors)*
6. Click **Deploy** and copy the generated **Web app URL** (ends in `/exec`).

---

## 3. Phase 2: Configuring the Frontend (`app.js`)

1. Open [`app.js`](./app.js) and check the top configuration section:
   ```javascript
   const DEFAULT_API_URL = 'https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec';
   let API_URL = (typeof localStorage !== 'undefined' && localStorage.getItem('inr_api_url')) || DEFAULT_API_URL;
   ```
2. Replace `DEFAULT_API_URL` with your Apps Script `/exec` URL if you create a new deployment ID.
   - *Tip:* You can also dynamically override the backend URL at runtime in the browser console via `setApiUrl('https://script.google.com/macros/s/.../exec')`.

### How CORS is Handled (`callApi`)
Google Apps Script Web Apps redirect `POST` requests to `script.googleusercontent.com` and do not respond to `OPTIONS` preflight requests. To avoid CORS preflight blocking, `callApi(action, payload)` in `app.js` sends:
- `method: 'POST'`
- `headers: { 'Content-Type': 'text/plain;charset=utf-8' }`
- `body: JSON.stringify({ action, payload })`
- `redirect: 'follow'`

---

## 4. Phase 3: Hosting on GitHub Pages

1. Create a new GitHub repository (or use an existing repository) and push `index.html`, `styles.css`, `app.js`, `manifest.json`, and `README.md` to the `main` branch.
2. In your GitHub repository, go to **Settings > Pages**.
3. Under **Build and deployment**:
   - **Source:** `Deploy from a branch`
   - **Branch:** `main` / `/ (root)`
4. Click **Save**.
5. After 1–2 minutes, your site will be live at:
   `https://<username>.github.io/<repository-name>/`

### Adding to iPhone / iPad Home Screen
1. Open `https://<username>.github.io/<repository-name>/` in **Safari** on iOS.
2. Tap the **Share** button (square with upward arrow) and select **Add to Home Screen**.
3. Because the site is served directly over HTTPS from GitHub Pages (without Google Apps Script's outer warning banner/iframe) and includes `manifest.json` + Apple Web App meta tags, it launches in full-screen standalone mode.

---

## 5. Phase 4: Verification & Smoke Test Checklist

1. **Initial Boot (`getAppData`):**
   - Open your GitHub Pages URL with Browser DevTools (**Network** tab) open.
   - Verify a `POST` request is sent to your Apps Script `/exec` URL with `{ "action": "getAppData", "payload": {} }` and returns HTTP `200` with `{ "success": true, "data": { ... } }`.
   - Confirm dashboard KPIs, inventory table, and sidebar load without triggering the offline fallback banner.
2. **Write Action (`submitProcedureUse` / `submitStockMovement`):**
   - Navigate to **Procedure Use** or **Inventory > Stock In / Out**, submit a test record, and verify the toast notification confirms success and the Google Sheet updates immediately.
3. **Bilingual Toggle (`TH` / `EN`):**
   - Confirm the app defaults to **English (`EN`)** on first load.
   - Click the compact `TH | EN` toggle in the bottom-left sidebar footer and verify all navigation labels, section headers, buttons, and table headers switch dynamically between `Noto Sans` and `Noto Sans Thai Light` (`font-weight: 300`).
4. **Mobile Responsiveness:**
   - Test at `<= 768px` viewport width (or on iPhone) to confirm unified headers, wrapping primary action buttons, `More Actions ▾` dropdown menus, and 2-column filter grids work cleanly with no horizontal page overflow.
