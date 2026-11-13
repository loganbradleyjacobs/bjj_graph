import json
import random
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pathlib import Path

app = FastAPI()

# file must be in bjj_recursive_graph/app.py
BASE_DIR = Path(__file__).parent


def ensure_nodes_exist(data: dict, moves: list, default_type: str, parent_x: float, parent_y: float):
    """Scans moves for missing nodes and creates stubs for them."""
    nodes = data.get("positions") or {}
    for move in moves:
        for direction in ["from", "to"]:
            for node_id in move.get(direction, []):
                node_id = node_id.strip()
                if node_id and node_id not in nodes:
                    nodes[node_id] = {
                        "type": default_type,
                        "x": parent_x + random.uniform(-100, 100),
                        "y": parent_y + random.uniform(-100, 100),
                        "notes": "Auto-created stub",
                        "_stub": True
                    }
    data["positions"] = nodes

# Mount a "static" folder for html
app.mount("/static", StaticFiles(directory="static"), name="static")

# Serve static index.html
@app.get("/")
def read_index():
    return FileResponse(BASE_DIR / "static" / "index.html")

# Serve moveset.json
@app.get("/moveset")
def get_moveset():
    try:
        moveset_path = BASE_DIR / "moveset.json"
        with open(moveset_path, encoding='utf-8') as f:
            data = json.load(f)
        return data
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Moveset @ {moveset_path} not found.")


@app.post("/moveset/positions")
def save_positions(payload: dict):
    """Merge node x/y positions into moveset.json.

    Body: {"positions": {"NodeName": {"x": <float>, "y": <float>}, ...}}
    Nodes not present in the payload keep their current state.
    Nodes present in the payload but not in moveset.json are skipped.
    """
    positions = payload.get("positions")
    if not isinstance(positions, dict):
        raise HTTPException(
            status_code=400,
            detail="Body must contain a 'positions' object",
        )

    moveset_path = BASE_DIR / "moveset.json"
    if not moveset_path.exists():
        raise HTTPException(status_code=404, detail="moveset.json not found")

    data = json.loads(moveset_path.read_text(encoding="utf-8"))
    nodes = data.get("positions") or {}

    saved = 0
    skipped = 0
    for name, coords in positions.items():
        if name not in nodes:
            skipped += 1
            continue
        if not isinstance(coords, dict):
            skipped += 1
            continue
        x = coords.get("x")
        y = coords.get("y")
        if not isinstance(x, (int, float)) or not isinstance(y, (int, float)):
            skipped += 1
            continue
        nodes[name]["x"] = float(x)
        nodes[name]["y"] = float(y)
        saved += 1

    # Atomic-ish write with a backup of the previous state.
    backup_path = moveset_path.with_suffix(".json.bak")
    backup_path.write_text(moveset_path.read_text(encoding="utf-8"), encoding="utf-8")
    moveset_path.write_text(json.dumps(data, indent=2), encoding="utf-8")

    return {"saved": saved, "skipped": skipped, "total": len(nodes)}

@app.post("/moveset/node")
async def create_node(request: Request):
    payload = await request.json()
    title = payload.get("title", "").strip()
    node_type = payload.get("type", "Control")
    area = payload.get("area", [])
    notes = payload.get("notes", "")
    moves = payload.get("moves", [])

    if not title:
        raise HTTPException(status_code=400, detail="Title cannot be empty")

    moveset_path = BASE_DIR / "moveset.json"
    if not moveset_path.exists():
        raise HTTPException(status_code=404, detail="moveset.json not found")

    data = json.loads(moveset_path.read_text(encoding="utf-8"))
    nodes = data.get("positions") or {}

    if title in nodes:
        raise HTTPException(status_code=400, detail="Node already exists")

    # Create new node
    nodes[title] = {
        "type": node_type,
        "x": 0,
        "y": 0
    }
    if payload.get("stub") is True:
        nodes[title]["_stub"] = True
    if area:
        nodes[title]["area"] = area
    if notes:
        nodes[title]["notes"] = notes

    # Add new moves
    data_moves = data.get("moves") or []
    data_moves.extend(moves)
    data["moves"] = data_moves

    # Auto-create any missing nodes referenced in the connections
    ensure_nodes_exist(
        data,
        data_moves,
        default_type=node_type,
        parent_x=0,
        parent_y=0
    )

    data["positions"] = nodes

    backup_path = moveset_path.with_suffix(".json.bak")
    backup_path.write_text(moveset_path.read_text(encoding="utf-8"), encoding="utf-8")
    moveset_path.write_text(json.dumps(data, indent=2), encoding="utf-8")

    return {"status": "success"}

