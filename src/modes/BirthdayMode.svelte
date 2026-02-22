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

  const beatGap = 0.5;
  const slotWidthInBeats = 1.25;
  const hitWindow = 0.42;
  const beatsPerSecond = 6.5;

  let slots = [];
  let statusText = 'Press Space on the beat';
  let activeBeat = 0;
  let totalBeats = 0;
  let timerId;
  let startTime = 0;
  let correctCount = 0;
  let gameCompleted = false;
  let showFinishEffect = false;
  let audioContext;
  let audioUnlocked = false;
  let lastMetronomeBeat = -1;

  const pitchToHz = {
    C4: 261.63,
    D4: 293.66,
    E4: 329.63,
    F4: 349.23,
    G4: 392,
    A4: 440,
    B4: 493.88,
    C5: 523.25,
    D5: 587.33,
    E5: 659.25,
    F5: 698.46,
    G5: 783.99
  };

  const accompanimentChords = [
    ['G4', 'B4', 'D5'],
    ['G4', 'B4', 'D5'],
    ['D4', 'A4', 'D5'],
    ['G4', 'B4', 'D5'],
    ['C4', 'G4', 'E5'],
    ['G4', 'B4', 'D5'],
    ['G4', 'B4', 'D5'],
    ['G4', 'B4', 'D5'],
    ['D4', 'A4', 'D5'],
    ['G4', 'B4', 'D5'],
    ['D4', 'A4', 'F5'],
    ['C4', 'G4', 'E5'],
    ['G4', 'B4', 'D5'],
    ['G4', 'B4', 'D5'],
    ['E4', 'B4', 'G5'],
    ['C4', 'G4', 'E5'],
    ['C4', 'G4', 'E5'],
    ['G4', 'B4', 'D5'],
    ['D4', 'A4', 'D5'],
    ['D4', 'A4', 'F5'],
    ['D4', 'A4', 'F5'],
    ['C4', 'G4', 'E5'],
    ['C4', 'G4', 'E5'],
    ['D4', 'A4', 'D5'],
    ['C4', 'G4', 'E5']
  ];

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
        state: 'pending',
        played: false
      };
    });

    totalBeats = cursor + 1;
  }

  function resetLoop(now = performance.now()) {
    startTime = now;
    activeBeat = 0;
    lastMetronomeBeat = -1;
    slots = slots.map(slot => {
      if (slot.state === 'confirmed') {
        return { ...slot, played: false };
      }
      return {
        ...slot,
        state: gameCompleted ? slot.state : 'pending',
        played: false
      };
    });
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

  function ensureAudioContext() {
    if (!audioContext) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      audioContext = new Ctx();
    }
    if (audioContext.state === 'suspended') {
      audioContext.resume().catch(() => {});
    }
    return audioContext;
  }

  function playVoice(ctx, frequency, {
    wave = 'triangle',
    peak = 0.08,
    attack = 0.008,
    sustain = 0.11,
    release = 0.24,
    detune = 0
  } = {}) {
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    const now = ctx.currentTime;

    oscillator.type = wave;
    oscillator.frequency.setValueAtTime(frequency, now);
    oscillator.detune.setValueAtTime(detune, now);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(peak, now + attack);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak * sustain), now + release * 0.45);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + release);

    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start(now);
    oscillator.stop(now + release + 0.02);
  }


  function playMetronome() {
    const ctx = ensureAudioContext();
    if (!ctx) return;

    const freq = 1120;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const now = ctx.currentTime;

    osc.type = 'square';
    osc.frequency.setValueAtTime(freq, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.02, now + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.055);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.06);
  }

  function playBellAccent(ctx, frequency, confirmed) {
    const gain = confirmed ? 0.05 : 0.02;
    playVoice(ctx, frequency * 2, {
      wave: 'triangle',
      peak: gain,
      attack: 0.004,
      sustain: 0.1,
      release: 0.20,
      detune: 4
    });
  }

  function playTone(pitch, index, { confirmed = false } = {}) {
    const ctx = ensureAudioContext();
    if (!ctx) return;

    const melodyFrequency = pitchToHz[pitch] || 440;
    const chord = accompanimentChords[index] || [];

    const melodyPeak = confirmed ? 0.22 : 0.075;

    playVoice(ctx, melodyFrequency, {
      wave: confirmed ? 'triangle' : 'sine',
      peak: melodyPeak,
      release: 0.36
    });

    playVoice(ctx, melodyFrequency * 0.5, {
      wave: 'sine',
      peak: confirmed ? 0.07 : 0.03,
      release: 0.32
    });

    playBellAccent(ctx, melodyFrequency, confirmed);

    for (const note of chord) {
      const freq = pitchToHz[note];
      if (!freq) continue;
      playVoice(ctx, freq, {
        wave: 'sawtooth',
        peak: confirmed ? 0.056 : 0.016,
        release: 0.30,
        detune: (Math.random() - 0.5) * 5
      });
    }
  }

  function restart() {
    buildSlots();
    correctCount = 0;
    gameCompleted = false;
    showFinishEffect = false;
    statusText = 'Press Space on the beat';
    resetLoop();
    clearInterval(timerId);
    timerId = setInterval(() => tick(performance.now()), 16);
  }

  function nextPendingIndex() {
    return slots.findIndex(slot => slot.state === 'pending');
  }

  function handleSpace(event) {
    if (event.code !== 'Space') return;
    event.preventDefault();
    audioUnlocked = true;
    ensureAudioContext();

    if (gameCompleted) return;

    const targetIndex = nextPendingIndex();
    if (targetIndex === -1) return;

    const target = slots[targetIndex];
    const offset = Math.abs(activeBeat - target.atBeat);

    if (offset <= hitWindow) {
      slots[targetIndex] = { ...target, state: 'confirmed', played: true };
      slots = [...slots];
      correctCount += 1;
      playTone(target.pitch, target.index, { confirmed: true });
      statusText = `Nice! ${correctCount}/${slots.length} confirmed.`;

      if (correctCount === slots.length) {
        gameCompleted = true;
        showFinishEffect = true;
        statusText = '🎉 Perfect! Happy Birthday complete!';
      }
    } else {
      statusText = 'Too early/late — catch the next loop.';
    }
  }

  function tick(now) {
    if (!startTime) startTime = now;
    const elapsedSeconds = (now - startTime) / 1000;
    activeBeat = elapsedSeconds * beatsPerSecond;

    const currentBeat = Math.floor(activeBeat);
    if (audioUnlocked && currentBeat > lastMetronomeBeat) {
      for (let b = lastMetronomeBeat + 1; b <= currentBeat; b += 1) {
        if (b >= 0) playMetronome();
      }
      lastMetronomeBeat = currentBeat;
    }

    slots = slots.map(slot => {
      if (!slot.played && activeBeat >= slot.atBeat) {
        const isDone = slot.state === 'confirmed' || gameCompleted;
        if (audioUnlocked && isDone) {
          playTone(slot.pitch, slot.index, { confirmed: true });
        }
        return { ...slot, played: true };
      }
      return slot;
    });

    if (!gameCompleted) {
      slots = slots.map(slot => {
        if (slot.state !== 'pending') return slot;
        if (activeBeat > slot.atBeat + hitWindow) {
          return { ...slot, state: 'missed' };
        }
        return slot;
      });
    }

    if (activeBeat > totalBeats) {
      if (!gameCompleted) {
        statusText = `Looping… confirmed ${correctCount}/${slots.length}.`;
      }
      resetLoop(now);
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

  function slotFill(slot) {
    if (slot.state !== 'confirmed') return 'transparent';
    if (!revealedIndices.has(slot.index)) return 'rgba(130, 220, 255, 0.45)';

    const hue = 180 + (slot.index * 17) % 120;
    return `hsl(${hue}deg 82% 62%)`;
  }

  function unlockAudio() {
    audioUnlocked = true;
    ensureAudioContext();
  }

  onMount(() => {
    restart();
    window.addEventListener('keydown', handleSpace, { passive: false });
    window.addEventListener('pointerdown', unlockAudio, { passive: true });
  });

  onDestroy(() => {
    clearInterval(timerId);
    window.removeEventListener('keydown', handleSpace);
    window.removeEventListener('pointerdown', unlockAudio);
    audioContext?.close?.().catch(() => {});
  });
</script>

<div class="birthday-mode" class:completed={showFinishEffect}>
  <h2>🎂 Birthday Mode</h2>
  <p>{statusText}</p>

  {#if showFinishEffect}
    <div class="finish-effect" aria-hidden="true">
      <span>🎉</span><span>✨</span><span>🎊</span><span>💫</span><span>🎉</span>
    </div>
  {/if}

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
    <div class="indicator" style={`left:${beatToPercent(activeBeat)}%;`}></div>
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
    transition: box-shadow 0.3s ease;
  }

  .birthday-mode.completed {
    box-shadow: inset 0 0 80px rgba(255, 226, 126, 0.25);
  }

  .finish-effect {
    display: flex;
    gap: 10px;
    font-size: 1.4rem;
    margin: 6px 0 10px;
  }

  .finish-effect span {
    animation: pop 0.9s ease-in-out infinite alternate;
  }

  .finish-effect span:nth-child(2) { animation-delay: 0.1s; }
  .finish-effect span:nth-child(3) { animation-delay: 0.2s; }
  .finish-effect span:nth-child(4) { animation-delay: 0.3s; }
  .finish-effect span:nth-child(5) { animation-delay: 0.4s; }

  @keyframes pop {
    from { transform: translateY(0) scale(1); opacity: 0.8; }
    to { transform: translateY(-8px) scale(1.1); opacity: 1; }
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
    top: 34px;
    height: 10px;
    border: 1px solid rgba(194, 232, 255, 0.7);
    border-radius: 999px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.18s ease, border-color 0.18s ease;
  }

  .slot.missed {
    border-color: rgba(255, 145, 145, 0.3);
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
