<script>
  import { onMount, onDestroy } from 'svelte';
  import birthdayWinBgDataUri from '../assets/birthdayWinBgDataUri.js';

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
  let statusText = 'Appuie sur Espace pour commencer, puis joue le piano avec les touches D,F,J,K ';
  let score = 0;
  let nextNoteIndex = 0;
  let frameId;
  let spawnTimeout;
  let gameAreaEl;
  let lanePressed = [false, false, false, false];
  let missedFlash = null;
  let missedFlashTimeout;

  let audioContext;
  let dryBus;
  let wetBus;
  let masterBus;
  let reverb;
  let filter;
  let sustainedVoices = new Map();

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
      dryBus.gain.value = 1.0;
      wetBus.gain.value = 0.5;
      masterBus.gain.value = 1.25;
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

  function playUiClick() {
    const ctx = ensureAudio();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(700, now);
    osc.frequency.exponentialRampToValueAtTime(430, now + 0.08);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.03, now + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);

    osc.connect(gain);
    gain.connect(dryBus || ctx.destination);
    osc.start(now);
    osc.stop(now + 0.1);
  }

  function startSustainTone(laneIndex, pitch) {
    const ctx = ensureAudio();
    if (!ctx) return;

    stopSustainTone(laneIndex);

    const now = ctx.currentTime;
    const frequency = pitchToHz[pitch] || 440;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(frequency, now);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.075, now + 0.02);

    osc.connect(gain);
    gain.connect(dryBus || ctx.destination);
    gain.connect(wetBus || ctx.destination);

    osc.start(now);
    sustainedVoices.set(laneIndex, { osc, gain });
  }

  function stopSustainTone(laneIndex) {
    const voice = sustainedVoices.get(laneIndex);
    if (!voice || !audioContext) return;

    const now = audioContext.currentTime;
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setValueAtTime(Math.max(0.0001, voice.gain.gain.value), now);
    voice.gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
    voice.osc.stop(now + 0.14);
    sustainedVoices.delete(laneIndex);
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
    bodyGain.gain.exponentialRampToValueAtTime(0.13, now + 0.012);
    bodyGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.62);

    const hammer = ctx.createOscillator();
    const hammerGain = ctx.createGain();
    hammer.type = 'square';
    hammer.frequency.setValueAtTime(frequency * 2, now);
    hammerGain.gain.setValueAtTime(0.0001, now);
    hammerGain.gain.exponentialRampToValueAtTime(0.035, now + 0.005);
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

    const previousIndex = Math.max(0, nextNoteIndex - 1);
    const delay = Math.max(120, rhythm[previousIndex] * beatMs);
    spawnTimeout = setTimeout(() => {
      addNote();
      scheduleNextSpawn();
    }, delay);
  }

  function addNote() {
    if (nextNoteIndex >= melody.length) return;

    const duration = rhythm[nextNoteIndex] || 1;
    const height = noteHeightFor(duration);

    notes = [
      ...notes,
      {
        id: `note-${nextNoteIndex}-${Date.now()}`,
        lane: lanePattern[nextNoteIndex] ?? (nextNoteIndex % lanes.length),
        pitch: melody[nextNoteIndex],
        duration,
        height,
        y: -height,
        hit: false
      }
    ];
    nextNoteIndex += 1;
  }

  function flashMiss(note) {
    clearTimeout(missedFlashTimeout);
    missedFlash = {
      id: `miss-${Date.now()}`,
      lane: note.lane,
      y: note.y,
      height: note.height
    };

    missedFlashTimeout = setTimeout(() => {
      missedFlash = null;
    }, 220);
  }

  function fail(message) {
    if (won || gameOver) return;
    gameOver = true;
    active = false;
    statusText = `${message} Appuie sur Espace pour recommencer.`;
    clearTimeout(spawnTimeout);
    cancelAnimationFrame(frameId);
  }

  function checkWin() {
    if (score === melody.length && notes.length === 0 && nextNoteIndex >= melody.length) {
      won = true;
      active = false;
      statusText = " ";
      clearTimeout(spawnTimeout);
      cancelAnimationFrame(frameId);
    }
  }

  function tick() {
    if (!active) return;

    const h = areaHeight();
    notes = notes
      .map(note => ({ ...note, y: note.y + noteSpeed / 60 }))
      .filter(note => {
        const tileBottom = note.y + note.height;
        const hitWindow = note.height;
        if (!note.hit && tileBottom >= h - hitLineOffset + hitWindow) {
          flashMiss(note);
          fail('Note manquée !');
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
    missedFlash = null;
    statusText = "C'est parti ! Suis le rythme exact de Joyeux anniversaire.";
    lanePressed = [false, false, false, false];

    clearTimeout(spawnTimeout);
    clearTimeout(missedFlashTimeout);
    cancelAnimationFrame(frameId);
    for (const lane of sustainedVoices.keys()) {
      stopSustainTone(lane);
    }

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
    if (event.code === 'Space') {
      event.preventDefault();
      if (event.repeat) return;
      playUiClick();
      if (!active || gameOver || won) {
        startGame();
      } else {
        restart();
      }
      return;
    }

    const laneIndex = keyToLane[event.code];
    if (laneIndex === undefined) return;
    event.preventDefault();
    if (event.repeat) return;

    lanePressed[laneIndex] = true;
    lanePressed = [...lanePressed];
    ensureAudio();

    if (!active || gameOver || won) return;

    const h = areaHeight();
    const hitLineY = h - hitLineOffset;
    const target = nearestNoteInLane(laneIndex);

    if (!target) {
      fail('Mauvaise touche ! Aucune note sur cette ligne.');
      return;
    }

    const distance = Math.abs(target.y + target.height - hitLineY);
    if (distance > target.height) {
      fail('Trop tôt / trop tard ! Appuie quand la note atteint la ligne.');
      return;
    }

    target.hit = true;
    notes = notes.filter(note => note.id !== target.id);
    score += 1;
    statusText = `Parfait ! ${score}/${melody.length}`;
    playPitchTone(target.pitch);
    startSustainTone(laneIndex, target.pitch);
    checkWin();
  }

  function handleKeyUp(event) {
    const laneIndex = keyToLane[event.code];
    if (laneIndex === undefined) return;
    lanePressed[laneIndex] = false;
    lanePressed = [...lanePressed];
    stopSustainTone(laneIndex);
  }

  onMount(() => {
    window.addEventListener('keydown', handleKeyDown, { passive: false });
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('pointerdown', ensureAudio, { passive: true });
  });

  onDestroy(() => {
    clearTimeout(spawnTimeout);
    clearTimeout(missedFlashTimeout);
    cancelAnimationFrame(frameId);
    for (const lane of sustainedVoices.keys()) {
      stopSustainTone(lane);
    }
    window.removeEventListener('keydown', handleKeyDown);
    window.removeEventListener('keyup', handleKeyUp);
    window.removeEventListener('pointerdown', ensureAudio);
    audioContext?.close?.().catch(() => {});
  });
</script>

<div class="piano-tiles-shell" class:won-mode={won} style={won ? `--birthday-win-bg: url(${birthdayWinBgDataUri})` : ""}>
  <h2 class="mode-title">🎹 De quelle chanson pourrait-il s'agir ?</h2>
  <p class="mode-status">{statusText}</p>


  {#if won}
    <div class="win-screen">
      <div class="confetti-layer" aria-hidden="true">
        {#each Array(28) as _, i}
          <span class="confetti c-{i % 7}" style={`left:${(i * 17) % 100}%; animation-delay:${(i % 9) * 0.09}s;`}></span>
        {/each}
      </div>
      <h3>TU AS GAGNÉ ! 🎉</h3>
      <p>Joyeux anniversaire en retard papa!!! :D🎂💛</p>
      <button on:click={restart}>Rejouer (Espace)</button>
    </div>
  {:else}
    <div class="hud">
      <span>Score : {score}/{melody.length}</span>
      {#if !active}
        <button on:click={startGame}>Démarrer (Espace)</button>
      {:else}
        <button on:click={restart}>Recommencer (Espace)</button>
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
        </div>
      {/each}

      {#if missedFlash}
        <div
          class="note missed"
          style={`top:${missedFlash.y}px; left:calc(${missedFlash.lane} * 25% + 5px); height:${missedFlash.height}px;`}
        ></div>
      {/if}

      <div class="hit-line"></div>
    </div>

    {#if gameOver}
      <div class="game-over">
        <h3>Perdu</h3>
        <button on:click={restart}>Réessayer (Espace)</button>
      </div>
    {/if}
  {/if}
</div>

<style>
  .piano-tiles-shell {
    --mode-bg: var(--bg, #0f0f10);
    --mode-text: var(--text, #f7fbff);
    --mode-accent: var(--mode-text);
    --mode-accent-text: var(--mode-bg);
    --mode-border: var(--block-border-color, color-mix(in srgb, var(--mode-text) 28%, transparent));
    --mode-radius: var(--block-border-radius, 14px);
    --mode-button-bg: var(--block-media-button-bg, #3045a0);
    --mode-button-text: var(--block-media-button-text, #ffffff);
    --mode-panel-bg: var(--block-header-bg, color-mix(in srgb, var(--mode-bg) 88%, var(--mode-text) 12%));
    --mode-game-area-bg: var(--block-surface, color-mix(in srgb, var(--mode-bg) 92%, var(--mode-text) 8%));
    --mode-lane-divider: color-mix(in srgb, var(--mode-border) 72%, var(--mode-text) 28%);
    --mode-key-bg: color-mix(in srgb, var(--mode-accent) 32%, var(--mode-bg));
    --mode-key-pressed: color-mix(in srgb, var(--mode-accent) 54%, var(--mode-bg));
    --mode-note-bg: linear-gradient(
      180deg,
      color-mix(in srgb, var(--mode-accent) 34%, var(--mode-bg)),
      color-mix(in srgb, var(--mode-accent) 14%, var(--mode-bg))
    );
    width: 100%;
    min-height: calc(100vh - 120px);
    padding: 20px;
    color: var(--mode-text);
    background: var(--mode-bg);
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    align-items: center;
    position: relative;
    overflow: hidden;
  }

  .piano-tiles-shell.won-mode {
    background-image:
      linear-gradient(
        color-mix(in srgb, var(--mode-bg) 16%, transparent),
        color-mix(in srgb, var(--mode-bg) 16%, transparent)
      ),
      var(--birthday-win-bg);
    background-size: cover;
    background-position: center;
    background-repeat: no-repeat;
  }


  .mode-title,
  .mode-status {
    position: relative;
    z-index: 2;
  }
  .hud {
    position: relative;
    z-index: 2;
    display: flex;
    align-items: center;
    gap: 14px;
    margin-bottom: 12px;
    width: min(100%, 760px);
    justify-content: space-between;
  }

  .game-area {
    position: relative;
    z-index: 2;
    width: min(100%, 760px);
    height: clamp(420px, 62vh, 700px);
    border-radius: var(--mode-radius);
    overflow: hidden;
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    border: 2px solid var(--mode-border);
    background: color-mix(in srgb, var(--mode-key-bg) 74%, var(--mode-bg));
  }

  .lane {
    border-right: 1px solid var(--mode-lane-divider);
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
    background: var(--mode-key-bg);
    color: var(--mode-accent-text);
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 800;
    border: 2px solid var(--mode-accent);
    transition: transform 0.08s ease, background 0.08s ease;
  }

  .lane-key.pressed {
    transform: translateX(-50%) scale(0.94);
    background: var(--mode-key-pressed);
  }

  .note {
    position: absolute;
    width: calc(25% - 10px);
    min-height: 104px;
    border-radius: 8px;
    background: var(--mode-note-bg);
    box-shadow: inset 0 -8px 0 rgba(255, 255, 255, 0.08);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .note.missed {
    background: linear-gradient(
      180deg,
      color-mix(in srgb, var(--mode-accent) 80%, var(--mode-bg)),
      color-mix(in srgb, var(--mode-accent) 40%, var(--mode-bg))
    );
    box-shadow: 0 0 16px color-mix(in srgb, var(--mode-accent) 50%, transparent), inset 0 -8px 0 rgba(255, 255, 255, 0.16);
    border: 1px solid color-mix(in srgb, var(--mode-accent) 52%, var(--mode-bg));
    animation: missPulse 0.2s ease;
  }

  .hit-line {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 120px;
    height: 4px;
    background: var(--mode-accent);
    box-shadow: 0 0 10px color-mix(in srgb, var(--mode-accent) 75%, transparent);
  }

  .win-screen,
  .game-over {
    z-index: 2;
    margin-top: 18px;
    width: min(100%, 760px);
    border-radius: var(--mode-radius);
    padding: 20px;
    background: var(--mode-panel-bg);
    border: 1px solid var(--mode-border);
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

  @keyframes missPulse {
    0% { transform: scale(0.98); opacity: 0.8; }
    100% { transform: scale(1); opacity: 1; }
  }

  button {
    border: 1px solid var(--mode-border);
    background: var(--mode-button-bg);
    color: var(--mode-button-text);
    border-radius: 8px;
    padding: 8px 14px;
    cursor: pointer;
    font-weight: 700;
  }
</style>
