# Numerical verification and validation limits

Checks were exercised on 1 November 2026 with Python 3.13, pvlib 0.16.1, NumPy 2.3.3, Pandas 2.3.3, SciPy 1.16.1 and Node.js 24.22.1 on Windows. The tested dependency closure is `requirements.lock`; frontend resolution is `frontend/package-lock.json`.

## Reproducible reference case

Configuration: `examples/reference_configuration.json`, default 4160-module bifacial system, no injected faults, fixed 60-day cleaning, explicitly assumed no natural rain cleaning.

| Verification quantity | Computed reference |
|---|---:|
| Hourly records | 8760 |
| Calendar | 1 January-31 December 2001, fixed UTC+03:30 |
| Station location | 34.0716° N, 49.7837° E, 1703 m |
| Installed DC / AC | 3016 kWp / 2500 kW |
| Annual delivered energy | 6,431,992.3793 kWh |
| Specific yield | 2,132.6235 kWh/kWp |
| Front-reference PR | 0.92785277 |
| AC capacity factor | 0.29369828 |
| Annual GHI | 2,054.895 kWh/m² |
| Front POA | 2,298.4503 kWh/m² |
| Rear POA | 281.5154 kWh/m² |
| Maximum hourly loss-accounting residual | 4.55 × 10^-13 kWh |

Original archive SHA-256: `24e42479c586e84457eaf7f4f93c856c4fa8c3df4b3799c2311ee9077df7bc1c`.

Original EPW SHA-256: `84b30636e8fb5e8257a52b772a29bfe5e40a128a6e653798efc11ba5322421f8`.

The upstream full-period TMYx archive may change. A different checksum is a different meteorological input; do not claim identical reference results in that case. Preserve the original locally downloaded archive and provenance. Tests use actual meteorology, rather than a fabricated sinusoidal solar resource.

## Automated checks

Seventeen backend tests cover:

* Calendar/topology/nameplate consistency and explicitly unverified electrical constraints.
* Night-time zero generation, nonnegative delivered power, inverter limits, string/inverter aggregation, daily/annual integration and hourly accounting closure.
* Independent analytic PVWatts STC and temperature benchmarks, plus inverter shutdown/clipping limits.
* Inverter outage, string disconnection, increased ambient temperature, export restriction, soiling, albedo and sensor bias responses.
* Cleaning resets, equipment allocation, cached versus explicitly supplied weather equivalence, timed local temperature faults and recovery.
* Rejection of invalid topology, incomplete single-diode inputs, invalid targets and unsafe ZIP traversal.
* An executable optional single-diode case using complete parameters from pvlib's bundled CEC database.
* Hand-calculated NPV reconciliation, 8760-row CSV totals, equipment CSV aggregation and report labelling.
* PDF parsing, page count, run ID, energy total and explicit missing-analysis disclosures.
* Constrained cleaning decisions, operation spacing/count, nonnegative optimal net benefit and exact PVWatts soiling-to-AC evaluation.
* Reproducible seeded Monte Carlo/P90 ordering and API success/error/export/report behaviour.
* Signed public browser sessions, separate scenario/run/job ownership, cross-origin mutation rejection and browser security headers.

The updated locks pass npm audit and pip-audit with zero known vulnerabilities on 1 November 2026. This is a point-in-time dependency check, not proof that the application is invulnerable.

Three frontend component tests cover numeric assumption editing, calendar/hour controls without annual reruns and geometry/electrical topology consistency. Three Playwright acceptance tests use the actual backend for camera presets, inverter/string/module selection, heatmap changes, timestep selection, fault injection, diagnostics, cleaning optimisation, CSV download, page navigation and responsive layouts. A dedicated WebGL raycasting test locates a real rendered module, clicks it and verifies its allocated-output inspector. Screenshots and an animated field demonstration are captured from the functioning application. Browser tests also fail on uncaught page errors.

The loss ledger uses a tolerance of 10^-8 kWh hourly. Equipment aggregation tests use numerical tolerances of 10^-9 kW where appropriate; annual exported energy agrees within CSV precision. The analytic PVWatts check at 500 W/m² and 45°C is 340.75 W for a 725 W module with gamma=-0.003/°C.

Run the checks from the README. API tests require local event-loop socket access on Windows; the execution sandbox may block the socketpair used by asyncio even though tests do not contact an external service. The development suite passed when loopback access was available.

## PDF and deployment checks

The direct PDF report was generated from the reference Run with completed diagnostics, cleaning and a 20-sample uncertainty demonstration. All pages were rendered with Poppler and visually inspected for clipping, tables, chart labels, references and page breaks. Docker Compose configuration is validated by `docker compose config --quiet`. The local Docker daemon is unavailable; Render builds the production image remotely. [GitHub Actions](https://github.com/BehnamMohseniGharyehsafa/ArakPVPowerPlant/actions) runs the numerical and browser suites on Linux and now builds and starts the actual Docker image, requests its homepage and verifies the external report-print asset. The container startup explicitly imports the source checkout so that its sibling frontend files are served.

## What these checks do not establish

Integration with pvlib and agreement with its functions are not independent physical model validation. No measured plant dataset, site-calibrated thermal/soiling inputs, field fault-labelled dataset or independent bankable yield benchmark was supplied. Detection probabilities, forecast reliability, plant protection compliance and interannual P90 coverage are therefore not claimed. The maintenance solver uses individual interacting counterfactual values; its selected repair set is a decision-support approximation, not a proof of globally optimal joint physical repair value.
