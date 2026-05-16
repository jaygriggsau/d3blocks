# d3blocks

A 3D voxel block builder in the browser. Click to place blocks, Shift+Click to remove, drag to orbit, scroll to zoom.

## Features

- Voxel placement on an infinite-feeling 32×32 grid
- 12-color palette plus full custom color picker
- Save / load to `localStorage`, JSON export, PNG screenshot
- Soft shadows, fog, orbit camera
- Pure static site — no build step

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
