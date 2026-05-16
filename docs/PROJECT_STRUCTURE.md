# Project Structure

## Active Code

`userscripts/` contains installable Tampermonkey scripts. Each file should remain self-contained unless shared logic becomes large enough to justify a build step.

## Reference Material

`references/` is for local research artifacts and upstream repos:

- `references/amazing-marvin-page/` - downloaded Amazing Marvin page export used for DOM inspection and manual testing.
- `references/MarvinAPI.wiki/` - cloned Marvin API wiki.
- `references/amazing-marvin-automation/` - cloned automation reference repo.
- `references/amazingmarvin-browserextension/` - cloned browser extension reference repo.

These references are intentionally ignored by Git to avoid committing large exports or nested repositories.

## Future Extension Path

If the project becomes a browser extension, use:

- `extension/` for source, manifest, background/content scripts, and build tooling.
- `userscripts/` for generated or hand-maintained Tampermonkey scripts.
- `docs/` for API notes, manual test plans, and migration decisions.

Keep the active runtime code separate from local reference clones.
