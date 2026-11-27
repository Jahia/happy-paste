---
# Allowed version bumps: patch, minor, major
happy-paste: minor
---

Changed the module to declare that it requires app-shell 4.0 or later, which every Jahia 8.2.2 or later can run. Its interface never loaded on an earlier app-shell; the module now refuses to start there instead.
