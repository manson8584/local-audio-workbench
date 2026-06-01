# Local Audio Workbench

Local Audio Workbench is a local-first macOS audio conversion tool for personal, unencrypted audio files.

It runs a small web app on your own machine and calls FFmpeg locally. Nothing is uploaded to a cloud service.

## What It Does

- Converts a single file or a whole folder
- Supports MP3, FLAC, M4A, AAC, WAV, AIFF, OGG, and OPUS input
- Outputs MP3, FLAC, ALAC, WAV, AAC, or OGG
- Runs at `http://127.0.0.1:4178`
- Keeps the legal boundary clear and blocks protected/cache formats

## Important Boundary

This project does not remove DRM, decrypt music-service cache files, or convert protected downloads from music platforms.

Blocked examples include `.ncm`, `.qmc`, `.mflac`, and `.mgg`.

## Requirements

- macOS
- Node.js 18+
- FFmpeg

Install FFmpeg with Homebrew:

```sh
brew install ffmpeg
```

## Usage

```sh
npm install
npm start
```

Open:

```text
http://127.0.0.1:4178
```

Then enter:

- Input file or folder path, such as `~/Music/source`
- Output folder path, such as `~/Music/converted`
- Output format

## Why Local-First

Audio conversion often involves private recordings, personal music libraries, or work-in-progress podcast assets. Running locally keeps those files on your own machine.

## License

MIT
