<script>
  import { onMount, onDestroy } from 'svelte';

  const lanes = ['D', 'F', 'J', 'K'];
  const keyToLane = {
    KeyD: 0,
    KeyF: 1,
    KeyJ: 2,
    KeyK: 3
  };

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

  const lanePattern = [
    0, 1, 2, 1, 3, 2,
    0, 1, 2, 1, 3, 2,
    0, 1, 3, 2, 1, 2, 3,
    0, 1, 2, 1, 3, 2
  ];

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

  const beatMs = 260;
  const noteSpeed = 260;
  const baseNoteHeight = 104;
  const extraHeightPerBeat = 48;
  const hitLineOffset = 120;

  let notes = [];
  let active = false;
  let gameOver = false;
  let won = false;
  let statusText = 'Press Start, then hit D F J K in Happy Birthday rhythm.';
  let score = 0;
  let nextNoteIndex = 0;
  let frameId;
  let spawnTimeout;
  let gameAreaEl;
  let lanePressed = [false, false, false, false];

  let audioContext;
  let dryBus;
  let wetBus;
  let masterBus;
  let reverb;
  let filter;

  function areaHeight() {
    return gameAreaEl?.clientHeight || 640;
  }

  function createImpulse(ctx, duration = 1.9, decay = 2.8) {
    const length = Math.floor(ctx.sampleRate * duration);
    const impulse = ctx.createBuffer(2, length, ctx.sampleRate);

    for (let channel = 0; channel < 2; channel += 1) {
      const data = impulse.getChannelData(channel);
      for (let i = 0; i < length; i += 1) {
        const t = i / length;
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay);
      }
    }
    return impulse;
  }

  function ensureAudio() {
    if (!audioContext) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;

      audioContext = new Ctx();
      dryBus = audioContext.createGain();
      wetBus = audioContext.createGain();
      masterBus = audioContext.createGain();
      reverb = audioContext.createConvolver();
      filter = audioContext.createBiquadFilter();

      reverb.buffer = createImpulse(audioContext);
      dryBus.gain.value = 0.82;
      wetBus.gain.value = 0.34;
      masterBus.gain.value = 0.9;
      filter.type = 'lowpass';
      filter.frequency.value = 5600;
      filter.Q.value = 0.8;

      dryBus.connect(filter);
      wetBus.connect(reverb);
      reverb.connect(filter);
      filter.connect(masterBus);
      masterBus.connect(audioContext.destination);
    }

    if (audioContext.state === 'suspended') {
      audioContext.resume().catch(() => {});
    }

    return audioContext;
  }

  function playPitchTone(pitch) {
    const ctx = ensureAudio();
    if (!ctx) return;

    const now = ctx.currentTime;
    const frequency = pitchToHz[pitch] || 440;

    const body = ctx.createOscillator();
    const bodyGain = ctx.createGain();
    body.type = 'triangle';
    body.frequency.setValueAtTime(frequency, now);
    bodyGain.gain.setValueAtTime(0.0001, now);
    bodyGain.gain.exponentialRampToValueAtTime(0.095, now + 0.012);
    bodyGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.62);

    const hammer = ctx.createOscillator();
    const hammerGain = ctx.createGain();
    hammer.type = 'square';
    hammer.frequency.setValueAtTime(frequency * 2, now);
    hammerGain.gain.setValueAtTime(0.0001, now);
    hammerGain.gain.exponentialRampToValueAtTime(0.026, now + 0.005);
    hammerGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.07);

    body.connect(bodyGain);
    hammer.connect(hammerGain);
    bodyGain.connect(dryBus);
    bodyGain.connect(wetBus);
    hammerGain.connect(dryBus);
    hammerGain.connect(wetBus);

    body.start(now);
    hammer.start(now);
    hammer.stop(now + 0.08);
    body.stop(now + 0.66);
  }

  function noteHeightFor(duration) {
    return baseNoteHeight + Math.max(0, duration - 1) * extraHeightPerBeat;
  }

  function scheduleNextSpawn() {
    if (!active || gameOver || won || nextNoteIndex >= melody.length) return;

    const delay = Math.max(120, rhythm[nextNoteIndex] * beatMs);
    spawnTimeout = setTimeout(() => {
      addNote();
      scheduleNextSpawn();
    }, delay);
  }

  function addNote() {
    if (nextNoteIndex >= melody.length) return;

    const duration = rhythm[nextNoteIndex] || 1;

    notes = [
      ...notes,
      {
        id: `note-${nextNoteIndex}-${Date.now()}`,
        lane: lanePattern[nextNoteIndex] ?? (nextNoteIndex % lanes.length),
        pitch: melody[nextNoteIndex],
        duration,
        height: noteHeightFor(duration),
        y: -noteHeightFor(duration),
        hit: false
      }
    ];
    nextNoteIndex += 1;
  }

  function fail(message) {
    if (won || gameOver) return;
    gameOver = true;
    active = false;
    statusText = message;
    clearTimeout(spawnTimeout);
    cancelAnimationFrame(frameId);
  }

  function checkWin() {
    if (score === melody.length && notes.length === 0 && nextNoteIndex >= melody.length) {
      won = true;
      active = false;
      statusText = '🎉 Perfect run! Happy Birthday complete!';
      clearTimeout(spawnTimeout);
      cancelAnimationFrame(frameId);
    }
  }

  function tick() {
    if (!active) return;

    const h = areaHeight();
    notes = notes
      .map(note => ({ ...note, y: note.y + (noteSpeed / 60) }))
      .filter(note => {
        const tileBottom = note.y + note.height;
        const hitWindow = note.height;
        if (!note.hit && tileBottom >= h - hitLineOffset + hitWindow) {
          fail('Missed tile! Restart and try again.');
          return false;
        }
        return note.y <= h + note.height;
      })
      .filter(note => !note.hit);

    checkWin();
    frameId = requestAnimationFrame(tick);
  }

  function startGame() {
    notes = [];
    score = 0;
    nextNoteIndex = 0;
    won = false;
    gameOver = false;
    active = true;
    statusText = 'Go! Follow the Happy Birthday rhythm.';
    lanePressed = [false, false, false, false];

    clearTimeout(spawnTimeout);
    cancelAnimationFrame(frameId);

    addNote();
    scheduleNextSpawn();
    frameId = requestAnimationFrame(tick);
  }

  function restart() {
    startGame();
  }

  function nearestNoteInLane(laneIndex) {
    const h = areaHeight();
    const hitLineY = h - hitLineOffset;

    return notes
      .filter(note => note.lane === laneIndex)
      .sort((a, b) => Math.abs(a.y + a.height - hitLineY) - Math.abs(b.y + b.height - hitLineY))[0];
  }

  function handleKeyDown(event) {
    const laneIndex = keyToLane[event.code];
    if (laneIndex === undefined) return;
    event.preventDefault();

    lanePressed[laneIndex] = true;
    lanePressed = [...lanePressed];
    ensureAudio();

    if (!active || gameOver || won) return;

    const h = areaHeight();
    const hitLineY = h - hitLineOffset;
    const target = nearestNoteInLane(laneIndex);

    if (!target) {
      fail('Wrong key! No tile in that lane.');
      return;
    }

    const distance = Math.abs(target.y + target.height - hitLineY);
    if (distance > target.height) {
      fail('Too early/late! Hit when the tile reaches the line.');
      return;
    }

    target.hit = true;
    notes = notes.filter(note => note.id !== target.id);
    score += 1;
    statusText = `Perfect! ${score}/${melody.length}`;
    playPitchTone(target.pitch);
    checkWin();
  }

  function handleKeyUp(event) {
    const laneIndex = keyToLane[event.code];
    if (laneIndex === undefined) return;
    lanePressed[laneIndex] = false;
    lanePressed = [...lanePressed];
  }

  onMount(() => {
    window.addEventListener('keydown', handleKeyDown, { passive: false });
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('pointerdown', ensureAudio, { passive: true });
  });

  onDestroy(() => {
    clearTimeout(spawnTimeout);
    cancelAnimationFrame(frameId);
    window.removeEventListener('keydown', handleKeyDown);
    window.removeEventListener('keyup', handleKeyUp);
    window.removeEventListener('pointerdown', ensureAudio);
    audioContext?.close?.().catch(() => {});
  });
