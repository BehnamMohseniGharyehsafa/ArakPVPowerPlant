# Equations, units and calculation boundaries

The authoritative numerical implementations are the pvlib functions cited in `references.md`; the expressions here explain the selected models, rather than reimplementing them in the frontend.

| Quantity | Definition | Units / assumptions |
|---|---|---|
| Module count | modules/string × strings/inverter × inverter count | Integer, dimensionless |
| DC nameplate | module count × rated module W / 1000 | kWp |
| GCR | module slope length / row pitch | Dimensionless; horizontal overlap prohibited |
| Array centre height | clearance + slope length × sin(tilt) / 2 | m |
| PVWatts v5 DC | Pstc × Geff/1000 × [1 + gamma × (Tcell−25)] | W (or kW when Pstc is kW); gamma in °C⁻¹ |
| Faiman module temperature | Tambient + Gincident/(U0+U1×wind) | °C; U0 W/m²K; U1 W·s/m³K; wind m/s |
| SAPM cell correction | Tcell = Tmodule + deltaT × Gincident/1000 | °C; configurable deltaT at 1000 W/m² |
| Operating-year DC factor | (1−annual degradation)^operating year | Dimensionless illustrative ageing |
| Hourly energy | average delivered AC kW × 1 h | kWh |
| Final yield Yf | delivered AC energy / installed DC nameplate | kWh/kWp = h |
| Reference yield Yr | integrated shaded front POA / 1 kW/m² | h |
| Front-reference PR | Yf / Yr | Dimensionless; bifacial gain included in numerator |
| AC capacity factor | delivered annual kWh / (AC nameplate kW × 8760 h) | Dimensionless |
| Cleaning net benefit | sum(additional delivered kWh × hourly price) − operation costs | Selected currency |
| Repair net value | future counterfactual delivered kWh after response delay × hourly price − repair cost | Individual benefits interact |
| NPV | sum from y=0 to N of cashflow_y/(1+r)^y | Time-zero capex negative; year-end operating cash |
| LCOE | discounted capex/opex/cleaning/repair/replacement / discounted delivered energy | Currency/kWh, same discount rate for costs/energy |
| Residual | (observed AC − healthy expected AC) / healthy expected AC | Daylight threshold; sensor bias can change observation without physical energy |
| Parameter-model P90 | empirical quantile at probability 0.10 | Expected to be exceeded in 90% of the assumed parameter distribution |

PVWatts inverter conversion uses zeta = Pdc/(Pac,rated/eta_nominal), eta = eta_nominal/0.9637 × (−0.0162×zeta − 0.0059/zeta + 0.9858), followed by zero shutdown and rated-AC clipping. The library implementation supplies the actual result. Unclipped conversion is evaluated only to identify clipping as a subset of total inverter losses. Zero-DC hours are handled explicitly.

## Sequential loss ledger

Let R be unshaded front POA × installed nameplate / 1000. Let F be shaded front-only reference DC, B the bifacial effective reference DC, M the selected DC model at 25°C, T temperature-adjusted DC, S soiled DC, Q fault-adjusted DC, W DC after wiring, D operating-year degraded DC, I inverter-converted AC, A available AC, E AC after wiring and G delivered AC after export caps.

* Shading loss = R−F.
* Bifacial gain = B−F.
* DC model response loss = B−M (captures nonlinear irradiance response in De Soto; numerically zero for linear PVWatts).
* Temperature loss = M−T (signed; cold operation may produce a gain).
* Soiling loss = T−S.
* Injected DC fault loss = S−Q.
* DC electrical loss = Q−W.
* Operating-year degradation loss = W−D.
* Inverter loss = D−I (includes conversion and clipping).
* Availability loss = I−A (includes explicit inverter outages).
* AC electrical loss = A−E.
* Curtailment loss = E−G.

R + bifacial gain − all sequential losses = G. The residual is verified hourly before annual aggregation. Other attribution orderings can produce different mechanism shares because the mechanisms interact. No independent estimate is added to this ledger.

## Optional electrical compatibility

Cold string Voc = modules/string × Voc_STC × [1 + beta_Voc × (minimum design cell temperature−25)]. It must remain below both module system-voltage and inverter limits. Hot/cold Vmp uses its supplied temperature coefficient against the MPPT window. Input-current checks require module Isc and the inverter limit. Missing parameters yield **unverified**, not an approval. These checks do not implement all local design standards, protection ratings or safety factors.
