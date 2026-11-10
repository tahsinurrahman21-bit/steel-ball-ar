# Your own sound effects

The app synthesises its sounds by default. To use your own recordings, put the files in
this folder and list them in `manifest.json`. Any format the browser can decode works
(`.wav`, `.mp3`, `.ogg`).

```json
{
  "activate": "my-activation.wav",
  "materialize": "my-materialise.wav",
  "spin_loop": "my-spin-loop.wav",
  "throw": "my-throw.wav",
  "impact": "my-impact.wav"
}
```

| Key | Played when | Notes |
|---|---|---|
| `activate` | Open palm recognised | Subtle, about 1 s |
| `materialize` | Ball finishes appearing | One-shot |
| `spin_loop` | While the ball spins | Must loop cleanly; its pitch follows the spin speed |
| `throw` | Release | Sharp, under 1 s |
| `impact` | Ball reaches the lens | One-shot |

Leave a key out to keep the synthesised version for that event. Reload the page after
changing the manifest.
