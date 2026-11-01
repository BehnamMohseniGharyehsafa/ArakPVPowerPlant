# Explicit assumptions and reduced-order boundaries

The defaults are editable examples, not verified equipment or plant records. Exported `metadata.json` contains the exact configuration, model choices, weather checksum, software versions and run-specific caveats.

| Area | Default / boundary |
|---|---|
| Reference topology | 26 modules/string, 8 strings/inverter, 20 inverters; 4160 × 725 W = 3016 kWp DC; 2500 kW AC |
| Module dimensions | 1.303 × 2.384 m, illustrative; efficiency 23.34%; power coefficient −0.30%/°C; Vmp 42.17 V |
| Voltage/current compatibility | Voc, Voc/Vmp temperature coefficients and Isc unavailable by default; required checks remain unverified |
| Mounting | Fixed tilt 30°, azimuth 180°, row pitch 6.3 m, lower-edge clearance 0.8 m; flat terrain |
| Bifaciality | 0.70, albedo 0.25, rear structure loss 0.02; infinite-sheds model, no arbitrary gain percentage |
| Thermal | Faiman U0=25, U1=6.84; cell/module deltaT=3°C at 1000 W/m²; incident front+rear irradiance, uncalibrated wind-height effects |
| Electrical | DC wiring 1.5%, inverter nominal efficiency 98%, AC wiring 1%; expected availability 99.5% |
| Soiling | Initial loss 1%, accumulation 0.07 percentage points/day, fixed 60-day cleaning; Kimber cap 30%; rainfall cleaning assumed absent by default because EPW rain is incomplete |
| Degradation | 0.5%/year illustrative; operating year zero initially; not estimated from TMY |
| Economics | USD label, 0.06/kWh example value, capex 1.8 million, opex 30,000/year, cleaning total 450/operation, 12 m³ water/clean; no tariff/exchange-rate claim |
| Lifetime | 25 years, 8% discount, 2% cost escalation, 1% electricity-value escalation, inverter replacement in year 13 |
| Diagnostics | Synthetic power and optional plant sensor bias, no measured noise or SCADA import; thresholds are demonstration rules, not calibrated probabilities |
| Maintenance | Individual event-removal counterfactuals and binary economic selection; safety flags mandatory; overlapping benefits not jointly valued |
| Uncertainty | Independent bounded uniform relative factors and physical reruns; no inferred covariance or weather-year variability |

Identical configurations are identified by the scenario, weather SHA-256, model version and pvlib version. Created-at timestamps identify execution time and are not part of numerical determinism. Browser-only view state does not change physics. Normal module values are allocated from a string. Explicit local fault scenarios act at string or inverter resolution; individual module mismatch, bypass diodes and hot spots are not solved.

Not supplied: measured-data ingestion/SCADA, field-calibrated diagnosis, operational forecasting, variable temporal resolution, terrain/obstacle modelling, equipment protection design, bankable yield assessment, authentication or a shared multi-user service. PDF reports use ReportLab; a printable HTML version is also provided. Cleaning optimisation explicitly requires PVWatts DC and rejects the optional nonlinear De Soto path rather than claiming a linear approximation is exact. The local engine caps runs at 400 strings and 30,000 modules. These boundaries are intentional and visible; none is advertised as complete operational capability.
