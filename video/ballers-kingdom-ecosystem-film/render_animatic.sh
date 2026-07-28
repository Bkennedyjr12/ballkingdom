#!/usr/bin/env bash
# Render a local-only 70-second review animatic. This script does not invoke a
# generation provider, cloud service, credential store, browser, or uploader.

set -euo pipefail

package_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$package_dir/../.." && pwd)"
contract="$package_dir/narration_contract.json"
shotlist="$package_dir/shotlist.json"
graphics_dir="$package_dir/.review-graphics"
frames_dir="$package_dir/review-frames"
master="$package_dir/ecosystem-animatic.mp4"
thumbnail="$package_dir/ecosystem-animatic-thumb.png"
anchor="$repo_root/assets/img/brian_coach_clean_anchor_v2.png"
stock="$repo_root/video/ballers-kingdom-standard-starts-here/stock/pexels-6084027.mp4"
narration_dir="${BALLERS_NARRATION_DIR:-$package_dir/narration}"
narration="$narration_dir/narration.wav"
manifest="$narration_dir/authorized-clone-manifest.json"

print_timing() {
  node -e '
    const contract = require(process.argv[1]);
    process.stdout.write(JSON.stringify({ runtime_seconds: contract.runtime_seconds, beats: contract.beats.map(({ id, start_seconds, duration_seconds }) => ({ id, start_seconds, duration_seconds })) }) + "\n");
  ' "$contract"
}

if [[ "${1:-}" == "--print-timing" ]]; then
  print_timing
  exit 0
fi

[[ -f "$anchor" ]] || { echo "Missing approved Brian continuity anchor." >&2; exit 2; }
[[ -f "$stock" ]] || { echo "Missing registered soccer stock." >&2; exit 2; }
python3 "$package_dir/validate_stock_assets.py"

has_authorized_narration=0
if [[ -f "$narration" ]]; then
  [[ -f "$manifest" ]] || { echo "Narration exists without provenance manifest; refusing to mix it." >&2; exit 2; }
  python3 "$package_dir/validate_authorized_narration.py" --narration-dir "$narration_dir"
  python3 "$package_dir/generate_captions.py" --output-dir "$narration_dir" --manifest "$manifest"
  has_authorized_narration=1
  echo "Validated authorized local narration master included."
else
  python3 "$package_dir/generate_captions.py" --output-dir "$narration_dir"
  echo "No authorized narration master available; rendering music-only local review animatic without a substitute voice." >&2
fi
node "$package_dir/render_graphics.mjs" "$graphics_dir" "$narration_dir"

node -e '
  const contract = require(process.argv[1]);
  const shotlist = require(process.argv[2]);
  const beats = contract.beats;
  if (contract.runtime_seconds !== 70 || beats.reduce((sum, beat) => sum + beat.duration_seconds, 0) !== 70) process.exit(2);
  if (JSON.stringify(shotlist.map(({ beat_id }) => beat_id)) !== JSON.stringify(beats.map(({ id }) => id))) process.exit(3);
  if (JSON.stringify(shotlist.map(({ start_seconds, duration_seconds }) => [start_seconds, duration_seconds])) !== JSON.stringify(beats.map(({ start_seconds, duration_seconds }) => [start_seconds, duration_seconds]))) process.exit(4);
' "$contract" "$shotlist"

# Brian frames remain an unchanged approved continuity reference. The generic
# soccer cutaways are never identified as Ballers Kingdom people or events.
# The community input starts twelve seconds later in registered stock so it
# cannot visibly restart the verified-paths opening.
input_args=(
  -loop 1 -framerate 24 -t 16 -i "$anchor"
  -loop 1 -framerate 24 -t 18 -i "$anchor"
  -stream_loop -1 -t 22 -i "$stock"
  -ss 12 -stream_loop -1 -t 8 -i "$stock"
  -loop 1 -framerate 24 -t 6 -i "$anchor"
)
for index in 1 2 3 4 5; do
  input_args+=( -loop 1 -framerate 24 -t 70 -i "$graphics_dir/chapter-$index.png" )
done
mapfile -t cue_times < <(node -e '
  const cues = require(process.argv[1]);
  for (const cue of cues) console.log(cue.start_seconds + " " + cue.end_seconds);
' "$narration_dir/caption-cues.json")
for index in "${!cue_times[@]}"; do
  input_args+=( -loop 1 -framerate 24 -t 70 -i "$graphics_dir/cue-$((index + 1)).png" )
done

video_filters=(
  "[0:v]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,zoompan=z='min(zoom+0.00011,1.045)':d=1:s=1920x1080:fps=24,trim=duration=16,setpts=PTS-STARTPTS[base0]"
  "[1:v]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,zoompan=z='min(zoom+0.00008,1.032)':d=1:s=1920x1080:fps=24,trim=duration=18,setpts=PTS-STARTPTS[base1]"
  "[2:v]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,trim=duration=22,setpts=PTS-STARTPTS[base2]"
  "[3:v]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,trim=duration=8,setpts=PTS-STARTPTS[base3]"
  "[4:v]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,zoompan=z='max(1.0,1.030-0.00010*on)':d=1:s=1920x1080:fps=24,trim=duration=6,setpts=PTS-STARTPTS[base4]"
  "[base0][base1][base2][base3][base4]concat=n=5:v=1:a=0,format=yuv420p[base]"
)
previous="[base]"
beat_starts=(0 16 34 56 64)
beat_ends=(16 34 56 64 70)
for index in 0 1 2 3 4; do
  graphic_input=$((index + 5))
  output="[chapter$index]"
  video_filters+=("[$graphic_input:v]scale=1920:1080,format=rgba$output")
  next="[chapter_scene$index]"
  video_filters+=("${previous}${output}overlay=enable='between(t,${beat_starts[$index]},${beat_ends[$index]})':eof_action=pass,format=yuv420p${next}")
  previous="$next"
done
for index in "${!cue_times[@]}"; do
  read -r cue_start cue_end <<< "${cue_times[$index]}"
  graphic_input=$((10 + index))
  output="[cue$index]"
  video_filters+=("[$graphic_input:v]scale=1920:1080,format=rgba$output")
  next="[cue_scene$index]"
  video_filters+=("${previous}${output}overlay=enable='between(t,$cue_start,$cue_end)':eof_action=pass,format=yuv420p${next}")
  previous="$next"
done
video_filters+=("${previous}format=yuv420p[video]")

music="aevalsrc=0.018*sin(2*PI*55*t)+0.009*sin(2*PI*110*t)+0.004*sin(2*PI*220*t):s=48000:d=70"
audio_args=( -f lavfi -i "$music" )
audio_index=$((10 + ${#cue_times[@]}))
audio_filter="[$audio_index:a]aformat=sample_rates=48000:channel_layouts=stereo,afade=t=out:st=68:d=2[bed]"
audio_map="[bed]"
if [[ "$has_authorized_narration" == "1" ]]; then
  narration_index=$((audio_index + 1))
  audio_args+=( -i "$narration" )
  audio_filter+=";[$narration_index:a]aformat=sample_rates=48000:channel_layouts=stereo,volume=1.18[voice];[bed][voice]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.90[audio]"
  audio_map="[audio]"
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
