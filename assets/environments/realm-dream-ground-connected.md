# Connected terrain plate

Built-in image generation edit, 2026-09-22. Reference: `realm-dream-ground.png`.
Output copied unchanged to `realm-dream-ground-connected.png` (1536 × 1024).
Original retained for comparison. Same runtime scale and courtyard anchors.
The plate has four midpoint road exits; these are scenery, not navigation rules.
Opposite-edge mean RGB differences improve from 63.46/55.32 to 32.05/29.23
(horizontal/vertical). This is not pixel-perfect seamless art.

## Final prompt

Use case: precise-object-edit. Edit this terrain plate into a SEAMLESS TILEABLE game terrain. Preserve style, palette, high angle camera, all six EMPTY pearl-stone courtyard centers EXACTLY at original locations and sizes: relative 1536x1024 canvas centers (300,300),(740,300),(1190,280),(280,710),(750,710),(1220,760). Preserve most interior composition. Main change: reconstruct outermost 140-pixel border and inter-courtyard road connections so this image repeats LEFT to RIGHT and TOP to BOTTOM without a visible discontinuity. Opposite borders must depict matching positions, colors, shapes and illumination, like a production seamless texture. Add one continuous pale ivory road exiting horizontally at midpoint of left and right edges y512; add one pale ivory road exiting vertically at midpoint of top and bottom edges x768. These four matching road exits must smoothly connect to the existing interior courtyard roads. Road width at exits ~65px, unobstructed; no staircase at tile boundaries. Border terrain is blue-violet forest, low rocks and turquoise water with identical opposite-edge silhouettes, no large abrupt cliffs touching edge. Uniform cool daylight across tile; remove upper-left bright hotspot. Pearl ivory, indigo, lilac trees, subtle gold and turquoise, elegant dream-fantasy JRPG royal garden not medieval. No buildings, people, characters, labels, symbols, text, grid, dark outline or vignette. Fill entire rectangular canvas opaque; output 1536x1024 landscape. This will be tiled in a 3-column expanding map: make adjoining repeated copies appear as one connected landscape.
