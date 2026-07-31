// No-op stand-in for the `server-only` package.
//
// The real module throws when it is pulled into a non-server bundle. That guard is
// valuable in the app (it stops the Neon URL / Firebase key leaking into the client
// bundle) but meaningless under Vitest, which is already Node. Aliased in
// vitest.config.ts.
export {};
