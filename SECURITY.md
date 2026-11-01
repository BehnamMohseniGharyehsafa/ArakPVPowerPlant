# Security

Report suspected vulnerabilities privately through this repository's GitHub Security tab. Do not publish credentials, personal weather uploads or exploitable details in a public issue.

The public deployment is an illustrative simulation service. It has no plant control interface, equipment credentials or connection to operational power systems. Public source code does not grant permission to change the repository or deployment.

Public mode uses signed HttpOnly browser session cookies, separate scenario/run/job ownership, same-origin mutation checks, request and calculation limits, upload limits, a bounded worker queue, bounded run memory, a temporary storage ceiling, restrictive browser headers and a non-root container. Only the baked reference simulation is intentionally shared. Uploaded EPWs are parsed as weather data; uploaded objects are never deserialized as Python objects.

Free hosting has finite shared resources. Public studies are capped at 160 strings and uncertainty analyses at 80 samples. Run the local application for larger studies. Export your results: Render's free filesystem is temporary and a session cookie is not a permanent authenticated account.

CI runs numerical, session-isolation, frontend and browser checks, as well as an npm vulnerability audit. Action versions are pinned to commit hashes; Dependabot proposes updates. Administrators remain responsible for reviewing dependencies, monitoring alerts and protecting their GitHub and Render accounts with strong authentication. No deployment can be guaranteed immune to compromise or denial of service.
