#!/usr/bin/env python3
"""Build a full-length Chinese narration track and mux it with the licensed source video."""

import argparse
import audioop
import array
import json
import pathlib
import subprocess
import wave


SAMPLE_RATE = 16000


def duration_seconds(label):
    minutes, seconds = label.split(":", 1)
    return int(minutes) * 60 + float(seconds)


def decode_audio(ffmpeg, filename):
    if filename.suffix.lower() == ".wav":
        with wave.open(str(filename), "rb") as source:
            if source.getnchannels() != 1 or source.getsampwidth() != 2:
                raise ValueError(f"{filename.name} 必须是 16-bit 单声道 WAV")
            frames = source.readframes(source.getnframes())
            if source.getframerate() != SAMPLE_RATE:
                frames, _ = audioop.ratecv(
                    frames, 2, 1, source.getframerate(), SAMPLE_RATE, None
                )
            return array.array("h", frames)
    command = [
        ffmpeg, "-hide_banner", "-loglevel", "error", "-i", str(filename),
        "-f", "s16le", "-ac", "1", "-ar", str(SAMPLE_RATE), "-"
    ]
    return array.array("h", subprocess.check_output(command))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True)
    parser.add_argument("--narration-dir", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--ffmpeg", default="ffmpeg")
    args = parser.parse_args()

    narration_dir = pathlib.Path(args.narration_dir)
    timeline = json.loads((narration_dir / "timeline.json").read_text(encoding="utf-8"))
    total_samples = int(duration_seconds(timeline["sourceDuration"]) * SAMPLE_RATE)
    track = array.array("h", [0]) * total_samples

    for item in timeline["items"]:
        speech = decode_audio(args.ffmpeg, narration_dir / item["filename"])
        start = int(float(item["atSeconds"]) * SAMPLE_RATE)
        end = min(total_samples, start + len(speech))
        track[start:end] = speech[: end - start]

    wav_path = narration_dir / "yoga-cn-narration.wav"
    with wave.open(str(wav_path), "wb") as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(SAMPLE_RATE)
        output.writeframes(track.tobytes())

    subprocess.run([
        args.ffmpeg, "-hide_banner", "-y", "-i", args.source, "-i", str(wav_path),
        "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-c:a", "aac",
        "-b:a", "96k", "-movflags", "+faststart", "-shortest", args.output
    ], check=True)


if __name__ == "__main__":
    main()
