# Self-Reflective Correction Demo

**Goal:** Robot notices it's dirty by looking in a mirror, narrates what it sees, then autonomously drives through a brush station to clean itself.

**Why it matters:** Demonstrates closed-loop self-awareness — the robot uses its own camera to assess its state, makes a decision, acts on it, and verifies the result.

---

## Sequence

### Phase 1 — Turn to Mirror
```
spin -90          # Turn right 90° to face the mirror
head -10          # Tilt head down slightly toward mirror
sleep 1500        # Let the robot settle
```

### Phase 2 — Look at Self (Vision)
```
photo main        # Capture what the robot sees in the mirror
→ ANALYZE IMAGE   # Claude examines the photo for "dirt" (sticky notes)
→ BUILD NARRATION # Generate a spoken reaction based on what's actually visible
```

The narration should describe what the robot actually sees — color/position of sticky notes, which parts look dirty. Not a canned line.

### Phase 3 — React
```
speak <narration>           # Say what it sees: "I can see [X] on my [Y]..."
emotion sad 1               # Express dismay
sleep 2000                  # Beat for dramatic effect
speak "Let me clean up."    # Declare intent
sleep 2000
```

### Phase 4 — Turn to Brush Station
```
head 0            # Head center
spin 180          # Turn 180° to face the chair/brush station
sleep 1000
```

### Phase 5 — Confirm Path (Vision)
```
photo main        # Capture what's ahead
→ ANALYZE IMAGE   # Verify the brush station (chair legs with brushes) is visible
→ NARRATE         # Optional: "I can see the brushes ahead. Here I go."
speak <narration>
sleep 2000
```

### Phase 6 — Drive Through
```
drive 0.12 0 6    # Slow forward through the brushes (~72cm over 6s)
sleep 500
```

### Phase 7 — Verify Clean (Vision)
```
spin 180          # Turn back to face the mirror again
head -10          # Look in mirror
sleep 1500
photo main        # Capture after photo
→ ANALYZE IMAGE   # Compare: are the sticky notes gone/reduced?
→ NARRATE         # "Much better!" or "I still see some..."
speak <narration>
emotion happy 2   # Celebrate
head 0
```

---

## Execution Notes

- **All vision steps are real** — Claude analyzes each photo and generates context-aware speech. Nothing is pre-scripted except the physical movements.
- **Drive speed/duration** may need tuning based on chair distance. Start conservative at 0.12 m/s.
- **Arm torque** should be ON before starting so the arm doesn't flop during movement.
- **Emergency stop** available at any time via `stop` command.
