'use strict';

const path = require('node:path');
const { spawn } = require('node:child_process');
const { Xiangqi } = require('../../vendor/xiangqi-js/xiangqi.js');

const executable = path.join(__dirname, 'fairy-stockfish_x86-64.exe');
const engine = spawn(executable, [], {
  cwd: __dirname,
  windowsHide: true,
  stdio: ['pipe', 'pipe', 'pipe'],
});

let buffer = '';
let stage = 'uci';
let stderr = '';
let finished = false;
const game = new Xiangqi();

function send(command) {
  engine.stdin.write(`${command}\n`);
}

function fromEngineMove(move) {
  const match = move.match(/^([a-i])(10|[1-9])([a-i])(10|[1-9])$/i);
  if (!match) return null;
  const fromRank = Number(match[2]) - 1;
  const toRank = Number(match[4]) - 1;
  if (fromRank > 9 || toRank > 9) return null;
  return `${match[1]}${fromRank}${match[3]}${toRank}`.toLowerCase();
}

function toEngineMove(move) {
  const match = move.match(/^([a-i])([0-9])([a-i])([0-9])$/i);
  if (!match) throw new Error(`Unexpected NinePalace move: ${move}`);
  return `${match[1]}${Number(match[2]) + 1}${match[3]}${Number(match[4]) + 1}`.toLowerCase();
}

function fail(error) {
  if (finished) return;
  finished = true;
  clearTimeout(timer);
  engine.kill();
  console.error(error instanceof Error ? error.message : error);
  if (stderr.trim()) console.error(stderr.trim());
  process.exitCode = 1;
}

const timer = setTimeout(() => fail('Fairy-Stockfish UCI smoke test timed out.'), 30000);

engine.stdout.setEncoding('utf8');
engine.stdout.on('data', (chunk) => {
  buffer += chunk;
  let newline;
  while ((newline = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, newline).trim();
    buffer = buffer.slice(newline + 1);

    if (stage === 'uci' && line === 'uciok') {
      stage = 'ready';
      send('setoption name UCI_Variant value xiangqi');
      send('setoption name Threads value 1');
      send('isready');
    } else if (stage === 'ready' && line === 'readyok') {
      stage = 'search';
      send('position startpos');
      send('go movetime 500');
    } else if (stage === 'search' && line.startsWith('bestmove ')) {
      const engineMove = line.split(/\s+/)[1]?.toLowerCase();
      const appMove = engineMove && fromEngineMove(engineMove);
      if (!appMove || !game.moves().includes(appMove)) {
        fail(`Engine returned an illegal opening move after coordinate conversion: ${line}`);
        return;
      }

      const historyMove = 'b2e2';
      game.move(historyMove);
      stage = 'reply';
      console.log(`UCI_VARIANT=xiangqi`);
      console.log(`ENGINE_BESTMOVE=${engineMove}`);
      console.log(`NINEPALACE_BESTMOVE=${appMove}`);
      send(`position startpos moves ${toEngineMove(historyMove)}`);
      send('go movetime 500');
    } else if (stage === 'reply' && line.startsWith('bestmove ')) {
      const engineMove = line.split(/\s+/)[1]?.toLowerCase();
      const appMove = engineMove && fromEngineMove(engineMove);
      if (!appMove || !game.moves().includes(appMove)) {
        fail(`Engine returned an illegal reply after replaying history: ${line}`);
        return;
      }
      stage = 'quit';
      console.log(`NINEPALACE_REPLY=${appMove}`);
      console.log('HISTORY_AND_COORDINATE_CONVERSION=passed');
      send('quit');
    }
  }
});

engine.stderr.setEncoding('utf8');
engine.stderr.on('data', (chunk) => {
  stderr = `${stderr}${chunk}`.slice(-4000);
});

engine.on('error', fail);
engine.on('close', (code) => {
  if (finished) return;
  if (stage !== 'quit' || code !== 0) {
    fail(`Fairy-Stockfish exited before completing the smoke test (code ${code}).`);
    return;
  }
  finished = true;
  clearTimeout(timer);
  console.log('SMOKE_TEST=passed');
});

send('uci');
