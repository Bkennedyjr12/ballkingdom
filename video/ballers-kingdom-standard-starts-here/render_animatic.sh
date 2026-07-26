#!/usr/bin/env bash
# Render the no-cost, local-only review animatic. This renderer never calls a
# provider, browser, credential store, uploader, or voice-generation service.

set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
package_dir="$project_root/video/ballers-kingdom-standard-starts-here"
frames_dir="$package_dir/.review-graphics"
master="$package_dir/standard-starts-here-animatic.mp4"
thumbnail="$package_dir/standard-starts-here-animatic-thumb.png"
contract="$package_dir/locked_scene_contract.json"

print_timing() {
  node -e '
    const contract = require(process.argv[1]);
    const schedule = contract.scenes.map(({ id, start_seconds, duration_seconds }) => ({ id, start_seconds, duration_seconds }));
    const finalEnd = schedule.at(-1).start_seconds + schedule.at(-1).duration_seconds;
    process.stdout.write(`${JSON.stringify({ runtime_seconds: contract.runtime_seconds, final_end_seconds: finalEnd, schedule })}\n`);
  ' "$contract"
}

if [[ "${1:-}" == "--print-timing" ]]; then
  print_timing
  exit 0
fi

python3 "$package_dir/package_contract_test.py"
node "$package_dir/render_animatic_graphics.mjs" "$frames_dir"

scene_rows=()
while IFS= read -r scene_row; do
  scene_rows+=("$scene_row")
done < <(node -e '
  const contract = require(process.argv[1]);
  let expectedStart = 0;
  for (const scene of contract.scenes) {
    if (scene.start_seconds !== expectedStart || !Number.isInteger(scene.duration_seconds) || scene.duration_seconds <= 0) process.exit(2);
    console.log([scene.number, scene.id, scene.start_seconds, scene.duration_seconds].join("|"));
    expectedStart += scene.duration_seconds;
  }
  if (expectedStart !== contract.runtime_seconds) process.exit(3);
' "$contract")

[[ ${#scene_rows[@]} -eq 5 ]] || { echo 'Expected five locked animatic scenes.' >&2; exit 4; }

ffmpeg_inputs=()
video_filters=()
concat_inputs=""
runtime_seconds=0
for scene_index in "${!scene_rows[@]}"; do
  IFS='|' read -r scene_number scene_id start_seconds duration_seconds <<< "${scene_rows[$scene_index]}"
  [[ "$scene_number" -eq $((scene_index + 1)) && "$start_seconds" -eq "$runtime_seconds" ]] || { echo "Invalid scene boundary: $scene_id" >&2; exit 5; }
  case "$scene_id" in
    arrival) motion="zoompan=z='min(1+0.00024*on,1.045)':x='(iw-iw/zoom)*0.25':y='(ih-ih/zoom)*0.70'" ;;
    correction) motion="zoompan=z='min(1+0.00023*on,1.050)':x='(iw-iw/zoom)*0.50':y='(ih-ih/zoom)*0.32'" ;;
    pressure) motion="zoompan=z='min(1+0.00018*on,1.040)':x='(iw-iw/zoom)*(0.18+0.64*on/${duration_seconds}*24)':y='(ih-ih/zoom)*0.50'" ;;
    connection) motion="zoompan=z='min(1+0.00007*on,1.016)':x='(iw-iw/zoom)*0.50':y='(ih-ih/zoom)*0.50'" ;;
    invitation) motion="zoompan=z='max(1.0,1.045-0.00020*on)':x='(iw-iw/zoom)*0.50':y='(ih-ih/zoom)*0.50'" ;;
    *) echo "Unknown locked scene: $scene_id" >&2; exit 6 ;;
  esac
  ffmpeg_inputs+=( -loop 1 -framerate 24 -t "$duration_seconds" -i "$frames_dir/scene-$scene_number.png" )
  video_filters+=( "[$scene_index:v]$motion:d=1:s=1280x720:fps=24,trim=duration=$duration_seconds,setpts=PTS-STARTPTS[s$scene_number]" )
  concat_inputs+="[s$scene_number]"
  runtime_seconds=$((runtime_seconds + duration_seconds))
done

[[ "$runtime_seconds" -eq 45 ]] || { echo "Locked runtime must be 45 seconds; got $runtime_seconds." >&2; exit 7; }
fade_start=$(node -e 'process.stdout.write(String(Number(process.argv[1]) - 1.5))' "$runtime_seconds")
filter_graph="$(IFS=';'; echo "${video_filters[*]}");${concat_inputs}concat=n=${#scene_rows[@]}:v=1:a=0,format=yuv420p[v]"

# The audio is original deterministic synthesis: a non-vocal pulse and seeded
# pink-noise field air. It stays audible through the CTA, then fades 43.5–45s.
ffmpeg -hide_banner -y \
  "${ffmpeg_inputs[@]}" \
  -f lavfi -i "aevalsrc=0.040*sin(2*PI*53*t)+0.020*sin(2*PI*106*t)+0.009*sin(2*PI*318*t)*pow(sin(2*PI*1.5*t)\\,8):s=48000:d=$runtime_seconds" \
  -f lavfi -i "anoisesrc=color=pink:amplitude=0.10:seed=60126:r=48000:d=$runtime_seconds" \
  -filter_complex "
    $filter_graph;
    [${#scene_rows[@]}:a]aformat=sample_rates=48000:channel_layouts=stereo,volume=0.72[pulse];
    [$(( ${#scene_rows[@]} + 1 )):a]highpass=f=180,lowpass=f=3200,aformat=sample_rates=48000:channel_layouts=stereo,volume=0.13[air];
    [pulse][air]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.88,afade=t=out:st=$fade_start:d=1.5[a]
  " \
  -map '[v]' -map '[a]' \
  -c:v libx264 -pix_fmt yuv420p -r 24 -movflags +faststart \
  -c:a aac -b:a 192k \
  "$master"

ffmpeg -hide_banner -y -ss 00:00:40 -i "$master" -frames:v 1 -update 1 "$thumbnail"
printf 'Rendered local-only animatic (not a public or final master):\n%s\n%s\n' "$master" "$thumbnail"
