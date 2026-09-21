# Landing page video

The scroll stage on `/` scrubs `vantage-scroll.mp4` with the page's scroll position,
showing `vantage-scroll-poster.jpg` until it decodes.
If the clip is ever missing or unplayable the stage falls back to the stacked list
with `ProductFrame`, so the page stays complete without it.

The current clip is one unbroken 20 second take: a floor plan seen from directly
overhead, extruding into a wireframe tower as the camera tilts, then orbited while
pulses of light run through its structure.
One shot rather than several cut together, so the descent never seams.

## Encoding for scrubbing

Scrubbing seeks constantly, and an accurate seek decodes forward from the preceding
keyframe, so a replacement clip needs a short GOP or the scrub feels stepped:

```bash
ffmpeg -i source.mp4 -an -vf "delogo=x=1130:y=570:w=60:h=66" \
  -c:v libx264 -preset slow -crf 26 -g 4 -keyint_min 4 -sc_threshold 0 \
  -pix_fmt yuv420p -movflags +faststart public/landing/vantage-scroll.mp4

ffmpeg -i public/landing/vantage-scroll.mp4 -vframes 1 -q:v 3 \
  public/landing/vantage-scroll-poster.jpg
```

`-g 4` caps a seek at three decoded frames and costs about 25% over a default GOP.

The `delogo` filter paints out the generator's watermark in the lower right by
interpolating from its surroundings; drop it for footage that has none.
Thin bright lines on black compress well, so crf 26 holds up where a photographic
clip would not: 20 seconds lands at 3.6 MB and is indistinguishable from the source
at 2x zoom.
