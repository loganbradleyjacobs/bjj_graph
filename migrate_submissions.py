"""
migrate_submissions.py
Promote submission moves (edges) to submission nodes.

Effects:
  * Any move with type "Submission" becomes a node with type "Submission".
  * Its "from" positions become "Finish" edges into the node.
  * Its "to" positions become "Escape" edges out of the node.
  * Rich metadata on the move (notes/images/videos/area) is copied onto the node.
  * The redundant stub position "Clock Choke From Back" is removed, along
    with any move that references it.

Run once: python migrate_submissions.py
Output:   moveset.new.json  (inspect, then replace moveset.json)
"""

import json
from pathlib import Path

BASE = Path(__file__).parent
IN_PATH = BASE / "moveset.json"
OUT_PATH = BASE / "moveset.new.json"

# Stub position to delete during this migration. The promotion of the
# "Clock Choke" submission already creates a Finish edge from Body Triangle,
# so this stub is redundant.
REMOVE_POSITIONS = {"Clock Choke From Back"}

# Metadata keys that may live on a move and should be carried onto the node.
CARRY_KEYS = ("area", "image", "images", "notes", "video", "videos")


def main() -> None:
    data = json.loads(IN_PATH.read_text(encoding="utf-8"))
    positions = dict(data.get("positions", {}))
    moves = list(data.get("moves", []))
    warnings: list[str] = []

    # 1. Drop redundant stub positions.
    for name in REMOVE_POSITIONS:
        if name in positions:
            del positions[name]
            print(f"Removed stub position: {name!r}")

    # 2. Drop any move that references a removed stub.
    kept_moves = []
    for move in moves:
        refs = set(move.get("from", [])) | set(move.get("to", []))
        if refs & REMOVE_POSITIONS:
            print(f"Removed move referencing removed stub: {move}")
            continue
        kept_moves.append(move)
    moves = kept_moves

    # 3. Promote submissions.
    new_moves: list[dict] = []
    for move in moves:
        if move.get("type") != "Submission":
            new_moves.append(move)
            continue

        name = move.get("name")
        if not name:
            warnings.append(f"Submission move with no name; left as edge: {move!r}")
            new_moves.append(move)
            continue

        if name in positions and positions[name].get("type") != "Submission":
            warnings.append(
                f"Position {name!r} exists and is not a Submission; "
                f"overwriting its type to 'Submission'"
            )

        node = positions.get(name, {})
        node["type"] = "Submission"
        for key in CARRY_KEYS:
            if key in move and key not in node:
                node[key] = move[key]
        positions[name] = node

        froms = move.get("from", [])
        tos = move.get("to", [])

        if not froms:
            warnings.append(
                f"Submission {name!r} has no entry (empty 'from'); "
                f"it will be an orphan node"
            )

        for f in froms:
            if f == name:
                warnings.append(f"Self-referential finish edge skipped: {name!r} -> {name!r}")
                continue
            new_moves.append({"type": "Finish", "from": [f], "to": [name]})

        for t in tos:
            if t == name:
                continue
            new_moves.append({"type": "Escape", "from": [name], "to": [t]})

    out = {"positions": positions, "moves": new_moves}
    OUT_PATH.write_text(json.dumps(out, indent=2), encoding="utf-8")
    print(f"\nWrote {OUT_PATH}: {len(positions)} positions, {len(new_moves)} moves")
    if warnings:
        print(f"\n{len(warnings)} warning(s):")
        for w in warnings:
            print(" -", w)


if __name__ == "__main__":
    main()