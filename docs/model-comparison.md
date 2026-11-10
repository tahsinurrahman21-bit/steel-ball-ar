# Steel Ball 3D models — comparison

Status: **no model file has been downloaded or integrated.** The ball in the app is
procedural. What follows is based on each model's public metadata and preview image.

## Why nothing was downloaded

- **Sketchfab (all three):** marked downloadable and free, but the download needs a
  signed-in Sketchfab account. I cannot sign in or create an account for you.
- **MakerWorld and Cults3D:** both pages refuse automated access (HTTP 403, bot
  protection). I did not try to get around that, so I have not seen these two models at
  all.

## What could be assessed

| | 1. Spookies | 2. Nekupaska | 3. Amjx |
|---|---|---|---|
| Link | [Gyro's Steel Ball](https://sketchfab.com/3d-models/jojos-bizarre-adventure-gyros-steel-ball-4e08d2fac7a44f24adaedd3f60442dd3) | [Gyro Zeppeli's Steel Ball](https://sketchfab.com/3d-models/gyro-zeppelis-steel-ball-jjba-steel-ball-run-dfb1780502da492faa383d5126df495f) | [Gyro's Steel Ball](https://sketchfab.com/models/379d3d6ffa4f40758b677b3045027cf1) |
| Licence | CC Attribution | CC Attribution-NonCommercial | CC Attribution |
| Triangles | 43,228 | 13,488 | 342,980 |
| Textures / materials | 1 / 1 | 0 / 1 | 0 / 1 |
| Default colour | Grey | Glossy green | Matte green |
| Engraving (from preview) | Polar cap with wide, soft-edged channels and slots | Hexagonal cap, short slots from its edges, rounded tips | Hexagonal cap, long slots down the body |
| Real-time cost | Fine | Lightest | Heavy; needs decimating |
| Published | 2015 | 2019 | 2021 (updated 2022) |

| 4. MakerWorld | 5. Cults3D |
|---|---|
| [Steel Ball](https://makerworld.com/en/models/509253-steel-ball) | [Ball Gyro Zeppeli](https://cults3d.com/en/3d-model/fashion/ball-gyro-zeppeli-steel-ball-run-jojo-cosplay) |
| Not assessed (page blocked). Print models are usually STL with no materials and often split into halves, so expect conversion work. | Not assessed (page blocked). Same caveat. |

## Reading

- All three Sketchfab models agree with the anime's stationary shots on the design:
  a hexagonal groove round each pole and slots running down the body. The procedural ball
  was built to that same design, which is why it could stand in.
- **Recommended primary: model 2 (Nekupaska).** Closest to the anime's proportions in
  the preview, cleanest geometry, lowest triangle count, already shown as glossy green.
  Its NonCommercial licence is fine for a personal project and needs credit to the author.
- **Model 1 (Spookies)** is the one you flagged as grey. Colour is not a problem: it has
  one material, which would be replaced with the app's green metal anyway. Its channels
  look softer and wider than the anime's.
- **Model 3 (Amjx)** has the longest slots and reads well, but at 343k triangles it must
  be decimated to roughly 20k before use.

## What using a model would change, honestly

The procedural ball computes its rotational motion blur analytically, because the
engraving is a formula. A mesh cannot be blurred that way. With a mesh, blur would have to
come from drawing it several times at sub-frame rotations, or the mesh's grooves would be
baked into a texture that the existing shader reads. The second route keeps the current
look and is the one I would take.

## To proceed

Download any of the three Sketchfab models while signed in (choose **glTF** or **GLB**)
and put the file in `assets/models/original/`. Keep the original untouched; working copies
go in `assets/models/`. For MakerWorld or Cults3D, download the STL the same way.
