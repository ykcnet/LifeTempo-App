# LifeTempo 1.1.16 voice hotfix

The supplied installed baseline, `LifeTempo-release-v1.1.13.apk`, has versionCode 24 and the same release certificate as this repository. The earlier 1.1.6 artifact had versionCode 17 and could not update it.

The repository is older than the supplied APK: it lacks its native speech integration and complete todo widget implementation. Do not replace the baseline's compiled native code with this checkout's output. Three unfinished Java files in this checkout also reference missing methods. Restoring the matching Android source remains necessary before the next full source build; this hotfix does not claim to repair those unfinished features.

`Build-VoiceHotfix.ps1 -BaselineApk <absolute-path-to-1.1.13.apk>` preserves the baseline entries, changes the manifest to 1.1.16 / 27, updates the AI voice handler and injects the shared speech session controller for both natural and AI input in its existing HTML, aligns the APK and signs it with the existing release key. The patch fails if the baseline version or signing identity does not match. Passwords are decrypted only into process environment variables and cleared after signing.

The voice fix reconstructs final text from a session snapshot, preserves pre-recording text, ignores stale callbacks, and automatically reconnects after silence until explicit stop/cancel. Regression tests run against the actual patched HTML. Signature and ZIP alignment verification run after packaging. Device installation and microphone testing still require an attached Android device.
