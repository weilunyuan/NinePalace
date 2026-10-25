# Fairy-Stockfish + CC0 Xiangqi NNUE spike

This folder is an isolated engine experiment. It does not change NinePalace's Pikafish default and is not included in the current Windows package configuration.

## Candidate

- Engine: Fairy-Stockfish dedicated Xiangqi release `xiangqi-c07e94a5c7cb`
- Network: built-in `xiangqi-c07e94a5c7cb.nnue`
- Upstream release: <https://github.com/fairy-stockfish/Fairy-Stockfish-NNUE/releases/tag/xiangqi-c07e94a5c7cb>
- Executable SHA-256: `0284d80f8b1797927b5ff34a7303444d9c1beb9d3b0b236dbe5d5f814446d31f`
- Network license: CC0, as stated by the official Pikafish Networks project for Fairy-Stockfish's Xiangqi-variant weights.
- Engine license: GPL-3.0. If NinePalace later distributes this engine, include the corresponding source or a clear pointer to the exact source used to build the binary.

## Smoke test

From the NinePalace project root, run:

```powershell
node spikes/fairy-stockfish-cc0/smoke-test.cjs
```

The test selects the UCI `xiangqi` variant, requests a short search, and checks the returned move against NinePalace's existing Xiangqi rules library. It also replays a NinePalace move through Fairy-Stockfish and validates the engine's reply, covering the coordinate conversion in both directions.

## Result

- UCI handshake and Xiangqi variant selection: passed
- Fairy-Stockfish opening move `b3e3` translated to NinePalace `b2e2`: legal
- NinePalace history move `b2e2` translated to Fairy-Stockfish `b3e3`; engine reply `b9c7` translated to `b8c6`: legal
- Replayed history and second-ply reply: passed

## Decision boundary

Fairy-Stockfish uses Xiangqi rank numbers one higher than NinePalace's internal `a0`–`i9` coordinates, so an adapter must translate history, best moves, and analysis variations. Passing the smoke test establishes basic protocol and move-format compatibility only. It does not establish playing-strength parity with Pikafish. Keep Pikafish as the production default until a separate gameplay and licensing review is complete.
