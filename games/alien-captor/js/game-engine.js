(function (root, factory) {
  "use strict";
  var game = factory();
  if (typeof module === "object" && module.exports) module.exports = game;
  else root.AlienGame = game;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var MAX_ROUNDS = 11;
  var BUILDINGS = [];
  var INTERSECTIONS = [];
  for (var row = 0; row < 5; row += 1) {
    for (var col = 0; col < 5; col += 1) {
      BUILDINGS.push(Object.freeze({ id: String.fromCharCode(65 + col) + (row + 1), row: row, col: col }));
    }
  }
  for (var r = 0; r < 4; r += 1) {
    for (var c = 0; c < 4; c += 1) {
      INTERSECTIONS.push(Object.freeze({ id: "J" + (r * 4 + c + 1), row: r, col: c }));
    }
  }
  Object.freeze(BUILDINGS);
  Object.freeze(INTERSECTIONS);

  function requireCondition(condition, message) {
    if (!condition) throw new Error(message);
  }

  function requirePhase(state, phase) {
    requireCondition(state && state.phase === phase, "この操作は現在の手番では行えません。");
  }

  function requireHelicopter(index) {
    requireCondition(Number.isInteger(index) && index >= 0 && index < 3, "防衛機を選んでください。");
  }

  function lookup(items, id) {
    return items.find(function (item) { return item.id === id; });
  }

  function cardinalNeighbors(items, id) {
    var source = lookup(items, id);
    if (!source) return [];
    return items.filter(function (target) {
      return Math.abs(source.row - target.row) + Math.abs(source.col - target.col) === 1;
    }).map(function (target) { return target.id; });
  }

  function log(state, text, type) {
    state.logs.push({ round: state.round, text: text, type: type });
  }

  function finish(state, winner, reason) {
    state.phase = "finished";
    state.winner = winner;
    state.reason = reason;
    var messages = {
      captured: "エイリアンを捕獲。地球防衛軍の勝利！",
      trapped: "エイリアンの移動先がなくなりました。地球防衛軍の勝利！",
      escaped: "11ラウンドの追跡を回避。エイリアンの勝利！"
    };
    log(state, messages[reason], "result");
  }

  function traceColor(round) {
    requireCondition(Number.isInteger(round) && round >= 1 && round <= MAX_ROUNDS, "ラウンドは1から11で指定してください。");
    return round === 1 ? "yellow" : round === 6 ? "red" : "blue";
  }

  function createGame() {
    return {
      phase: "setup",
      round: 1,
      maxRounds: MAX_ROUNDS,
      helicopters: [null, null, null],
      acted: [false, false, false],
      alien: null,
      trail: [],
      logs: [],
      winner: null,
      reason: null
    };
  }

  function placeHelicopter(state, index, intersection) {
    requirePhase(state, "setup");
    requireHelicopter(index);
    requireCondition(state.helicopters.indexOf(null) === index, "防衛機は1号機から順に配置してください。");
    requireCondition(!!lookup(INTERSECTIONS, intersection), "盤面上の交差点を選んでください。");
    requireCondition(state.helicopters.indexOf(intersection) === -1, "同じ交差点に防衛機を重ねられません。");
    state.helicopters[index] = intersection;
    log(state, "防衛機" + (index + 1) + "を" + intersection + "に配置。", "setup");
    return state;
  }

  function startGame(state) {
    requirePhase(state, "setup");
    requireCondition(state.helicopters.every(function (id) { return !!lookup(INTERSECTIONS, id); }), "3機の防衛機を配置してください。");
    requireCondition(new Set(state.helicopters).size === 3, "防衛機は別々の交差点に配置してください。");
    state.phase = "alien";
    log(state, "作戦開始。エイリアンが最初の潜伏先を選びます。", "round");
    return state;
  }

  function legalAlienMoves(state) {
    if (!state || state.phase !== "alien") return [];
    var visited = new Set(state.trail.map(function (trace) { return trace.building; }));
    var candidates = state.alien === null
      ? BUILDINGS.map(function (building) { return building.id; })
      : cardinalNeighbors(BUILDINGS, state.alien);
    return candidates.filter(function (id) { return !visited.has(id); });
  }

  function moveAlien(state, building) {
    requirePhase(state, "alien");
    requireCondition(legalAlienMoves(state).indexOf(building) !== -1, "未訪問の上下左右のビルを選んでください。初回はすべてのビルに潜伏できます。");
    var color = traceColor(state.round);
    state.alien = building;
    state.trail.push({ building: building, round: state.round, color: color, discovered: false });
    state.phase = "defense";
    state.acted = [false, false, false];
    log(state, state.round === 1 ? "エイリアンが潜伏しました。" : "エイリアンが移動しました。", "alien");
    return state;
  }

  function legalHelicopterMoves(state, index) {
    requireHelicopter(index);
    if (!state || state.phase !== "defense" || state.acted[index]) return [];
    return cardinalNeighbors(INTERSECTIONS, state.helicopters[index]).filter(function (id) {
      return state.helicopters.indexOf(id) === -1;
    });
  }

  function searchableBuildings(state, index) {
    requireHelicopter(index);
    if (!state || state.phase !== "defense" || state.acted[index]) return [];
    var junction = lookup(INTERSECTIONS, state.helicopters[index]);
    if (!junction) return [];
    return BUILDINGS.filter(function (building) {
      return building.row >= junction.row && building.row <= junction.row + 1 &&
        building.col >= junction.col && building.col <= junction.col + 1;
    }).map(function (building) { return building.id; });
  }

  function completeDefenseTurn(state) {
    if (!state.acted.every(Boolean)) return;
    if (state.round === state.maxRounds) {
      finish(state, "alien", "escaped");
      return;
    }
    state.round += 1;
    state.phase = "alien";
    state.acted = [false, false, false];
    if (legalAlienMoves(state).length === 0) {
      finish(state, "defense", "trapped");
    } else {
      log(state, "ラウンド" + state.round + "。エイリアンの移動です。", "round");
    }
  }

  function actHelicopter(state, index, action, target) {
    requirePhase(state, "defense");
    requireHelicopter(index);
    requireCondition(!state.acted[index], "この防衛機は行動済みです。");
    requireCondition(action === "move" || action === "search", "移動または捜索を選んでください。");
    var allowed = action === "move" ? legalHelicopterMoves(state, index) : searchableBuildings(state, index);
    requireCondition(allowed.indexOf(target) !== -1, action === "move"
      ? "空いている上下左右の交差点に移動してください。"
      : "防衛機の周囲4棟から捜索するビルを選んでください。");

    state.acted[index] = true;
    if (action === "move") {
      state.helicopters[index] = target;
      log(state, "防衛機" + (index + 1) + "が" + target + "へ移動。", "move");
    } else {
      var trace = state.trail.find(function (item) { return item.building === target; });
      if (trace) trace.discovered = true;
      if (state.alien === target) {
        log(state, "防衛機" + (index + 1) + "が" + target + "でエイリアンを発見！", "capture");
        finish(state, "defense", "captured");
        return state;
      }
      if (trace) {
        var colorNames = { yellow: "黄色", blue: "青色", red: "赤色" };
        log(state, "防衛機" + (index + 1) + "が" + target + "を捜索。" + colorNames[trace.color] + "の痕跡を発見。", "trace");
      } else {
        log(state, "防衛機" + (index + 1) + "が" + target + "を捜索。痕跡なし。", "empty");
      }
    }
    completeDefenseTurn(state);
    return state;
  }

  function alienView(state) {
    return {
      phase: state.phase,
      round: state.round,
      maxRounds: state.maxRounds,
      helicopters: state.helicopters.slice(),
      acted: state.acted.slice(),
      alien: state.alien,
      trail: state.trail.map(function (trace) {
        return { building: trace.building, round: trace.round, color: trace.color, discovered: trace.discovered };
      }),
      logs: state.logs.map(function (entry) { return { round: entry.round, text: entry.text, type: entry.type }; }),
      winner: state.winner,
      reason: state.reason
    };
  }

  function publicView(state) {
    var view = alienView(state);
    if (state.phase !== "finished") {
      view.alien = null;
      // A chronological array would disclose the relative age of blue traces.
      // Enumerate fixed board coordinates so public order contains no route data.
      view.trail = BUILDINGS.reduce(function (traces, building) {
        var found = state.trail.find(function (trace) { return trace.discovered && trace.building === building.id; });
        if (found) traces.push({ building: found.building, color: found.color });
        return traces;
      }, []);
    }
    return view;
  }

  return Object.freeze({
    BUILDINGS: BUILDINGS,
    INTERSECTIONS: INTERSECTIONS,
    createGame: createGame,
    placeHelicopter: placeHelicopter,
    startGame: startGame,
    legalAlienMoves: legalAlienMoves,
    moveAlien: moveAlien,
    legalHelicopterMoves: legalHelicopterMoves,
    searchableBuildings: searchableBuildings,
    actHelicopter: actHelicopter,
    publicView: publicView,
    alienView: alienView,
    traceColor: traceColor
  });
});
