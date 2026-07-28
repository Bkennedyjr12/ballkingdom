#!/usr/bin/env bash
# Render a local-only 70-second review animatic. This script does not invoke a
# generation provider, cloud service, credential store, browser, or uploader.

set -euo pipefail

package_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$package_dir/../.." && pwd)"
contract="$package_dir/narration_contract.json"
shotlist="$package_dir/shotlist.json"
captions="$package_dir/narration/narration.srt"
graphics_dir="$package_dir/.review-graphics"
frames_dir="$package_dir/review-frames"
master="$package_dir/ecosystem-animatic.mp4"
thumbnail="$package_dir/ecosystem-animatic-thumb.png"
anchor="$repo_root/assets/img/brian_coach_clean_anchor_v2.png"
stock="$repo_root/video/ballers-kingdom-standard-starts-here/stock/pexels-6084027.mp4"
narration="$package_dir/narration/narration.wav"

print_timing() {
  node -e '
    const contract = require(process.argv[1]);
    process.stdout.write(`${JSON.stringify({ runtime_seconds: contract.runtime_seconds, beats: contract.beats.map(({ id, start_seconds, duration_seconds }) => ({ id, start_seconds, duration_seconds })) })}\n`);
  ' "$contract"
}

if [[ "${1:-}" == "--print-timing" ]]; then
  print_timing
  exit 0
fi

[[ -f "$anchor" ]] || { echo "Missing approved Brian continuity anchor." >&2; exit 2; }
[[ -f "$stock" ]] || { echo "Missing registered soccer stock." >&2; exit 2; }
python3 "$package_dir/validate_stock_assets.py"
python3 "$package_dir/generate_captions.py"
node "$package_dir/render_graphics.mjs" "$graphics_dir"

node -e '
  const contract = require(process.argv[1]);
  const shotlist = require(process.argv[2]);
  const beats = contract.beats;
  if (contract.runtime_seconds !== 70 || beats.reduce((sum, beat) => sum + beat.duration_seconds, 0) !== 70) process.exit(2);
  if (JSON.stringify(shotlist.map(({ beat_id }) => beat_id)) !== JSON.stringify(beats.map(({ id }) => id))) process.exit(3);
  if (JSON.stringify(shotlist.map(({ start_seconds, duration_seconds }) => [start_seconds, duration_seconds])) !== JSON.stringify(beats.map(({ start_seconds, duration_seconds }) => [start_seconds, duration_seconds]))) process.exit(4);
' "$contract" "$shotlist"

# Brian frames remain an unchanged approved continuity reference. The two stock
# beats show generic soccer only; no on-screen wording identifies participants.
input_args=(
  -loop 1 -framerate 24 -t 16 -i "$anchor"
  -loop 1 -framerate 24 -t 18 -i "$anchor"
  -stream_loop -1 -t 22 -i "$stock"
  -stream_loop -1 -t 8 -i "$stock"
  -loop 1 -framerate 24 -t 6 -i "$anchor"
)
graphic_durations=(16 18 22 8 6)
for index in 0 1 2 3 4; do
  input_args+=( -loop 1 -framerate 24 -t "${graphic_durations[$index]}" -i "$graphics_dir/beat-$((index + 1)).png" )
done

video_filters=(
  "[0:v]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,zoompan=z='min(zoom+0.00011,1.045)':d=1:s=1920x1080:fps=24,trim=duration=16,setpts=PTS-STARTPTS[base0]"
  "[1:v]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,zoompan=z='min(zoom+0.00008,1.032)':d=1:s=1920x1080:fps=24,trim=duration=18,setpts=PTS-STARTPTS[base1]"
  "[2:v]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,trim=duration=22,setpts=PTS-STARTPTS[base2]"
  "[3:v]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,trim=duration=8,setpts=PTS-STARTPTS[base3]"
  "[4:v]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,zoompan=z='max(1.0,1.030-0.00010*on)':d=1:s=1920x1080:fps=24,trim=duration=6,setpts=PTS-STARTPTS[base4]"
)
for index in 0 1 2 3 4; do
  graphic_input=$((index + 5))
  video_filters+=("[$graphic_input:v]scale=1920:1080,format=rgba[graphic$index]")
  video_filters+=("[base$index][graphic$index]overlay=shortest=1,format=yuv420p[scene$index]")
done
# Homebrew's FFmpeg build does not include the libass subtitles filter. The
# graphics renderer validates the generated SRT against the locked contract and
# rasterizes those captions as post-production typography before this assembly.
video_filters+=("[scene0][scene1][scene2][scene3][scene4]concat=n=5:v=1:a=0,format=yuv420p[video]")

# A deterministic non-vocal music/room-tone bed continues through the CTA. A
# narration master is mixed only when the Task 2 generator has produced and
# validated it; the render never substitutes another voice or provider.
music="aevalsrc=0.018*sin(2*PI*55*t)+0.009*sin(2*PI*110*t)+0.004*sin(2*PI*220*t):s=48000:d=70"
audio_args=( -f lavfi -i "$music" )
audio_index=10
audio_filter="[$audio_index:a]aformat=sample_rates=48000:channel_layouts=stereo,afade=t=out:st=68:d=2[bed]"
audio_map="[bed]"
if [[ -f "$narration" ]] && ffprobe -v error -show_entries format=format_name,duration -of json "$narration" | node -e '
  let raw = ""; process.stdin.on("data", chunk => raw += chunk); process.stdin.on("end", () => { const f = JSON.parse(raw).format; process.exit(f.format_name === "wav" && Math.abs(Number(f.duration) - 70) <= 0.01 ? 0 : 1); });
'; then
  audio_args+=( -i "$narration" )
  narration_index=11
  audio_filter+=";[$narration_index:a]aformat=sample_rates=48000:channel_layouts=stereo,volume=1.18[voice];[bed][voice]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.90[audio]"
  audio_map="[audio]"
  echo "Validated local authorized narration master included."
else
  echo "No validated local narration master available; rendering music-only review animatic without a substitute voice." >&2
fi

filter_graph="$(IFS=';'; echo "${video_filters[*]}");$audio_filter"
ffmpeg -hide_banner -y "${input_args[@]}" "${audio_args[@]}" \
  -filter_complex "$filter_graph" \
  -map '[video]' -map "$audio_map" \
  -t 70 -r 24 -c:v libx264 -pix_fmt yuv420p -movflags +faststart \
  -c:a aac -b:a 192k "$master"

mkdir -p "$frames_dir"
for timestamp in 1 8 15 17 25 33 35 45 55 57 62 68; do
  ffmpeg -hide_banner -loglevel error -y -ss "$timestamp" -i "$master" -frames:v 1 "$frames_dir/${timestamp}s.png"
done
ffmpeg -hide_banner -loglevel error -y -ss 65 -i "$master" -frames:v 1 -update 1 "$thumbnail"
printf 'Rendered local-only review animatic (not public, not final):\n%s\n%s\n' "$master" "$frames_dir"
