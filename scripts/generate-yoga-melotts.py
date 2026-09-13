#!/usr/bin/env python3
"""Generate the Chinese yoga cue WAVs with the optional MIT-licensed MeloTTS toolchain."""

import argparse
import json
import pathlib
import subprocess

from melo.api import TTS


def load_segments(repository, node):
    expression = (
        "JSON.stringify(require('./server/src/compound-system')"
        ".DAILY_YOGA_PRACTICE.segments)"
    )
    payload = subprocess.check_output(
        [node, "-p", expression], cwd=repository, text=True
    )
    return json.loads(payload)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True)
    parser.add_argument("--node", default="node")
    parser.add_argument("--speed", type=float, default=0.92)
    args = parser.parse_args()

    repository = pathlib.Path(__file__).resolve().parents[1]
    output = pathlib.Path(args.output).resolve()
    output.mkdir(parents=True, exist_ok=True)
    model = TTS(language="ZH", device="cpu")
    speakers = vars(model.hps.data.spk2id)
    speaker = speakers.get("ZH", next(iter(speakers.values())))
    timeline = []

    for segment in load_segments(repository, args.node):
        for index, caption in enumerate(segment["captions"], 1):
            filename = f"{segment['id']}-{index:02d}.wav"
            model.tts_to_file(
                caption["zh"],
                speaker,
                str(output / filename),
                speed=args.speed,
                quiet=True,
            )
            timeline.append({
                "filename": filename,
                "atSeconds": segment["startSeconds"] + caption["atSeconds"],
                "text": caption["zh"],
            })
            print(f"generated {filename}", flush=True)

    (output / "timeline.json").write_text(
        json.dumps({
            "sourceDuration": "24:18",
            "model": "myshell-ai/MeloTTS-Chinese",
            "items": timeline,
        }, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
