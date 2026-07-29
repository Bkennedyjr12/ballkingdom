#!/usr/bin/env bash
# Assemble a local-only review master from the approved fresh r3 animatic.
# This script deliberately has no narration/video generation, provider,
# browser, credential, or upload path.

set -euo pipefail

package_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source_animatic="$package_dir/ecosystem-animatic.mp4"
r3_dir="$package_dir/narration/r3-authorized"
output_dir="$package_dir/final-review"
master="$output_dir/ballers-kingdom-ecosystem-review.mp4"
thumbnail="$output_dir/ballers-kingdom-ecosystem-review-thumb.png"
frames_dir="$output_dir/.contact-sheet-frames"
contact_sheet="$output_dir/ballers-kingdom-ecosystem-review-contact-sheet.png"

[[ -f "$source_animatic" ]] || { echo "Missing approved r3 animatic: $source_animatic" >&2; exit 2; }
[[ -f "$r3_dir/authorized-clone-manifest.json" ]] || { echo "Missing r3 narration manifest." >&2; exit 2; }

# This hard gate rejects r1/r2/default narration paths and validates the
# authorized Brian reference, pinned runtime, locked contract, all beat WAVs,
# the 70-second r3 narration master, and its manifest digests.
python3 "$package_dir/validate_authorized_narration.py" --narration-dir "$r3_dir"
python3 "$package_dir/validate_stock_assets.py"

source_probe="$(ffprobe -v error -show_entries stream=codec_type,codec_name,width,height,r_frame_rate:format=duration -of json "$source_animatic")"
node -e '
  const probe = JSON.parse(process.argv[1]);
  const video = probe.streams.find((stream) => stream.codec_type === "video");
  const audio = probe.streams.find((stream) => stream.codec_type === "audio");
  if (!video || !audio || video.codec_name !== "h264" || audio.codec_name !== "aac") process.exit(2);
  if (video.width !== 1920 || video.height !== 1080 || video.r_frame_rate !== "24/1") process.exit(3);
  if (Math.abs(Number(probe.format.duration) - 70) > 1 / 24 + 0.001) process.exit(4);
' "$source_probe"

mkdir -p "$output_dir" "$frames_dir"

# The approved animatic already contains the manifest-timed post-composited
# captions and local r3 narration. Re-encode only for the review-master
# delivery profile; no imagery, caption, or narration is newly generated.
ffmpeg -hide_banner -y -i "$source_animatic" \
  -map 0:v:0 -map 0:a:0 -map_metadata -1 \
  -vf "fps=24,scale=1920:1080:flags=lanczos,format=yuv420p" \
  -af "aresample=48000" -t 70 -r 24 \
  -c:v libx264 -preset medium -crf 18 -movflags +faststart \
  -c:a aac -b:a 192k -ac 2 \
  "$master"

for index in 1 2 3 4 5 6 7; do
  case "$index" in
    1) timestamp=1 ;;
    2) timestamp=17 ;;
    3) timestamp=35 ;;
    4) timestamp=45 ;;
    5) timestamp=57 ;;
    6) timestamp=65 ;;
    7) timestamp=68 ;;
  esac
  ffmpeg -hide_banner -loglevel error -y -ss "$timestamp" -i "$master" -frames:v 1 "$frames_dir/0$index.png"
done
ffmpeg -hide_banner -loglevel error -y -ss 65 -i "$master" -frames:v 1 -update 1 "$thumbnail"
ffmpeg -hide_banner -loglevel error -y -framerate 1 -i "$frames_dir/%02d.png" \
  -vf "tile=4x2:padding=8:margin=8:color=0x071525" -frames:v 1 -update 1 "$contact_sheet"

printf 'Local review master rendered from approved r3 animatic only:\n%s\n%s\n' "$master" "$contact_sheet"
