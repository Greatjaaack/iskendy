# Responsive Liquid Glass · 15 October 2026

Owner approved the Figma designs and authorized frontend implementation in this chat. The latest designs supersede older black navigation, compact back button in the bottom dock, collapsed order stack, and initially empty emotion selection. API and storage contracts remain unchanged.

## Source and coverage

Figma file `QDbhShERrxdg5nXHbrr27s`: Mobile page `789:2`, Tablet `882:9764`, Desktop `881:4164` (112 reference frames/states each).

- Orders: one full card; two adjacent cards; three or more scroll with snap and position indicator. Details show a centered card and swipe between orders, preserving selection. The desktop single card remains 480 wide, as the owner's final decision.
- Root navigation only: My Orders / Board / Help. Milk glass surface, pink selection. Held pointer lens follows the gesture and commits on release; keyboard navigation remains native links. No dock on nested screens or rating.
- Top bell opens order events; top back navigates out of details, notification, help answer, manager and message screens.
- Board: own numbers have pink outlines, no extra chip, with a text legend.
- Rating: initial emotion 3, stable portrait/slider/actions geometry; multi-select reasons, optional Other explanation, comment and attachment selection, acknowledged success, recoverable failure.
- Message to manager: optional order number, required description, anonymous notice, attachment selection/removal, draft preservation and discard confirmation.
- System states: pastel glass skeleton, initial fetch failure with retry/help, offline cached board/orders, ready toast, browser notification permission and unsupported fallback. Browser signal adapters remain the existing implementation.

## Backend work required — owner confirmed no contract exists yet

These are requirements, **not invented endpoints**. The frontend must not report successful delivery or silently drop selected files.

1. Anonymous message delivery to the manager, without asking for name or contact. Optional order reference; message text ≤1000 characters. Define idempotency, business errors, 429 behavior, authorization/abuse protection, and structured acknowledgement.
2. Uploads for manager messages **and ratings**: photo, video, document. Define allowed MIME types/extensions, file count and size limits, validation, upload lifecycle, retry/cancel, attachment removal, and a non-secret reference in the final message/detail request. Do not put private URLs in telemetry.
3. Define partial failure/atomic submission: a failed attachment must never disappear while the text is presented as fully delivered. Define draft lifetime and orphan-file cleanup.
4. Confirm whether rating/detail API accepts attachment identifiers, or introduce a documented replacement contract while retaining existing feedback credentials.

Until then selection, local previews, removal and drafts work. Message submission returns a recoverable unavailable state. Rating with files retains them and blocks a false success; deleting files allows the existing text feedback API to complete.

## Keyboard and platform notes

The browser/OS owns the system keyboard. Do not draw an imitation in the web page or apply independent lower corner radii to it. Full viewport backgrounds extend to the device edges; safe-area insets reserve space for the home indicator. Bottom sheets use VisualViewport's usable height/offset and keep close/action controls reachable above the keyboard; inner form content scrolls. Tablet keyboard artwork in Figma is conditional, not an instruction to stretch a phone keyboard. Desktop has no keyboard graphic.

Sound, vibration, notifications and reduced motion obey browser support and permission. Keep the page open: backend Web Push on a closed tab is not available. Figma motion examples are reference states; real pointer capture and keyboard behavior are implemented in React.

## Acceptance

Local tests and browser screenshots are recorded separately in the implementation report. This document does not claim physical-device testing, a deploy, or backend upload/message integration.
