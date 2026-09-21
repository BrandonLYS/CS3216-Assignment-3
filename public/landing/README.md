# Landing page video

The scroll stage on `/` scrubs `prismpm-scroll.mp4` with the page's scroll position, showing `prismpm-scroll-poster.jpg` until it decodes.
If the clip is ever missing or unplayable the stage falls back to `ProductFrame`, so the page stays complete without it.

Scrubbing seeks constantly, and an accurate seek decodes forward from the preceding keyframe, so a replacement clip needs a short GOP or the scrub feels stepped:

```bash
ffmpeg -i source.mp4 -an -c:v libx264 -preset slow -crf 20 \
  -g 4 -keyint_min 4 -sc_threshold 0 -pix_fmt yuv420p \
  -movflags +faststart public/landing/prismpm-scroll.mp4

ffmpeg -i public/landing/prismpm-scroll.mp4 -vframes 1 -q:v 3 \
  public/landing/prismpm-scroll-poster.jpg
```

`-g 4` caps a seek at three decoded frames and costs about 25% over a default GOP.
Keying every frame costs 40% more again for no visible gain.
