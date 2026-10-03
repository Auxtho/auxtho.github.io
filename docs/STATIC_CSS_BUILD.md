# Reviewed static stylesheet contract

This static site ships the committed `assets/style.css`. The September 17
stylesheet was reproduced byte-for-byte when preparing the October 3 Ardamire
record page. The site no longer installs or executes the Tailwind 3 compiler
and its unpatched recursive glob-parser dependency chain.

`npm run build` now validates, without writing CSS:

- the exact reviewed stylesheet bytes;
- the preserved legacy CSS input and configuration;
- the static class-attribute inventory in every root HTML page covered by the
  former Tailwind configuration.

Changing any of these requires an explicit stylesheet review and a manually
reviewed contract update. There is no automatic contract refresh or bypass.
New utility classes must not be added without a reviewed stylesheet that
provides them. This is a static validation process, not a CSS compiler.

Dedicated subpages use their separately reviewed, hash-addressed stylesheets;
existing release packaging checks continue to validate those bytes. Existing
security audits, exact public-file contracts and deployment approvals remain
in place. Do not use `npm audit --omit=dev` to hide build dependencies.

If dynamic utility generation becomes necessary, perform a separately scoped
migration to a supported compiler and validate the full site before changing
this build model. Legacy input/config files are retained only for provenance,
not executed during installation or release.