@app.put("/moveset/node/{node_id}")
async def update_node(node_id: str, request: Request):
    # Parse raw JSON to avoid Pydantic 422 validation errors on null/optional fields
    payload = await request.json()
    title = payload.get("title", "").strip()
    node_type = payload.get("type", "").strip()
    area = payload.get("area")
    notes = payload.get("notes", "")
    moves = payload.get("moves")

    if not title:
        raise HTTPException(status_code=400, detail="Title cannot be empty")

    moveset_path = BASE_DIR / "moveset.json"
    if not moveset_path.exists():
        raise HTTPException(status_code=404, detail="moveset.json not found")

    data = json.loads(moveset_path.read_text(encoding="utf-8"))
    nodes = data.get("positions") or {}

    if node_id not in nodes:
        raise HTTPException(status_code=404, detail=f"Node {node_id} not found")

    if title != node_id and title in nodes:
        raise HTTPException(status_code=400, detail="A node with that title already exists")

    # Update node properties
    node = nodes[node_id]
    node["type"] = node_type
    node["notes"] = notes

    if payload.get("stub") is True:
        node["_stub"] = True
    elif "_stub" in node:
        del node["_stub"]

    if area:
        node["area"] = area
    elif "area" in node:
        del node["area"]

    # Handle Rename
    if title != node_id:
        nodes[title] = nodes.pop(node_id)

    # Handle Moves Update
    if moves is not None:
        if title != node_id:
            for m in moves:
                if "from" in m:
                    m["from"] = [title if x == node_id else x for x in m["from"]]
                if "to" in m:
                    m["to"] = [title if x == node_id else x for x in m["to"]]
        data["moves"] = moves

        # Auto-create any missing nodes referenced in the connections
        ensure_nodes_exist(
            data,
            moves,
            default_type=node_type,
            parent_x=node.get("x", 0),
            parent_y=node.get("y", 0)
        )

    backup_path = moveset_path.with_suffix(".json.bak")
    backup_path.write_text(moveset_path.read_text(encoding="utf-8"), encoding="utf-8")
    moveset_path.write_text(json.dumps(data, indent=2), encoding="utf-8")

    return {"status": "success"}

@app.delete("/moveset/node/{node_id}")
def delete_node(node_id: str):
    moveset_path = BASE_DIR / "moveset.json"
    if not moveset_path.exists():
        raise HTTPException(status_code=404, detail="moveset.json not found")
        
    data = json.loads(moveset_path.read_text(encoding="utf-8"))
    nodes = data.get("positions") or {}
    
    if node_id not in nodes:
        raise HTTPException(status_code=404, detail="Node not found")
        
    del nodes[node_id]
    
    # Trim moves that reference the deleted node, keeping valid connections
    trimmed_moves = []
    for m in (data.get("moves") or []):
        new_from = [x for x in m.get("from", []) if x != node_id]
        new_to = [x for x in m.get("to", []) if x != node_id]
        if new_from and new_to:
            m["from"] = new_from
            m["to"] = new_to
            trimmed_moves.append(m)
    data["moves"] = trimmed_moves
    
    backup_path = moveset_path.with_suffix(".json.bak")
    backup_path.write_text(moveset_path.read_text(encoding="utf-8"), encoding="utf-8")
    moveset_path.write_text(json.dumps(data, indent=2), encoding="utf-8")
    
    return {"status": "success"}

@app.post("/moveset/restore")
def restore_moveset():
    moveset_path = BASE_DIR / "moveset.json"
    backup_path = moveset_path.with_suffix(".json.bak")
    if not backup_path.exists():
        raise HTTPException(status_code=404, detail="No backup found")
    moveset_path.write_text(backup_path.read_text(encoding="utf-8"), encoding="utf-8")
    return {"status": "restored"}
