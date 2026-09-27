#!/bin/sh
# Averages the key numbers of several seeded headless runs: sh tools/bench.sh [seconds] [runs]
secs=${1:-300}; runs=${2:-4}
for i in $(seq 1 $runs); do node "$(dirname "$0")/headless.mjs" $secs $i 32; done | awk '
/^regular +deaths/{rd+=$3; rl+=$5; n++}
/^newbie /{nd+=$3}
/^casual /{cd+=$3}
/^killer /{kd+=$3}
/^grazer /{gd+=$3}
/regulars in top-5/{t+=$4}
/nearest-head/{nn+=$4; gsub(/[~)]/,"",$9); un+=$9}
END{printf "deaths/min  regular %.2f  killer %.2f  grazer %.2f  casual %.2f  newbie %.2f\nregulars in top-5 %.2f   nearest-head %.0f vs uniform %.0f\n", rd/n, kd/n, gd/n, cd/n, nd/n, t/n, nn/n, un/n}'
