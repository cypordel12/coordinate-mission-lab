# COORDINATE — Mission Lab Website

A responsive, static research-prototype website for the COORDINATE MIS graduation project.

## Included
- Responsive landing page and project overview
- Interactive conceptual 3D-style airspace canvas with two UAV agents
- Scenario inputs for altitude, cruise speed, mission payload, wind intensity and direction
- Visual-only route preview animation
- Static / heuristic / proposed-method overview cards
- Modular architecture and project-scope sections

## Important model boundary
This website is currently a **front-end prototype**. The visual preview animates conceptual agent paths; it does not run the mathematical optimization, calculate an optimal rendezvous, validate flight safety, or connect to live telemetry. The decision engine is deliberately marked as pending integration while the research team prepares the mathematical model. All displayed agent defaults are illustrative UI inputs, not measured field data.

## Run locally
No build tools or package installation are required.

1. Extract the folder.
2. Open `index.html` in a modern browser.

For a local web server, from this folder run:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000`.

## Publish with GitHub Pages
1. Create a GitHub repository, for example `coordinate-mission-lab`.
2. Upload `index.html`, `styles.css`, `app.js`, `favicon.svg`, and this README to the repository root.
3. For GitHub Free, use a **public repository** for GitHub Pages. Remember that a published Pages site is publicly accessible; do not upload private data.
4. Open **Settings → Pages**.
5. Under **Build and deployment**, choose **Deploy from a branch**.
6. Select branch `main` and folder `/ (root)`, then Save.
7. Wait for GitHub Pages to publish and open the URL shown in the Pages settings.

No GitHub Actions workflow or compilation step is required for this static site.

## Next integration point
When the mathematical model is ready, connect it behind a clearly defined API. Replace the visual-only `startPreview()` flow in `app.js` with a request to the model service, and render only returned, validated outputs. Keep the UI label explicit about simulated, estimated, and measured data.
