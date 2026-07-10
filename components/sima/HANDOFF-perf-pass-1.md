# SimaStream — performance pass #1 (safe layer)

Two files: `TVHomeScreen.tsx`, `ContentScreen.tsx`. Build + test in
isolation before adding more layers.

## TVHomeScreen.tsx — React.memo on cards (the big one)
Before: a single top-level `focusedId` re-rendered EVERY card on each D-pad
move → lag and the "jumps back to start" feel.
Now:
- `PosterCard` and `ChannelCard` are wrapped in `React.memo` with a custom
  comparator. Cards receive a boolean `isFocused` instead of the whole
  `focusedId`. Only the two cards whose focus actually changed re-render per
  move, not the whole screen.
- Each row `FlatList` got `extraData={focusedId}` so the highlight still
  updates reliably.
- Comparator ignores function/node props (onPress, badge, setFocusedId)
  which change identity each render but don't affect a card's visuals.

## ContentScreen.tsx — list virtualization (safe choice)
Its rows are inline in `renderItem` (not separate components), so true memo
there would mean extracting heavy components in a fragile 1500-line file —
risky with your limited messages. Instead I applied the safe, high-impact
optimization for long channel lists:
- `windowSize={5}`, `maxToRenderPerBatch={10}`, `initialNumToRender={12}`,
  `removeClippedSubviews={true}`, `extraData={focusedId}` on BOTH the
  category list and the content list.
- This renders only what's near the viewport instead of hundreds of rows at
  once → much less memory/CPU on low-RAM TVs.

## Watch for (one known trade-off)
`removeClippedSubviews={true}` is great for memory but on a few Android
builds can make off-screen rows render blank until scrolled. If you see
blank channel rows, set `removeClippedSubviews={false}` in ContentScreen's
two FlatLists — everything else stays.

## Combined with earlier work
This sits on top of the scale-removal (already big) and the focus-into-
channels change. Expect noticeably snappier D-pad movement on Home and
lighter Content lists.

## Next layers (NOT done — deferred, do after testing this)
- Image caching via `expo-image` (helps the no-server-cache problem).
- Local data cache in `AsyncStorage` with TTL (instant re-entry to a
  category).
- Optional: full memo extraction of ContentScreen rows if virtualization
  alone isn't enough.

## Verified
- TVHomeScreen: 2 `React.memo`; cards no longer take `focusedId`; 6
  `isFocused=` call sites; 6 `extraData`; Pressable 11/11; View 47/40.
- ContentScreen: virtualization props on 2 lists; Pressable 13/12; View
  35/34 (both balanced with self-closing overlays).
