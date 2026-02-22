<script>
  import { onMount, onDestroy } from 'svelte';

  const melody = [
    'G4', 'G4', 'A4', 'G4', 'C5', 'B4',
    'G4', 'G4', 'A4', 'G4', 'D5', 'C5',
    'G4', 'G4', 'G5', 'E5', 'C5', 'B4', 'A4',
    'F5', 'F5', 'E5', 'C5', 'D5', 'C5'
  ];

  const rhythm = [
    1, 1, 2, 2, 2, 4,
    1, 1, 2, 2, 2, 4,
    1, 1, 2, 2, 2, 2, 4,
    1, 1, 2, 2, 2, 4
  ];

  const beatGap = 2;
  const slotWidthInBeats = 1.25;
  const hitWindow = 0.42;
  const beatsPerSecond = 2.1;

  let slots = [];
  let statusText = 'Press Space on the beat';
  let activeBeat = 0;
  let totalBeats = 0;
  let rafId;
  let startTime = 0;
  let finished = false;
  let correctCount = 0;

  function buildSlots() {
    let cursor = 2;
    slots = melody.map((pitch, index) => {
      const duration = rhythm[index];
      const atBeat = cursor;
      cursor += duration + beatGap;
      return {
        index,
        pitch,
        duration,
        atBeat,
        state: 'pending'
      };
    });

    totalBeats = cursor + 2;
  }

  function rarityOrder() {
    const freq = new Map();
    for (const note of melody) {
      freq.set(note, (freq.get(note) || 0) + 1);
    }

    return [...slots]
      .sort((a, b) => {
        const freqDiff = (freq.get(a.pitch) || 0) - (freq.get(b.pitch) || 0);
        if (freqDiff !== 0) return freqDiff;
        return a.index - b.index;
      })
      .map(slot => slot.index);
  }

  $: revealOrder = rarityOrder();
  $: revealedIndices = new Set(revealOrder.slice(0, correctCount));

  function restart() {
    buildSlots();
    correctCount = 0;
    statusText = 'Press Space on the beat';
    finished = false;
    startTime = performance.now();
    activeBeat = 0;
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(tick);
  }

  function nextPendingIndex() {
    return slots.findIndex(slot => slot.state === 'pending');
  }

  function handleSpace(event) {
    if (event.code !== 'Space') return;
    event.preventDefault();
    if (finished) return;

    const targetIndex = nextPendingIndex();
    if (targetIndex === -1) return;

    const target = slots[targetIndex];
    const offset = Math.abs(activeBeat - target.atBeat);

    if (offset <= hitWindow) {
      slots[targetIndex] = { ...target, state: 'confirmed' };
      slots = [...slots];
      correctCount += 1;
      statusText = `Nice! ${correctCount}/${slots.length} confirmed.`;

      if (correctCount === slots.length) {
        finished = true;
        statusText = '🎉 Happy Birthday unlocked!';
      }
    } else {
      statusText = 'Too early/late — keep the groove going.';
    }
  }

  function tick(now) {
    if (!startTime) startTime = now;
    const elapsedSeconds = (now - startTime) / 1000;
    activeBeat = elapsedSeconds * beatsPerSecond;

    let updates = false;
    slots = slots.map(slot => {
      if (slot.state !== 'pending') return slot;
      if (activeBeat > slot.atBeat + hitWindow) {
        updates = true;
        return { ...slot, state: 'missed' };
      }
      return slot;
    });

    if (updates) {
      const pending = slots.some(slot => slot.state === 'pending');
      if (!pending) {
        finished = true;
        statusText = `Song ended. Confirmed ${correctCount}/${slots.length}.`;
      }
    }

    if (!finished && activeBeat <= totalBeats) {
      rafId = requestAnimationFrame(tick);
    } else if (!finished) {
      finished = true;
      statusText = `Time! Confirmed ${correctCount}/${slots.length}.`;
    }
  }

  function beatToPercent(beat) {
    if (!totalBeats) return 0;
    const percent = (beat / totalBeats) * 100;
    return Math.min(100, Math.max(0, percent));
  }

  function slotStyle(slot) {
    const left = beatToPercent(slot.atBeat);
    const width = beatToPercent(slotWidthInBeats);
    return `left:${left}%; width:${width}%; background:${slotFill(slot)};`;
  }

  function indicatorStyle() {
    return `left:${beatToPercent(activeBeat)}%;`;
  }

  function slotFill(slot) {
    if (slot.state !== 'confirmed') return 'transparent';
    if (!revealedIndices.has(slot.index)) return 'rgba(130, 220, 255, 0.45)';

    const hue = 180 + (slot.index * 17) % 120;
    return `hsl(${hue}deg 82% 62%)`;
  }

  onMount(() => {
    restart();
    window.addEventListener('keydown', handleSpace, { passive: false });
  });

  onDestroy(() => {
    cancelAnimationFrame(rafId);
    window.removeEventListener('keydown', handleSpace);
  });
</script>

<div class="birthday-mode">
  <h2>🎂 Birthday Mode</h2>
  <p>{statusText}</p>
  <div class="track">
    {#each slots as slot}
      <div
        class="slot {slot.state}"
        style={slotStyle(slot)}
      >
        {#if slot.state === 'confirmed' && revealedIndices.has(slot.index)}
          <span>{slot.pitch}</span>
        {/if}
      </div>
    {/each}
    <div class="indicator" style={indicatorStyle()}></div>
  </div>

  <button on:click={restart}>Restart</button>
</div>

<style>
  .birthday-mode {
    width: 100%;
    min-height: calc(100vh - 120px);
    padding: 20px;
    color: #f2f7ff;
    background: radial-gradient(circle at top, #23193f 0%, #0f101f 60%, #080910 100%);
    overflow-x: hidden;
    box-sizing: border-box;
  }

  .track {
    position: relative;
    height: 86px;
    margin: 24px 0;
    width: min(100%, 1200px);
    border-radius: 20px;
    background-image:
      repeating-linear-gradient(
        to right,
        rgba(255,255,255,0.08) 0,
        rgba(255,255,255,0.08) 1px,
        transparent 1px,
        transparent 12.5%
      );
    border: 1px solid rgba(255, 255, 255, 0.18);
  }

  .slot {
    position: absolute;
    top: 20px;
    height: 46px;
    border: 1px solid rgba(194, 232, 255, 0.7);
    border-radius: 13px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.2s ease;
  }

  .slot.missed {
    border-color: rgba(255, 145, 145, 0.35);
  }

  .slot span {
    color: #071423;
    font-weight: 700;
    font-size: 0.72rem;
    letter-spacing: 0.04em;
  }

  .indicator {
    position: absolute;
    top: 8px;
    bottom: 8px;
    width: 3px;
    transform: translateX(-50%);
    border-radius: 999px;
    background: #ffd670;
    box-shadow: 0 0 14px #ffd670;
  }

  button {
    border: 1px solid #7987ff;
    background: #2e3a87;
    color: #fff;
    border-radius: 8px;
    padding: 8px 14px;
    cursor: pointer;
  }
</style>
