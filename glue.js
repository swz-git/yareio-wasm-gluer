memory.spirits = Object.values(spirits);
memory.bases = [base, enemy_base];
memory.stars = Object.values(stars);
memory.outposts = [outpost];
memory.players = Object.values(players);
memory.player_id = this_player_id;
memory.global = globalThis;

if (!memory.wasm_memory)
  memory.wasm_memory = new WebAssembly.Memory({ initial: 0 });

if (memory.wasm_cache != "{{ .Unique }}") {
  const startCompile = new Date().getTime();

  const ptrToString = (ptr) => {
    const buffer = new Uint8Array(memory.wasm_memory.buffer, ptr);
    let str = "",
      offset = 0;
    while (true) {
      const ch = buffer[offset++];
      if (!ch) return decodeURIComponent(escape(str));
      str += String.fromCharCode(ch);
    }
  };
  const StringToPtr = (str) => {
    str = unescape(encodeURIComponent(str));
    const ptr = memory.wasm_alloc_fn(str.length + 1);
    const buffer = new Uint8Array(
      memory.wasm_memory.buffer,
      ptr,
      str.length + 1
    );
    for (let i = 0; i < str.length; i++) buffer[i] = str.charCodeAt(i);
    buffer[str.length] = 0;
    return ptr;
  };

  const spiritNumber = (s) => parseInt(s.id.match(/_(\d+)$/)[1]) - 1;
  const spiritPlayerId = (s) => memory.players.indexOf(s.player_id);
  const spiritId = (s) => [spiritPlayerId(s), spiritNumber(s)];

  const SHAPES = ["circles", "squares", "triangles"];

  importObject = {
    env: { memory: memory.wasm_memory },
    spirits: {
      count: () => memory.spirits.length,
      positionX: (index) => memory.spirits[index].position[0],
      positionY: (index) => memory.spirits[index].position[1],
      position: (index) => [
        memory.spirits[index].position[0],
        memory.spirits[index].position[1],
      ],
      size: (index) => memory.spirits[index].size,
      shape: (index) => SHAPES.indexOf(memory.spirits[index].shape),
      energyCapacity: (index) => memory.spirits[index].energy_capacity,
      energy: (index) => memory.spirits[index].energy,
      id: (index) => spiritId(memory.spirits[index]),
      number: (index) => spiritNumber(memory.spirits[index]),
      playerId: (index) => spiritPlayerId(memory.spirits[index]),
      hp: (index) => memory.spirits[index].hp,
      lastEnergizedId: (index) =>
        memory.spirits[index].last_energized &&
        spiritId(global[memory.spirits[index].last_energized]),
      lastEnergizedNumber: (index) =>
        memory.spirits[index].last_energized &&
        spiritNumber(global[memory.spirits[index].last_energized]),
      lastEnergizedPlayerId: (index) =>
        memory.spirits[index].last_energized &&
        spiritPlayerId(global[memory.spirits[index].last_energized]),

      energize: (fromIndex, toIndex) =>
        memory.spirits[fromIndex].energize(memory.spirits[toIndex]),
      energizeBase: (index, baseIndex) =>
        memory.spirits[index].energize(memory.bases[baseIndex]),
      energizeOutpost: (index, outpostIndex) =>
        memory.spirits[index].energize(memory.outposts[outpostIndex]),
      energizeStar: (index, starIndex) =>
        memory.spirits[index].energize(memory.stars[starIndex]),
      move: (index, x, y) => memory.spirits[index].move([x, y]),
      merge: (fromIndex, toIndex) =>
        memory.spirits[fromIndex].merge(memory.spirits[toIndex]),
      divide: (index) => memory.spirits[index].divide(),
      jump: (index, x, y) => memory.spirits[index].jump([x, y]),
      explode: (index) => memory.spirits[index].explode(),
      shout: (index, strPtr) => {
        memory.spirits[index].shout(ptrToString(strPtr));
      },
    },
    bases: {
      count: () => memory.bases.length,
      positionX: (index) => memory.bases[index].position[0],
      positionY: (index) => memory.bases[index].position[1],
      position: (index) => [
        memory.bases[index].position[0],
        memory.bases[index].position[1],
      ],
      energyCapacity: (index) => memory.bases[index].energy_capacity,
      energy: (index) => memory.bases[index].energy,
      currentSpiritCost: (index) => memory.bases[index].current_spirit_cost,
      hp: (index) => memory.bases[index].hp,
      playerId: (index) =>
        memory.players.indexOf(memory.bases[index].player_id),
    },
    stars: {
      count: () => memory.stars.length,
      positionX: (index) => memory.stars[index].position[0],
      positionY: (index) => memory.stars[index].position[1],
      position: (index) => [
        memory.stars[index].position[0],
        memory.stars[index].position[1],
      ],
      energyCapacity: (index) => memory.stars[index].energy_capacity,
      energy: (index) => memory.stars[index].energy,
      activeAt: (index) => memory.stars[index].active_at,
    },
    outposts: {
      count: () => memory.outposts.length,
      positionX: (index) => memory.outposts[index].position[0],
      positionY: (index) => memory.outposts[index].position[1],
      position: (index) => [
        memory.outposts[index].position[0],
        memory.outposts[index].position[1],
      ],
      energyCapacity: (index) => memory.outposts[index].energy_capacity,
      energy: (index) => memory.outposts[index].energy,
      range: (index) => memory.outposts[index].range,
      controlledBy: (index) =>
        memory.players.indexOf(memory.outposts[index].control),
    },
    players: {
      count: () => memory.players.length,
      me: () => memory.players.indexOf(memory.player_id),
    },
    console: {
      log: (strPtr) => console.log(ptrToString(strPtr)),
    },
    graphics: {
      color: (r, g, b, a) => (graphics.style = `rgba(${r},${g},${b},${a})`),
      lineWidth: (w) => (graphics.linewidth = w),
      circle: (x, y, r) => graphics.circle([x, y], r),
      line: (x1, y1, x2, y2) => graphics.line([x1, y1], [x2, y2]),
      rectangle: (x1, y1, w, h) => graphics.rect([x1, y1], [w, h]),
    },
    random: {
      random: () => Math.random(),
    },
  };

  const bin = atob("{{ .WasmContent }}");
  const wasm = new WebAssembly.Module(bin);
  let inst;
  try {
    inst = new WebAssembly.Instance(wasm, importObject);
  } catch (e) {
    if (!(e instanceof WebAssembly.LinkError)) throw e;
    const match =
      /^WebAssembly\.Instance\(\): memory import 0 is smaller than initial (\d+), got (\d+)$/gim.exec(
        e.message
      );
    if (!match) throw e;
    memory.wasm_memory.grow(parseInt(match[1]) - parseInt(match[2]));
    inst = new WebAssembly.Instance(wasm, importObject);
  }
  memory.wasm_tick_fn = inst.exports.tick;
  memory.wasm_cache = "{{ .Unique }}";
  memory.wasm_alloc_fn = inst.exports.alloc;
  console.log(
    `compiled new wasm script in ${new Date().getTime() - startCompile}ms`
  );
}

memory.wasm_tick_fn(tick, !memory.wasm_initialized);
memory.wasm_initialized = true;
