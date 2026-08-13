// Why this file exists, given app.json holds everything:
//
// `eas build` reads the evaluated config, sees the ShareExtension that
// expo-share-intent registers, and writes it back into app.json as
// extra.eas.build.experimental.ios.appExtensions so it can provision
// credentials for it. On the next evaluation the plugin finds that entry AND
// adds its own, counts two, and its compatibility checker aborts the build —
// with `expo config` exiting 1 and printing nothing, which is a miserable thing
// to debug. Each rewrite also baked the plugin's output back into the source,
// so associatedDomains and LSApplicationQueriesSchemes grew a copy per run.
//
// EAS cannot write to a dynamic config. It will say so and carry on, which is
// exactly what we want: the extension is still present in the evaluated config,
// so credentials are provisioned correctly — it just cannot persist it and
// create the conflict.
//
// app.json stays the single source of truth. Edit it, not this file.
module.exports = ({ config }) => config;
