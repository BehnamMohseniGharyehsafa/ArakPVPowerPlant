# Scientific methodology

The calculation boundary begins with hourly EPW weather and ends at delivered AC electricity after availability, AC wiring and grid constraints. All production is simulated. A typical year is not a chronology of the constituent EPW years.

## Weather and solar geometry

`pvlib.iotools.read_epw(..., coerce_year=2001)` creates a non-leap local-standard-time calendar. The reader maps hour-ending EPW records to interval-start labels. Radiation is an hourly average irradiance numerically equivalent to the EPW Wh/m² divided by the one-hour duration. Geometry is evaluated at each midpoint, not at the interval end. Temperature/wind are retained at the corresponding record; sub-hourly dynamics are not inferred.

The importer requires exactly the ordered 8760-hour calendar. Missing/sentinel values and implausible GHI/DNI/DHI, temperature, wind or pressure cause rejection. Irradiance closure discrepancies and nonzero night irradiation are flagged. Generation uses zero irradiance when the calculated sun is below the horizon. Original meteorology remains available for independent checking. Invalid precipitation is not converted into measured zero rainfall. Default rain cleaning is explicitly an assumption.

Solar position uses pvlib's NREL SPA NumPy implementation. Pressure and temperature are supplied from EPW for refraction in normal API runs. Extraterrestrial radiation and incidence angle use pvlib functions. Plant coordinates default to EPW metadata and can be changed independently; using a distant station does not validate site resource.

## Irradiance and bifaciality

Hay-Davies transposition calculates unshaded direct, sky-diffuse and ground-reflected POA once. The infinite-sheds model independently calculates shaded front/rear POA from GHI, DNI, DHI, zenith, azimuth, tilt, GCR, pitch, centre height and albedo. GCR equals slope length divided by row pitch; centre height equals lower-edge clearance plus half the tilted module height.

Effective clean irradiance is the infinite-sheds output using configured bifaciality, rear structure shading and zero additional transmission loss. Monofacial operation sets bifaciality to zero. Rear energy is never represented by an arbitrary gain percentage. IAM is explicitly unity; no measured angular calibration or spectral correction is available. The unshaded component chart is an inspection of the transposition model, not a second contribution added to the shaded output.

Infinite sheds assumes long, parallel, equally spaced rows on level ground. Terrain, nearby obstacles, finite-row end effects, mismatch, bypass diodes and complex module shadow geometry are outside its boundary. WebGL lighting does not calculate electrical shading.

## Thermal and DC models

Faiman provides module temperature from ambient, incident front+rear irradiance and wind, using editable U₀/U₁. A SAPM cell correction, `deltaT × incident irradiance / 1000`, distinguishes module and junction temperature. Alternatively, Sandia module temperature uses pvlib's documented open-rack mounting parameters and corresponding deltaT. These values are engineering assumptions and require calibration for a specific mounting and wind measurement height. Incident irradiance for temperature is evaluated before electrical bifaciality/soiling; a cleaning intervention therefore changes DC irradiance without recalculating thermal absorptance.

The baseline is pvlib PVWatts v5 DC. That selected implementation is linear with effective irradiance; the optional irradiance correction in newer pvlib versions is not fitted from incomplete module data. No arbitrary low-light polynomial is introduced. Negative power is clipped at zero. De Soto is optional and requires alpha_sc, a_ref, I_L_ref, I_o_ref, R_sh_ref and R_s with documented provenance. The application does not infer validated single-diode parameters from rated power/efficiency alone.

Common irradiance and temperature are calculated once, then expanded at string resolution for local faults. Normal modules within a string are homogeneous; displayed individual module power is allocated. Localised soiling/shading/underperformance use explicit reduced-order power derates. Temperature faults modify string cell temperature before DC calculation.

## Inverters, loss accounting and performance

Strings sum into actual configured inverters. pvlib PVWatts conversion supplies part-load efficiency and rated AC clipping. Inverter efficiency faults reduce nominal efficiency while holding the AC nameplate fixed. Discrete inverter outages remove available output. Expected fractional availability, AC wiring and plant export constraints are separate stages. Delivered inverter outputs sum to plant output. No efficiency derate is applied a second time.

Loss attribution follows the stages in `equations.md`: unshaded reference, shaded front, bifacial effective, thermal DC, soiling, local faults, DC wiring, operating-year degradation, inverter conversion/clipping, availability, AC wiring, grid curtailment. Differences telescope, allowing signed temperature effects and bifacial gain. Clipping is reported as a subset of inverter loss. The maximum hourly accounting residual is reported and tested.

Energy is integrated at exactly one hour. Final yield is delivered kWh divided by installed kWp; reference yield uses shaded front POA irradiation divided by 1 kW/m². PR uses that conventional front reference; bifacial contribution may increase it. Capacity factor uses the AC nameplate. No IEC monitoring-class compliance is claimed.

## Decisions and uncertainty

Kimber models constant accumulation, bounded soiling, rainfall resets, wet-ground grace and manual cleaning. Regional coefficients are not site validated. The cleaning optimiser forms daily candidate segments, evaluates each through the actual PVWatts inverter/availability/export restrictions, and solves an acyclic finite-horizon dynamic programme with operation-count and minimum-spacing constraints. It assumes perfect foresight of this typical year and homogeneous whole-plant cleaning. Economic gain equals additional delivered hourly kWh × marginal price minus operations × editable total cost. Water use is reported separately.

The diagnostic residual is `(synthetic observed − expected) / expected` in daylight above 3% AC nameplate (minimum 10 kW). Three consecutive >3% residuals form an episode. Within-inverter median string ratios supplement evidence. Known injected events remain identified as synthetic ground truth; the detector does not prove their physical cause or calibrated confidence. Counterfactual reruns removing each event estimate lost/recoverable AC after response delay. Benefits interact. HiGHS selects individual economic candidates under budget/capacity; mandatory safety flags override those economic limits. Joint repair benefits are not reoptimised for nonlinear interactions.

NPV includes time-zero capex and year-end cash. LCOE discounts eligible costs and delivered kWh consistently. Year-one energy repeats with annual degradation; price/cost escalations and a specified replacement event are transparent. Repair costs are charged in year one. Financial scenarios are illustrative.

Monte Carlo uses the scenario seed, independent bounded uniform relative factors and complete physical reruns. Factors can vary resource, module power, U₀, soiling rate, bifaciality, availability, inverter efficiency, price and intervention costs. Parameter limits are clipped to model bounds. P50 is the median; P90 is the 10th percentile (90% exceedance) of this parameter experiment. A single TMY cannot establish true interannual resource variability or a bankable site-specific P90. One-at-a-time low/high scenarios provide energy and NPV sensitivity; correlations are not inferred.

## Verification

See `validation.md`. Numerical limiting cases, monotonic responses, topology, aggregation, CSV reconciliation, deterministic stochastic runs, component controls and actual browser interactions are tested. Calling the same pvlib implementation in a comparison is integration verification, not independent empirical validation. No measured production dataset or field diagnosis benchmark is available.
