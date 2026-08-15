# Sebastian's countdown voice

Drop recorded clips here as `audio/<id>.mp3`, then add each `<id>` to the
`VOICE_CLIPS` set in `js/sfx.js`. A countdown line plays Sebastian's clip when its
id is listed; any line without a clip falls back to the synthesized voice. So you
can record just the fun terminal count first and add the rest whenever.

## How to add a clip
1. Record the line (phone voice memo is fine). Keep it short; trim the silence.
2. Save/convert it as `audio/<id>.mp3` using the id from the tables below.
3. Add `"<id>"` to the `VOICE_CLIPS` set in `js/sfx.js`.
4. `./deploy.sh` — the `audio/` folder now ships (README excluded).

Tips: mono, keep each clip under ~2 seconds (except the longer director lines),
normalize the volume so they're consistent, and record in a quiet room.

## Start here — the terminal count (the iconic part)
| id | say |
| --- | --- |
| `ten` | "Ten" |
| `nine` | "Nine" |
| `eight` | "Eight" |
| `seven` | "Seven" |
| `ignition` | "Six… ignition sequence start!" |
| `three` | "Three" |
| `two` | "Two" |
| `one` | "One" |
| `liftoff` | "Zero! We have liftoff!" |

Note: `five` and `four` are intentionally NOT spoken — the `ignition` line runs
over them so the count stays in sync. So you don't record those two.

## Optional — the earlier callouts
| id | say |
| --- | --- |
| `t60` | "T minus sixty seconds and counting." |
| `standby` | "All stations, this is the flight director. Stand by for go / no-go for launch." |
| `t20` | "T minus twenty seconds." |
| `guidance-internal` | "Guidance is internal." |
| `go-for-launch` | "Copy that. We are go for launch!" |

## Optional — the go / no-go poll (he can be everyone)
The flight director asks (`-q`), each station answers (`-go`).
| id | say |
| --- | --- |
| `booster-q` / `booster-go` | "Booster?" / "Go, flight!" |
| `guidance-q` / `guidance-go` | "Guidance?" / "Guidance is go!" |
| `propulsion-q` / `propulsion-go` | "Propulsion?" / "Propulsion, go!" |
| `fido-q` / `fido-go` | "FIDO?" / "FIDO is go!" |
| `eecom-q` / `eecom-go` | "E-COM?" / "Go, flight!" |
| `range-q` / `range-go` | "Range Safety?" / "Range is go!" |
