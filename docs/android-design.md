# Kast Android — design reference lock

Primary reference: the existing Kast desktop design system and the user's notification/media-menu screenshots. This is a mobile adaptation of Kast, not a new brand direction.

The Refero skill was consulted. Live style/screen research was attempted for monochrome productivity UI and mobile note-list/editor navigation, but the service returned `NO_SUBSCRIPTION`. The fallback reference is its bundled `references/craft-details.md`, combined with the existing product.

| Decision | Source | Rule and purpose |
| --- | --- | --- |
| Canvas #090a0a, paper #f4f4f2, Inter and rounded controls | Kast tokens and existing screens | Preserve existing visual roles; green remains the progress/action accent. |
| Four labeled bottom destinations | Kast's existing four top-level destinations; touch guidance | Keep navigation reachable with one hand; retain recognizable names and selected state. |
| List → note → list on small screens | Existing Kast notebook content hierarchy; phone viewport constraint | Give writing the full width; preserve selected note and flush edits on back. |
| Minimum 44px touch controls | Refero craft details | Media handle, back and navigation must be usable without hover. |
| Viewport-bounded menus, scrollable dialogs and system-bar insets | Existing overlay components; Android edge-to-edge constraint | Keep actions, close buttons and input fields reachable. |
| No decorative imagery or new colors | Existing product lock | Kast's content and code-native icons provide the visual hierarchy. |

Validation target: 360, 390 and 430px portrait widths, short landscape viewport, keyboard/focus access, no horizontal overflow, and unchanged desktop layout at ≥768px.
