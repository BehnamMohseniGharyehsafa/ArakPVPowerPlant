# Weather, parameter inputs and local outputs

The source repository intentionally excludes downloaded meteorology and generated operational-looking datasets. `scripts/download_weather.py` retrieves the requested public archive and stores:

* `cache/arak/original.zip`: original unchanged archive.
* `cache/arak/original.epw`: the sole EPW, copied after validating every ZIP member path, count and expanded size; no unrestricted extraction.
* `cache/arak/provenance.json`: source URL, download timestamp, archive and EPW SHA-256, TMY type and reference calendar.
* `cache/computations`: Joblib cache of common solar geometry keyed by weather hash and configured location.

Uploaded EPWs use checksum-derived directories, preserve original bytes and record upload provenance. The quality gate requires a complete ordered 365-day hourly calendar, rejects invalid core variables and flags radiation consistency issues. Original constituent years are not interpreted as a continuous historical year. The plant reference location is separately configurable from station metadata.

`runs` contains locally generated compressed Run objects and completed analyses; these are trusted application outputs and must not be replaced with untrusted pickle/joblib files. `scenarios` contains saved JSON configurations. `SOLAR_DATA_DIR` can redirect all local state to a persistent volume.

Example engineering inputs live under `../examples`. Module inputs are explicitly illustrative; supply full parameter provenance for advanced electrical modelling. The application does not redistribute commercial datasheets or estimate validated single-diode parameters from insufficient data. Module values in exports are allocated from string calculations.

Weather attribution: Climate.OneBuilding.Org, Linda K. Lawrie and Drury B. Crawley; see the official [data sources and methodology](https://climate.onebuilding.org/sources/default.html). Weather rights remain with the source and original providers. Cache files are not covered by this repository's software licence. No private plant data are supplied.
