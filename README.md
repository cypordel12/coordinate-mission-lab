# COORDINATE — UAV–UGV Battery-Swap Mission Lab

A responsive, static research-prototype website for the revised COORDINATE graduation project scope.

## Revised project scope represented in this build

- One agricultural unmanned ground vehicle (UGV) and one agricultural unmanned aerial vehicle (UAV).
- A simplified 2.5D field: a metric 2D ground plane (`z = 0`) and a fixed UAV cruise layer (`z = 30 m`).
- One stationary battery-swap rendezvous per scenario. The UGV carries one compatible, fully charged spare battery; the UAV lands at the approved service bay before the swap.
- Approved service bays (M1–M3 in the report worked example), UGV/UAV-specific restricted areas, safety clearance, simplified constant wind, a time window, and battery reserve.
- Human-in-the-loop decision support: the manager reviews alternatives and remains responsible for approval, rejection, or manual override.

## Implemented in the frontend

- Updated overview and project-boundary descriptions aligned with the November 2026 revised report.
- 2.5D field visualization showing one UGV on the ground layer and one UAV at the fixed 30 m aerial layer.
- Editable scenario controls for vehicle positions, ground speed, nominal UAV speed, battery level/reserve, spare-battery availability, constant wind, safety clearance, time window, and swap duration.
- Selectable service bays M1, M2, and M3.
- Human-in-the-loop approve, reject, and override actions with a current-session decision log.
- Visual-only approach, landing, and battery-swap preview animation.
- A clearly labeled reference-results panel using the report's Section 3.7 worked example.
- Strategy definitions for Static, Dynamic Heuristic, and Proposed DSS methods.
- System architecture reflecting the frontend, FastAPI validation layer, and Python simulation/decision engine.

## Important model and result boundary

This is a **static frontend prototype**. It does not execute the Python A* route planners, continuous UAV speed search, normalized quadratic objective, or final feasibility engine. The values shown for M1, M2, and M3 are transcribed from the revised report's worked numerical example (Section 3.7); they are not recalculated when the user edits the controls. The interface explicitly warns when custom inputs differ from the report reference case.

The visual preview is illustrative. The approve/reject/override controls create an in-memory session record only; they are not persisted to a server or database in this frontend-only build. It does not control real vehicles, connect to live GPS or sensors, physically exchange a battery, or certify flight safety. The revised scope excludes multiple vehicles, full 3D flight dynamics, autonomous robotic battery handling, hardware integration, and field trials.

## Reference scenario values represented

- Field: 2.0 × 2.0 km; 100 × 100 grid.
- UGV start: (0.20, 1.60) km; planned endpoint: (1.80, 1.60) km; nominal ground speed: 4.0 km/h.
- UAV start: (1.60, 0.20) km; fixed cruise altitude: 30 m; nominal airspeed: 15.0 km/h; allowed airspeed range: 8.0–20.0 km/h.
- Battery: 70% initial; 20% minimum reserve; one spare battery available.
- Wind: 4.0 km/h toward East (0°); safety clearance: 0.04 km (40 m).
- Stationary battery swap: 10 minutes; time window: 30 minutes.
- Candidate M1: recommended at 20.00 km/h, total mission time 0.276 h, UGV waiting 3.5 min, fuel proxy 0.117 L*, UAV battery use 42.23%, score J = 0.399.
- Candidate M2: feasible alternative at 13.54 km/h, total mission time 0.317 h, no waiting, fuel proxy 0.210 L*, UAV battery use 47.80%, score J = 0.529.
- Candidate M3: infeasible in the report's worked example because it exceeds the configured time window.

`L*` is the report's synthetic fuel proxy, not calibrated diesel consumption.

## Run locally

No build tools or package installation are required.

1. Extract the website folder.
2. Open `index.html` in a modern browser.

For a local server, from this folder run:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000`.

## Publish with GitHub Pages

1. Upload the contents of this folder (`index.html`, `styles.css`, `app.js`, `favicon.svg`, and `README.md`) to the root of the existing repository.
2. Commit the changes to the `main` branch.
3. Keep GitHub Pages configured as **Deploy from a branch → main → /(root)**.
4. Wait for the Pages deployment and refresh the published site.

## Next integration point

Connect the frontend to the validated FastAPI service when the Python team has a stable request/response contract. The API should return feasibility status, ranked candidate options, optimized UAV speed, per-resource waiting, routes, objective components, method KPIs, and an auditable run record. Replace the reference worked-example data only with validated backend responses.
