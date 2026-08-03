# Distributing the BazarHQ Android app

How to produce a shareable APK and push over-the-air (OTA) JavaScript updates to
it. **None of this changes the Expo Go dev workflow** — `npm start` still works
exactly as before.

## One-time setup (free — no build credits)

```bash
cd mobile
eas init                # creates the Expo project, writes extra.eas.projectId
eas update:configure    # writes updates.url and confirms runtimeVersion
```

`eas init` links this directory to a project on your Expo account. By default it
uses your personal account (`ilmun_islam`); add `"owner": "ilmunislams-team"` to
`app.json` first if you want it under the team instead. This is awkward to change
later, so decide before running it.

## Building the APK

```bash
eas build --platform android --profile preview
```

The `preview` profile sets `android.buildType: "apk"`, so you get an **APK you
can install directly** — not an AAB, which only the Play Store can open.

The build runs on EAS servers (~10–20 min). You get a build page with a **QR code
and a download link**; opening the link on an Android device downloads the APK.
The device needs "install from unknown sources" allowed for the browser or file
manager doing the install.

First build: EAS will offer to generate an Android keystore. **Let it** — it
stores and reuses the keystore, and every later build is signed with the same
key, which is what lets an updated APK install over an existing one instead of
being rejected.

## Pushing a JS update (no rebuild)

```bash
eas update --branch preview --message "what changed"
```

Installed APKs from the `preview` channel pick it up on next launch (they fetch
in the background and apply on the following start).

---

## The rule: when can I use `eas update`, and when must I rebuild?

**JavaScript and assets → `eas update`. Anything native → rebuild the APK.**

An OTA update replaces the JS bundle inside an already-installed app. It cannot
add native code, change permissions, or change anything Android reads from the
installed package.

### `eas update` is enough

- Any change under `src/` — screens, components, hooks, API-client code
- Styles, copy, images imported from JS
- Bug fixes and new features built out of existing libraries

### A rebuild is required

- Installing any package with native code (`npx expo install <something>`)
- Bumping the Expo SDK or React Native
- Changing `app.json` native fields: `android.package`, `version`,
  `versionCode`, icons, splash, `scheme`, permissions, or the `plugins` list
- Adding or configuring a config plugin
- Changing `EXPO_PUBLIC_*` values — they are **inlined at build time**, so
  editing `.env` or the profile's `env` does nothing until you rebuild

### How this is enforced

`app.json` sets:

```json
"runtimeVersion": { "policy": "fingerprint" }
```

The runtime version is a hash of the **native** project — native modules, config
plugins, native app config, and the dependency list. An APK only accepts updates
published with a matching fingerprint.

That means a mistake is *structurally impossible*: if you add a native module and
publish an OTA, existing APKs simply don't see it. They keep running their
embedded bundle. Without this, the update would download and then crash on a
native module that isn't in the installed app.

The trade-off is that fingerprint is deliberately conservative — **adding any
dependency changes it, even a pure-JS one**, which cuts existing APKs off from
further updates until you rebuild. That is the safe direction to err in, but it
does mean "I added a small JS library" is a rebuild, not an update.

The alternative policy is `"appVersion"`, where the runtime version is just
`expo.version` and you decide compatibility by hand — more flexible, and it fails
by crashing real devices when you forget. Fingerprint was chosen deliberately.

### Worked examples from this project's history

| Change | OTA or rebuild? | Why |
|---|---|---|
| C3 spec fields in the product form | **OTA** | TSX only |
| C4 compare tray + toggles | **OTA** | TSX only |
| C5 comparison screen | **OTA** | TSX only |
| C6 storefront Compare toggle | **OTA** | TSX only |
| Mobile taxonomy admin screens | **OTA** | TSX only |
| B2 `expo-image-picker` install | **Rebuild** | native module + permission strings |
| `expo-updates` (this setup) | **Rebuild** | native module — the very first APK must already include it |
| Pointing the app at a different API URL | **Rebuild** | `EXPO_PUBLIC_*` is baked in at build time |

Every mobile change in the whole C-series would have shipped as an OTA update.
The native ones were all package installs.

---

## What ends up inside the APK

The JS bundle is readable by anyone who unpacks the APK, so **only non-secret
values may be `EXPO_PUBLIC_*`**. Currently that is exactly one:

- `EXPO_PUBLIC_API_URL` = `https://bazarhq-api.onrender.com/v1` — a public
  endpoint, already reachable by anyone.

No JWTs, API keys, Cloudinary credentials, or database URLs are present. Auth
tokens are obtained at login and stored in `expo-secure-store`, which is backed
by the Android Keystore — never in an env var and never in the bundle.

`eas.json` sets `EXPO_PUBLIC_API_URL` explicitly per build profile, because
`mobile/.env` is gitignored and therefore does not exist on EAS build servers.
