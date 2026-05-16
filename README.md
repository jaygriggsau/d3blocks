# d3blocks

A 3D voxel block builder in the browser. Click to place blocks, Shift+Click to remove, drag to orbit, scroll to zoom.

## Features

- 10 shape primitives: cube, slab, slope, corner, pyramid, cylinder, cone, sphere, torus, dome
- Per-block Y-axis rotation (press **R**) for slopes & corners
- `[` / `]` cycle the current shape
- 12-color palette plus full custom color picker
- Save / load to `localStorage`, JSON export, PNG screenshot
- **STL export** (binary) ready for slicing & 3D printing
- Soft shadows, fog, orbit camera
- Pure static site — no build step

## 3D printing

The "Export STL" button writes a binary STL of all placed blocks in world
space, with each cell = 1 mm by default. Scale in your slicer (e.g.
Cura/PrusaSlicer/Bambu Studio) to your desired size. Use a slicer that
auto-repairs minor mesh issues if you mix many overlapping shapes — for
the cleanest print, prefer non-overlapping placements.

## Local preview

Any static server works, e.g.:

```bash
python3 -m http.server 5173
```

Then open http://localhost:5173.

## Deploy to Vercel

This repo is a static site. Deploy with:

```bash
vercel
```

Or import the repository in the Vercel dashboard — no framework preset needed.
