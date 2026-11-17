// tsc emits dist/; this copies the CSS: vanilla-cookieconsent's stylesheet + JGC overrides → dist/consent.css.
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const vendor = readFileSync(require.resolve("vanilla-cookieconsent/dist/cookieconsent.css"), "utf8");
const theme = readFileSync(new URL("../src/consent/theme.css", import.meta.url), "utf8");
writeFileSync(new URL("../dist/consent.css", import.meta.url), `${vendor}\n${theme}`);
