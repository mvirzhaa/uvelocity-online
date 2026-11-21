# Synthetic media fixtures

These three short sine-wave MP3 files were generated specifically for the media
integration tests. They are not application background music and are not seeded
into any database. No copyrighted song or recording is included.

- `mpeg1-cbr.mp3`: 220 Hz, 44.1 kHz stereo, 128 kbit/s MPEG1 Layer III, ID3v2.3.
- `mpeg2-vbr.mp3`: 330 Hz, 22.05 kHz mono, VBR MPEG2 Layer III, ID3v2.4.
- `mpeg25-cbr.mp3`: 440 Hz, 8 kHz mono, 24 kbit/s MPEG2.5 Layer III, no tags.

Each source signal lasts 0.45 seconds; encoded duration includes encoder padding.
The committed fixtures make test execution independent of FFmpeg installation.
JPEG fixtures are synthesized in the test with the same production image decoder.
