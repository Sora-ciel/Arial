<script>
  import { onMount, onDestroy } from 'svelte';

  const lanes = ['D', 'F', 'J', 'K'];
  const keyToLane = {
    KeyD: 0,
    KeyF: 1,
    KeyJ: 2,
    KeyK: 3
  };

  const easyPattern = [
    0, 1, 2, 3,
    1, 2, 0, 3,
    0, 2, 1, 3,
    0, 1, 2, 3,
    1, 0, 2, 3,
    0, 1, 3, 2,
    0, 1, 2, 3,
    1, 2, 3, 0
  ];

  const noteSpeed = 260;
  const spawnIntervalMs = 500;
  const noteHeight = 84;
  const hitLineOffset = 120;
  const hitWindow = 56;

  let notes = [];
  let active = false;
  let gameOver = false;
  let won = false;
  let statusText = 'Press Start, then hit D F J K like Piano Tiles.';
  let score = 0;
  let nextNoteIndex = 0;
  let frameId;
  let spawnerId;
  let gameAreaEl;
  let lanePressed = [false, false, false, false];

  function areaHeight() {
    return gameAreaEl?.clientHeight || 640;
  }

  function playBeep(laneIndex) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;

    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const now = ctx.currentTime;
    const frequencies = [261.63, 329.63, 392.0, 523.25];

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(frequencies[laneIndex] || 440, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.07, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.17);
    osc.onended = () => ctx.close().catch(() => {});
  }

  function addNote() {
    if (nextNoteIndex >= easyPattern.length) {
      clearInterval(spawnerId);
      return;
    }

    notes = [
      ...notes,
      {
        id: `note-${nextNoteIndex}-${Date.now()}`,
        lane: easyPattern[nextNoteIndex],
        y: -noteHeight,
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
    clearInterval(spawnerId);
    cancelAnimationFrame(frameId);
  }

  function checkWin() {
    if (score === easyPattern.length && notes.length === 0 && nextNoteIndex >= easyPattern.length) {
      won = true;
      active = false;
      statusText = '🎉 Perfect run! You cleared every tile!';
      clearInterval(spawnerId);
      cancelAnimationFrame(frameId);
    }
  }

  function tick() {
    if (!active) return;

    const h = areaHeight();
    notes = notes
      .map(note => ({ ...note, y: note.y + (noteSpeed / 60) }))
      .filter(note => {
        if (!note.hit && note.y + noteHeight >= h - hitLineOffset + hitWindow) {
          fail('Missed tile! Restart and try again.');
          return false;
        }
        return note.y <= h + noteHeight;
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
    statusText = 'Go! Hit the bottom tile in the correct lane.';
    lanePressed = [false, false, false, false];

    clearInterval(spawnerId);
    cancelAnimationFrame(frameId);

    addNote();
    spawnerId = setInterval(addNote, spawnIntervalMs);
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
      .sort((a, b) => Math.abs((a.y + noteHeight) - hitLineY) - Math.abs((b.y + noteHeight) - hitLineY))[0];
  }

  function handleKeyDown(event) {
    const laneIndex = keyToLane[event.code];
    if (laneIndex === undefined) return;
    event.preventDefault();

    lanePressed[laneIndex] = true;
    lanePressed = [...lanePressed];

    if (!active || gameOver || won) return;

    const h = areaHeight();
    const hitLineY = h - hitLineOffset;
    const target = nearestNoteInLane(laneIndex);

    if (!target) {
      fail('Wrong key! No tile in that lane.');
      return;
    }

    const distance = Math.abs((target.y + noteHeight) - hitLineY);
    if (distance > hitWindow) {
      fail('Too early/late! Hit when the tile reaches the line.');
      return;
    }

    target.hit = true;
    notes = notes.filter(note => note.id !== target.id);
    score += 1;
    statusText = `Perfect! ${score}/${easyPattern.length}`;
    playBeep(laneIndex);
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
  });

  onDestroy(() => {
    clearInterval(spawnerId);
    cancelAnimationFrame(frameId);
    window.removeEventListener('keydown', handleKeyDown);
    window.removeEventListener('keyup', handleKeyUp);
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
      <span>Score: {score}/{easyPattern.length}</span>
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
          style={`top:${note.y}px; left:calc(${note.lane} * 25% + 5px);`}
        ></div>
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
    height: 640px;
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
    height: 84px;
    border-radius: 8px;
    background: linear-gradient(180deg, #212121, #111111);
    box-shadow: inset 0 -8px 0 rgba(255, 255, 255, 0.08);
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
