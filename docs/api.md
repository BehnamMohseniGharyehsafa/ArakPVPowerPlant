# API and numerical export contract

Interactive OpenAPI documentation is available at `/docs`. All paths below are prefixed by `/api`.

| Method and path | Behaviour |
|---|---|
| `GET /health` | Service/model version |
| `GET /bootstrap` | Preset and saved scenario JSON, reference weather metadata, quality/provenance and uncertainty defaults |
| `POST /weather/upload` | Multipart `file`, EPW only, maximum 30 MiB; strict validation; returns checksum-derived weather ID |
| `PUT /scenarios/{id}` | Validated complete Scenario JSON; persists versioned configuration; body ID must match path |
| `POST /runs` | Validated Scenario JSON; queues annual simulation; returns `job_id` |
| `GET /jobs/{id}` | `queued`, `running`, `complete`, `failed` or `cancelled`, progress/message and result |
| `DELETE /jobs/{id}` | Requests cooperative cancellation; phase/sample boundaries are documented |
| `GET /runs/{id}` | Immutable-run summary, metadata, financial results and completed analyses |
| `GET /runs/{id}/series?start=0&end=8760` | Column-oriented complete numerical table; zero-based start inclusive/end exclusive |
| `GET /runs/{id}/equipment?hour=4116` | String/inverter snapshot and stable equipment identifiers |
| `POST /runs/{id}/analysis` | `kind`: diagnostics/cleaning/uncertainty; queues run-linked analysis |
| `GET /runs/{id}/export` | CSV/JSON/ZIP download, parameters below |
| `GET /runs/{id}/report` | Printable HTML technical report; missing analyses explicitly identified |
| `GET /runs/{id}/report.pdf` | Direct vector PDF report download from the same completed run |
| `GET /compare/export?run_ids=id1,id2` | ZIP of 1–20 completed-run hourly CSVs, metadata and summary comparison |

The job queue permits two concurrent workers and at most four active/queued jobs. The local service is not an authenticated enterprise API. Malformed configurations return 422; unknown runs/jobs return 404. Exceptions in long jobs appear as `failed` with an explanatory message. Camera and timeline operations do not submit annual runs.

## Analysis payloads

```json
{"kind":"cleaning","min_interval":14,"max_operations":12}
```

```json
{"kind":"uncertainty","samples":40,"ranges":{"resource":0.03,"soiling_rate":0.25,"price":0.1}}
```

Ranges are recognised relative uniform half-widths from 0 to 0.5. Sample count is 5–200; the scenario controls the seed. Cleaning supports PVWatts DC, whose linear irradiance dependence permits exact repeated-soiling evaluations through inverter/grid constraints. The optional nonlinear De Soto simulation rejects this optimisation explicitly instead of claiming the linear approximation is exact.

## Export parameters

`dataset`: `plant`, `weather`, `equipment`, `metadata`, `faults`, `maintenance`, `cleaning` or `zip`. For CSV, `start`/`end` filter reference-hour intervals. Plant `aggregation`: `hourly`, `daily`, `monthly`. Equipment `level`: `inverter`, `string`, `module`; optional zero-based `index` selects one device. Module export requires an index and labels power/energy as allocated from the string. Whole-run ZIP includes full plant hourly/daily/monthly, weather, all inverters, events, metadata, finance, completed analyses and report. Run selected analyses before downloading maintenance/cleaning results.

Daily/monthly exports sum `*_kwh` columns and average instantaneous/environmental columns. Cumulative energy is omitted from aggregated CSV rather than summed. Local and UTC timestamps label the start of the aggregation period.

## Hourly plant dictionary

| Field(s) | Meaning |
|---|---|
| `timestamp_local`, `timestamp_utc` | Offset-aware interval-start label, local standard time and UTC |
| `ghi_w_m2`, `dni_w_m2`, `dhi_w_m2` | Supplied EPW irradiance with scenario resource multiplier; original inputs remain in weather export |
| `ambient_temp_c`, `wind_speed_m_s` | Ambient temperature (plus explicit scenario offset) and wind |
| `solar_zenith_deg`, `solar_azimuth_deg`, `solar_elevation_deg`, `incidence_angle_deg` | Midpoint solar geometry, north-zero clockwise azimuth |
| `sunrise_local`, `sunset_local` | SPA daily sunrise/sunset in fixed local standard time; polar exceptions may be NaT |
| `extraterrestrial_dni_w_m2` | pvlib extraterrestrial direct-normal irradiance |
| `poa_unshaded_w_m2` | Hay-Davies front POA without mutual-row restriction |
| `poa_front_w_m2`, `poa_rear_w_m2` | Infinite-sheds incident front/rear POA; monofacial rear output is zero |
| `poa_direct_w_m2`, `poa_sky_diffuse_w_m2`, `poa_ground_diffuse_w_m2` | Unshaded front transposition components; inspection only, not added again |
| `effective_irradiance_w_m2` | Common bifacial-weighted irradiance after plant soiling; local fault derates are string power scenarios |
| `module_temp_c`, `cell_temp_c` | Common thermal estimates before local temperature faults; equipment snapshots expose local cell temperature |
| `soiling_fraction`, `shading_fraction` | Plant Kimber loss and front POA reduction fraction; equipment snapshots include equivalent local derates |
| `dc_power_kw` | Sum of string DC potential after string faults/wiring/operating-year degradation, before inverter availability |
| `ac_power_kw`, `ac_energy_kwh` | Delivered AC power and one-hour energy, numerically equal for this one-hour timestep |
| `observed_ac_kw` | Synthetic sensor demonstration; bias may differ from physical delivered energy |
| `reference_energy_kwh` | Unshaded front POA reference production at STC conversion |
| `temperature_loss_kwh`, `soiling_loss_kwh`, `shading_loss_kwh`, `fault_loss_kwh`, `dc_electrical_loss_kwh`, `degradation_loss_kwh` | Signed sequential DC-side reductions; see equations |
| `bifacial_gain_kwh` | Effective rear contribution at reference conversion in the sequential ledger |
| `dc_model_response_loss_kwh` | Difference from linear reference conversion to the selected electrical model at 25°C; separate from pure temperature effects |
| `inverter_loss_kwh` | DC minus converted/clipped AC, before availability |
| `clipping_loss_kwh` | Subset of inverter loss; never subtracted twice |
| `availability_loss_kwh`, `ac_electrical_loss_kwh`, `curtailment_loss_kwh` | Subsequent AC-side reductions |
| `accounting_residual_kwh` | Reference plus gain minus sequential losses minus delivered AC |
| `cumulative_ac_energy_kwh` | Cumulative delivered energy |
| `fault_status`, `data_quality_flags`, `scenario_id` | Active injected-event IDs, weather diagnostic flags and stable scenario ID |

IDs are `INV-01` onward, global strings `S-001` onward and modules `M-00001` onward. Module index // modules-per-string determines its string; string index // strings-per-inverter determines its inverter. Equipment AC allocation is proportional to DC contribution inside the inverter and sums to actual delivered AC.