</script>

<div class="piano-tiles-shell">
  <h2>🎹 Birthday Piano Tiles (PC)</h2>
  <p>{statusText}</p>

  {#if won}
    <div class="win-screen">
      <div class="confetti-layer" aria-hidden="true">
        {#each Array(28) as _, i}
          <span class="confetti c-{i % 7}" style={`left:${(i * 17) % 100}%; animation-delay:${(i % 9) * 0.09}s;`}></span>
        {/each}
      </div>
      <h3>YOU WIN! 🎉</h3>
      <p>100% perfect run — yhaha yeah ✨</p>
      <button on:click={restart}>Restart Game</button>
    </div>
  {:else}
    <div class="hud">
      <span>Score: {score}/{melody.length}</span>
      {#if !active}
        <button on:click={startGame}>Start</button>
      {:else}
        <button on:click={restart}>Restart</button>
      {/if}
    </div>

    <div class="game-area" bind:this={gameAreaEl}>
      {#each lanes as lane, index}
        <div class="lane">
          <div class="lane-key" class:pressed={lanePressed[index]}>{lane}</div>
        </div>
      {/each}

      {#each notes as note (note.id)}
        <div
          class="note"
          style={`top:${note.y}px; left:calc(${note.lane} * 25% + 5px); height:${note.height}px;`}
        >
          <span class="note-label">{note.pitch}</span>
        </div>
      {/each}

      <div class="hit-line"></div>
    </div>

    {#if gameOver}
      <div class="game-over">
        <h3>Game Over</h3>
        <button on:click={restart}>Try Again</button>
      </div>
    {/if}
  {/if}
</div>

<style>
  .piano-tiles-shell {
    width: 100%;
    min-height: calc(100vh - 120px);
    padding: 20px;
    color: #f7fbff;
    background: radial-gradient(circle at top, #1d1f30, #0b0d18 65%);
    box-sizing: border-box;
  }

  .hud {
    display: flex;
    align-items: center;
    gap: 14px;
    margin-bottom: 12px;
  }

  .game-area {
    position: relative;
    width: min(100%, 760px);
    height: 700px;
    border-radius: 14px;
    overflow: hidden;
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    border: 2px solid #2b365d;
    background: #fcfcff;
  }

  .lane {
    border-right: 1px solid #dbe1ff;
    position: relative;
  }

  .lane:last-child {
    border-right: none;
  }

  .lane-key {
    position: absolute;
    bottom: 24px;
    left: 50%;
    transform: translateX(-50%);
    width: 46px;
    height: 46px;
    border-radius: 10px;
    background: #202843;
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 800;
    border: 2px solid #5e74d0;
    transition: transform 0.08s ease, background 0.08s ease;
  }

  .lane-key.pressed {
    transform: translateX(-50%) scale(0.94);
    background: #3d53ad;
  }

  .note {
    position: absolute;
    width: calc(25% - 10px);
    min-height: 104px;
    border-radius: 8px;
    background: linear-gradient(180deg, #212121, #0d0d0d);
    box-shadow: inset 0 -8px 0 rgba(255, 255, 255, 0.08);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .note-label {
    color: #f5f8ff;
    font-weight: 700;
    font-size: 0.8rem;
    letter-spacing: 0.04em;
  }

  .hit-line {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 120px;
    height: 4px;
    background: #5a70ff;
    box-shadow: 0 0 10px rgba(90, 112, 255, 0.8);
  }

  .win-screen,
  .game-over {
    margin-top: 18px;
    width: min(100%, 760px);
    border-radius: 14px;
    padding: 20px;
    background: linear-gradient(180deg, #17243f, #101a2e);
    border: 1px solid #4f74c5;
    position: relative;
    overflow: hidden;
  }

  .confetti-layer {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }

  .confetti {
    position: absolute;
    top: -14px;
    width: 10px;
    height: 16px;
    border-radius: 2px;
    animation: confettiDrop 2.2s linear infinite;
    opacity: 0.92;
  }

  .c-0 { background: #ff6b6b; }
  .c-1 { background: #ffd93d; }
  .c-2 { background: #6bcB77; }
  .c-3 { background: #4d96ff; }
  .c-4 { background: #b892ff; }
  .c-5 { background: #ff9f68; }
  .c-6 { background: #f8f9fa; }

  @keyframes confettiDrop {
    0% { transform: translateY(-10%) rotate(0deg); }
    100% { transform: translateY(360px) rotate(330deg); }
  }

  button {
    border: 1px solid #7f9cff;
    background: #3045a0;
    color: #ffffff;
    border-radius: 8px;
    padding: 8px 14px;
    cursor: pointer;
    font-weight: 700;
  }
</style>
