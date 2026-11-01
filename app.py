import json
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from pathlib import Path
from typing import Dict, Any, List, Optional
from pydantic import BaseModel
import mysql.connector
import threading
from datetime import datetime
import os
from dotenv import load_dotenv

app = FastAPI()

# file must be in bjj_recursive_graph/app.py
BASE_DIR = Path(__file__).parent

# MySQL Database Connection Configuration
load_dotenv(os.environ.get("DOTENV_PATH", ".env"))

DB_CONFIG = {
    "host": os.environ.get("MYSQL_HOST", "localhost"),
    "user": os.environ.get("MYSQL_USER", "root"),
    "password": os.environ.get("MYSQL_PASSWORD", ""),
    "database": os.environ.get("MYSQL_DATABASE", "bjj"),
    "port": int(os.environ.get("MYSQL_PORT", "3306")),
    "charset": "utf8mb4",
}

def _maybe_json(value):
    """Decode JSON values returned as strings while preserving native values."""
    return json.loads(value) if isinstance(value, str) else value

# Mount a "static" folder for html
app.mount("/static", StaticFiles(directory="static"), name="static")

# Global database connection (thread-safe)
_db_connection = None
_connection_lock = threading.Lock()

def get_db_connection():
    """Get a thread-safe database connection"""
    global _db_connection
    if _db_connection is None or not _db_connection.is_connected():
        with _connection_lock:
            # Re-initialize connection if needed
            try:
                _db_connection = mysql.connector.connect(**DB_CONFIG)
            except mysql.connector.Error as err:
                print(f"Database connection error: {err}")
                raise HTTPException(status_code=500, detail=f"Database connection failed: {err}")
    return _db_connection

# Pydantic models for request validation
class NodeCreate(BaseModel):
    name: str
    area: List[str]
    type: str
    image_path: Optional[str] = None
    video_path: Optional[str] = None

class NodeUpdate(BaseModel):
    name: Optional[str] = None
    area: Optional[List[str]] = None
    type: Optional[str] = None
    image_path: Optional[str] = None
    video_path: Optional[str] = None

class NodeResponse(NodeCreate):
    id: int
    created_at: Any
    updated_at: Any

class PropertyCreate(BaseModel):
    node_id: int
    property_name: str
    property_value: Any

class PropertyResponse(PropertyCreate):
    id: int
    created_at: Any

class EdgeCreate(BaseModel):
    source_node_id: int
    target_node_id: int
    edge_data: Optional[Dict[str, Any]] = None

class EdgeUpdate(BaseModel):
    source_node_id: Optional[int] = None
    target_node_id: Optional[int] = None
    edge_data: Optional[Dict[str, Any]] = None

class EdgeResponse(EdgeCreate):
    id: int
    created_at: Any

# Existing endpoints (preserved for backward compatibility)
@app.get("/")
@app.head("/")
def read_index():
    return FileResponse(BASE_DIR / "static" / "index.html")

@app.get("/moveset")
def get_moveset():
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        
        # Node records and graph relationships have separate sources of truth.
        cursor.execute("""
            SELECT id, name, area, type, image_path, video_path
            FROM nodes ORDER BY name
        """)
        rows = cursor.fetchall()
        cursor.execute("SELECT id, source_node_id, target_node_id, edge_data FROM edges")
        edges = cursor.fetchall()
        cursor.close()

        id_to_name = {row["id"]: row["name"] for row in rows}
        moveset = {}
        for row in rows:
            moveset[row["name"]] = {
                "parents": [], "children": {},
                "area": _maybe_json(row["area"]) or [],
                "type": row["type"], "image": row["image_path"], "video": row["video_path"],
            }
        for edge in edges:
            source = id_to_name.get(edge["source_node_id"])
            target = id_to_name.get(edge["target_node_id"])
            if source is None or target is None:
                continue
            edge_data = _maybe_json(edge["edge_data"]) or {}
            moveset[source]["children"][target] = {**edge_data, "edge_id": edge["id"]}
            moveset[target]["parents"].append(source)
        return moveset
        
    except mysql.connector.Error as err:
        print(f"Database error: {err}")
        raise HTTPException(status_code=500, detail=f"Database error: {err}")
    except Exception as err:
        print(f"Unexpected error: {err}")
        raise HTTPException(status_code=500, detail=f"Unexpected error: {err}")

@app.post("/moveset")
async def save_moveset(moveset_data: Dict[str, Any], background_tasks: BackgroundTasks):
    """
    Save moveset data to the database.
    This will:
    1. Clear existing data
    2. Insert nodes with properties
    3. Insert edges
    """
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Disable foreign key checks for data import
        cursor.execute("SET FOREIGN_KEY_CHECKS = 0")
        
        # Clear existing data
        cursor.execute("DELETE FROM edges")
        cursor.execute("DELETE FROM properties")
        cursor.execute("DELETE FROM move_areas")
        cursor.execute("DELETE FROM nodes")
        
        # Insert nodes
        for node_name, node_data in moveset_data.items():
            cursor.execute("""
                INSERT INTO nodes (name, area, type, image_path, video_path)
                VALUES (%s, %s, %s, %s, %s)
            """, (
                node_name,
                json.dumps(node_data.get('area', [])),
                node_data.get('type'),
                node_data.get('image'),
                node_data.get('video')
            ))
            
            node_id = cursor.lastrowid
            
            # Insert node properties
            if 'parents' in node_data and node_data['parents']:
                cursor.execute("""
                    INSERT INTO properties (node_id, property_name, property_value)
                    VALUES (%s, %s, %s)
                """, (node_id, 'parents', json.dumps(node_data['parents'])))
            
            if 'children' in node_data and node_data['children']:
                cursor.execute("""
                    INSERT INTO properties (node_id, property_name, property_value)
                    VALUES (%s, %s, %s)
                """, (node_id, 'children', json.dumps(node_data['children'])))
            
            # Insert areas
            if 'area' in node_data and node_data['area']:
                for area in node_data['area']:
                    cursor.execute("""
                        INSERT INTO move_areas (node_id, area)
                        VALUES (%s, %s)
                    """, (node_id, area))
        
        # Insert edges
        for parent_name, parent_data in moveset_data.items():
            cursor.execute("SELECT id FROM nodes WHERE name = %s", (parent_name,))
            parent_result = cursor.fetchone()
            if not parent_result:
                continue
                
            parent_id = parent_result[0]
            
            children = parent_data.get('children', {})
            if not children:
                continue
                
            if isinstance(children, list):
                for child_name in children:
                    cursor.execute("SELECT id FROM nodes WHERE name = %s", (child_name,))
                    child_result = cursor.fetchone()
                    if not child_result:
                        continue
                        
                    child_id = child_result[0]
                    
                    cursor.execute("SELECT id FROM edges WHERE source_node_id = %s AND target_node_id = %s", 
                                 (parent_id, child_id))
                    if not cursor.fetchone():
                        cursor.execute("""
                            INSERT INTO edges (source_node_id, target_node_id, edge_data)
                            VALUES (%s, %s, %s)
                        """, (parent_id, child_id, json.dumps({})))
            
            elif isinstance(children, dict):
                for child_name, child_meta in children.items():
                    cursor.execute("SELECT id FROM nodes WHERE name = %s", (child_name,))
                    child_result = cursor.fetchone()
                    if not child_result:
                        continue
                        
                    child_id = child_result[0]
                    
                    cursor.execute("SELECT id FROM edges WHERE source_node_id = %s AND target_node_id = %s", 
                                 (parent_id, child_id))
                    if not cursor.fetchone():
                        cursor.execute("""
                            INSERT INTO edges (source_node_id, target_node_id, edge_data)
                            VALUES (%s, %s, %s)
                        """, (parent_id, child_id, json.dumps(child_meta)))
        
        cursor.execute("SET FOREIGN_KEY_CHECKS = 1")
        conn.commit()
        cursor.close()
        
        return {
            "status": "success",
            "message": f"Successfully saved moveset data: {len(moveset_data)} nodes",
            "nodes_count": len(moveset_data)
        }
        
    except mysql.connector.Error as err:
        print(f"Database error: {err}")
        if conn:
            try:
                cursor.execute("SET FOREIGN_KEY_CHECKS = 1")
                conn.rollback()
            except:
                pass
        raise HTTPException(status_code=500, detail=f"Database error: {err}")
    except Exception as err:
        print(f"Unexpected error: {err}")
        if conn:
            try:
                cursor.execute("SET FOREIGN_KEY_CHECKS = 1")
                conn.rollback()
            except:
                pass
        raise HTTPException(status_code=500, detail=f"Unexpected error: {err}")

@app.post("/initialize")
async def initialize_database(background_tasks: BackgroundTasks):
    """Initialize database from moveset.json file"""
    try:
        moveset_path = BASE_DIR / "moveset.json"
        with open(moveset_path, encoding='utf-8') as f:
            moveset_data = json.load(f)
        
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute("SET FOREIGN_KEY_CHECKS = 0")
        
        cursor.execute("DELETE FROM edges")
        cursor.execute("DELETE FROM properties")
        cursor.execute("DELETE FROM move_areas")
        cursor.execute("DELETE FROM nodes")
        
        for node_name, node_data in moveset_data.items():
            cursor.execute("""
                INSERT INTO nodes (name, area, type, image_path, video_path)
                VALUES (%s, %s, %s, %s, %s)
            """, (
                node_name,
                json.dumps(node_data.get('area', [])),
                node_data.get('type'),
                node_data.get('image'),
                node_data.get('video')
            ))
            
            node_id = cursor.lastrowid
            
            if 'parents' in node_data and node_data['parents']:
                cursor.execute("""
                    INSERT INTO properties (node_id, property_name, property_value)
                    VALUES (%s, %s, %s)
                """, (node_id, 'parents', json.dumps(node_data['parents'])))
            
            if 'children' in node_data and node_data['children']:
                cursor.execute("""
                    INSERT INTO properties (node_id, property_name, property_value)
                    VALUES (%s, %s, %s)
                """, (node_id, 'children', json.dumps(node_data['children'])))
            
            if 'area' in node_data and node_data['area']:
                for area in node_data['area']:
                    cursor.execute("""
                        INSERT INTO move_areas (node_id, area)
                        VALUES (%s, %s)
                    """, (node_id, area))
        
        for parent_name, parent_data in moveset_data.items():
            cursor.execute("SELECT id FROM nodes WHERE name = %s", (parent_name,))
            parent_result = cursor.fetchone()
            if not parent_result:
                continue
                
            parent_id = parent_result[0]
            
            children = parent_data.get('children', {})
            if not children:
                continue
                
            if isinstance(children, list):
                for child_name in children:
                    cursor.execute("SELECT id FROM nodes WHERE name = %s", (child_name,))
                    child_result = cursor.fetchone()
                    if not child_result:
                        continue
                        
                    child_id = child_result[0]
                    
                    cursor.execute("SELECT id FROM edges WHERE source_node_id = %s AND target_node_id = %s", 
                                 (parent_id, child_id))
                    if not cursor.fetchone():
                        cursor.execute("""
                            INSERT INTO edges (source_node_id, target_node_id, edge_data)
                            VALUES (%s, %s, %s)
                        """, (parent_id, child_id, json.dumps({})))
            
            elif isinstance(children, dict):
                for child_name, child_meta in children.items():
                    cursor.execute("SELECT id FROM nodes WHERE name = %s", (child_name,))
                    child_result = cursor.fetchone()
                    if not child_result:
                        continue
                        
                    child_id = child_result[0]
                    
                    cursor.execute("SELECT id FROM edges WHERE source_node_id = %s AND target_node_id = %s", 
                                 (parent_id, child_id))
                    if not cursor.fetchone():
                        cursor.execute("""
                            INSERT INTO edges (source_node_id, target_node_id, edge_data)
                            VALUES (%s, %s, %s)
                        """, (parent_id, child_id, json.dumps(child_meta)))
        
        cursor.execute("SET FOREIGN_KEY_CHECKS = 1")
        conn.commit()
        cursor.close()
        
        return {
            "status": "success",
            "message": f"Database initialized from moveset.json: {len(moveset_data)} nodes",
            "nodes_count": len(moveset_data)
        }
        
    except mysql.connector.Error as err:
        print(f"Database error: {err}")
        if conn:
            try:
                cursor.execute("SET FOREIGN_KEY_CHECKS = 1")
                conn.rollback()
            except:
                pass
        raise HTTPException(status_code=500, detail=f"Database error: {err}")
    except Exception as err:
        print(f"Unexpected error: {err}")
        if conn:
            try:
                cursor.execute("SET FOREIGN_KEY_CHECKS = 1")
                conn.rollback()
            except:
                pass
        raise HTTPException(status_code=500, detail=f"Unexpected error: {err}")

@app.get("/health")
def health_check():
    try:
        conn = get_db_connection()
        if conn.is_connected():
            return {"status": "healthy", "database": "connected"}
        else:
            return {"status": "unhealthy", "database": "not connected"}
    except Exception as err:
        return {"status": "error", "message": str(err)}

@app.get("/stats")
def get_stats():
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        
        stats = {}
        
        cursor.execute("SELECT COUNT(*) as count FROM nodes")
        stats['nodes'] = cursor.fetchone()['count']
        
        cursor.execute("SELECT COUNT(*) as count FROM edges")
        stats['edges'] = cursor.fetchone()['count']
        
        cursor.execute("SELECT COUNT(*) as count FROM properties")
        stats['properties'] = cursor.fetchone()['count']
        
        cursor.execute("SELECT COUNT(*) as count FROM move_areas")
        stats['move_areas'] = cursor.fetchone()['count']
        
        cursor.close()
        
        return stats
        
    except mysql.connector.Error as err:
        print(f"Database error: {err}")
        raise HTTPException(status_code=500, detail=f"Database error: {err}")

# =============================================================================
# NEW CRUD ENDPOINTS FOR NODES
# =============================================================================

@app.post("/nodes", response_model=NodeResponse, status_code=201)
async def create_node(node_data: NodeCreate):
    """Create a new node in the graph"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        
        # Check if node with same name already exists
        cursor.execute("SELECT id FROM nodes WHERE name = %s", (node_data.name,))
        if cursor.fetchone():
            cursor.close()
            raise HTTPException(
                status_code=409, 
                detail=f"Node with name '{node_data.name}' already exists"
            )
        
        # Insert the new node
        cursor.execute("""
            INSERT INTO nodes (name, area, type, image_path, video_path)
            VALUES (%s, %s, %s, %s, %s)
        """, (
            node_data.name,
            json.dumps(node_data.area),
            node_data.type,
            node_data.image_path,
            node_data.video_path
        ))
        
        node_id = cursor.lastrowid
        
        # Get the created node
        cursor.execute("SELECT * FROM nodes WHERE id = %s", (node_id,))
        created_node = cursor.fetchone()
        
        cursor.close()
        conn.commit()
        
        return NodeResponse(
            id=created_node['id'],
            name=created_node['name'],
            area=_maybe_json(created_node['area']) or [],
            type=created_node['type'],
            image_path=created_node['image_path'],
            video_path=created_node['video_path'],
            created_at=created_node['created_at'],
            updated_at=created_node['updated_at']
        )
        
    except mysql.connector.Error as err:
        print(f"Database error: {err}")
        raise HTTPException(status_code=500, detail=f"Database error: {err}")
    except Exception as err:
        print(f"Unexpected error: {err}")
        raise HTTPException(status_code=500, detail=f"Unexpected error: {err}")

@app.get("/nodes", response_model=List[NodeResponse])
async def list_nodes():
    """List all nodes in the graph"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        
        cursor.execute("SELECT * FROM nodes ORDER BY name")
        nodes = cursor.fetchall()
        
        cursor.close()
        
        return [
            NodeResponse(
                id=node['id'],
                name=node['name'],
                area=_maybe_json(node['area']) or [],
                type=node['type'],
                image_path=node['image_path'],
                video_path=node['video_path'],
                created_at=node['created_at'],
                updated_at=node['updated_at']
            )
            for node in nodes
        ]
        
    except mysql.connector.Error as err:
        print(f"Database error: {err}")
        raise HTTPException(status_code=500, detail=f"Database error: {err}")
    except Exception as err:
        print(f"Unexpected error: {err}")
        raise HTTPException(status_code=500, detail=f"Unexpected error: {err}")

@app.get("/nodes/{node_id}", response_model=NodeResponse)
async def get_node(node_id: int):
    """Get a specific node by ID"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        
        cursor.execute("SELECT * FROM nodes WHERE id = %s", (node_id,))
        node = cursor.fetchone()
        
        cursor.close()
        
        if not node:
            raise HTTPException(status_code=404, detail=f"Node with ID {node_id} not found")
        
        return NodeResponse(
            id=node['id'],
            name=node['name'],
            area=_maybe_json(node['area']) or [],
            type=node['type'],
            image_path=node['image_path'],
            video_path=node['video_path'],
            created_at=node['created_at'],
            updated_at=node['updated_at']
        )
        
    except mysql.connector.Error as err:
        print(f"Database error: {err}")
        raise HTTPException(status_code=500, detail=f"Database error: {err}")
    except Exception as err:
        print(f"Unexpected error: {err}")
        raise HTTPException(status_code=500, detail=f"Unexpected error: {err}")

@app.put("/nodes/{node_id}", response_model=NodeResponse)
async def update_node(node_id: int, node_data: NodeUpdate):
    """Update an existing node"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        
        # Check if node exists
        cursor.execute("SELECT * FROM nodes WHERE id = %s", (node_id,))
        existing_node = cursor.fetchone()
        
        if not existing_node:
            cursor.close()
            raise HTTPException(status_code=404, detail=f"Node with ID {node_id} not found")
        
        # Prepare update values
        update_fields = []
        update_values = []
        
        if node_data.name is not None:
            # Check if new name conflicts with existing node
            cursor.execute("SELECT id FROM nodes WHERE name = %s AND id != %s", (node_data.name, node_id))
            if cursor.fetchone():
                cursor.close()
                raise HTTPException(
                    status_code=409, 
                    detail=f"Node with name '{node_data.name}' already exists"
                )
            
            update_fields.append("name = %s")
            update_values.append(node_data.name)
        
        if node_data.area is not None:
            update_fields.append("area = %s")
            update_values.append(json.dumps(node_data.area))
        
        if node_data.type is not None:
            update_fields.append("type = %s")
            update_values.append(node_data.type)
        
        if node_data.image_path is not None:
            update_fields.append("image_path = %s")
            update_values.append(node_data.image_path)
        
        if node_data.video_path is not None:
            update_fields.append("video_path = %s")
            update_values.append(node_data.video_path)
        
        if not update_fields:
            cursor.close()
            raise HTTPException(status_code=400, detail="No fields to update")
        
        # Execute update
        update_query = f"UPDATE nodes SET {', '.join(update_fields)} WHERE id = %s"
        update_values.append(node_id)
        cursor.execute(update_query, update_values)
        
        # Get the updated node
        cursor.execute("SELECT * FROM nodes WHERE id = %s", (node_id,))
        updated_node = cursor.fetchone()
        
        cursor.close()
        conn.commit()
        
        return NodeResponse(
            id=updated_node['id'],
            name=updated_node['name'],
            area=_maybe_json(updated_node['area']) or [],
            type=updated_node['type'],
            image_path=updated_node['image_path'],
            video_path=updated_node['video_path'],
            created_at=updated_node['created_at'],
            updated_at=updated_node['updated_at']
        )
        
    except mysql.connector.Error as err:
        print(f"Database error: {err}")
        raise HTTPException(status_code=500, detail=f"Database error: {err}")
    except Exception as err:
        print(f"Unexpected error: {err}")
        raise HTTPException(status_code=500, detail=f"Unexpected error: {err}")

@app.delete("/nodes/{node_id}")
async def delete_node(node_id: int):
    """Delete a node from the graph"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        
        # Check if node exists
        cursor.execute("SELECT name FROM nodes WHERE id = %s", (node_id,))
        node = cursor.fetchone()
        
        if not node:
            cursor.close()
            raise HTTPException(status_code=404, detail=f"Node with ID {node_id} not found")
        
        # Delete related properties and edges first
        cursor.execute("DELETE FROM properties WHERE node_id = %s", (node_id,))
        cursor.execute("DELETE FROM move_areas WHERE node_id = %s", (node_id,))
        
        # Delete edges where the node is source or target
        cursor.execute("DELETE FROM edges WHERE source_node_id = %s OR target_node_id = %s", (node_id, node_id))
        
        # Delete the node
        cursor.execute("DELETE FROM nodes WHERE id = %s", (node_id,))
        
        cursor.close()
        conn.commit()
        
        return {
            "status": "success",
            "message": f"Node '{node['name']}' (ID: {node_id}) deleted successfully",
            "deleted_node_id": node_id
        }
        
    except mysql.connector.Error as err:
        print(f"Database error: {err}")
        raise HTTPException(status_code=500, detail=f"Database error: {err}")
    except Exception as err:
        print(f"Unexpected error: {err}")
        raise HTTPException(status_code=500, detail=f"Unexpected error: {err}")

# =============================================================================
# NEW CRUD ENDPOINTS FOR EDGES
# =============================================================================

@app.post("/edges", response_model=EdgeResponse, status_code=201)
async def create_edge(edge_data: EdgeCreate):
    """Create a new edge in the graph"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        
        # Check if source and target nodes exist
        cursor.execute("SELECT id, name FROM nodes WHERE id IN (%s, %s)", 
                      (edge_data.source_node_id, edge_data.target_node_id))
        nodes = cursor.fetchall()
        
        if len(nodes) != 2:
            cursor.close()
            missing_ids = []
            for expected_id in [edge_data.source_node_id, edge_data.target_node_id]:
                if not any(n['id'] == expected_id for n in nodes):
                    missing_ids.append(expected_id)
            
            raise HTTPException(
                status_code=404, 
                detail=f"Node(s) not found. Missing IDs: {missing_ids}"
            )
        
        # Check if edge already exists
        cursor.execute("SELECT * FROM edges WHERE source_node_id = %s AND target_node_id = %s", 
                      (edge_data.source_node_id, edge_data.target_node_id))
        if cursor.fetchone():
            cursor.close()
            raise HTTPException(
                status_code=409,
                detail=f"Edge from node {edge_data.source_node_id} to {edge_data.target_node_id} already exists"
            )
        
        # Insert the new edge
        cursor.execute("""
            INSERT INTO edges (source_node_id, target_node_id, edge_data)
            VALUES (%s, %s, %s)
        """, (
            edge_data.source_node_id,
            edge_data.target_node_id,
            json.dumps(edge_data.edge_data) if edge_data.edge_data else json.dumps({})
        ))
        
        edge_id = cursor.lastrowid
        
        # Get the created edge
        cursor.execute("SELECT * FROM edges WHERE id = %s", (edge_id,))
        created_edge = cursor.fetchone()
        
        cursor.close()
        conn.commit()
        
        return EdgeResponse(
            id=created_edge['id'],
            source_node_id=created_edge['source_node_id'],
            target_node_id=created_edge['target_node_id'],
            edge_data=_maybe_json(created_edge['edge_data']) or {},
            created_at=created_edge['created_at']
        )
        
    except mysql.connector.Error as err:
        print(f"Database error: {err}")
        raise HTTPException(status_code=500, detail=f"Database error: {err}")
    except Exception as err:
        print(f"Unexpected error: {err}")
        raise HTTPException(status_code=500, detail=f"Unexpected error: {err}")

@app.get("/edges", response_model=List[EdgeResponse])
async def list_edges():
    """List all edges in the graph"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        
        cursor.execute("SELECT * FROM edges ORDER BY created_at DESC")
        edges = cursor.fetchall()
        
        cursor.close()
        
        return [
            EdgeResponse(
                id=edge['id'],
                source_node_id=edge['source_node_id'],
                target_node_id=edge['target_node_id'],
                edge_data=_maybe_json(edge['edge_data']) or {},
                created_at=edge['created_at']
            )
            for edge in edges
        ]
        
    except mysql.connector.Error as err:
        print(f"Database error: {err}")
        raise HTTPException(status_code=500, detail=f"Database error: {err}")
    except Exception as err:
        print(f"Unexpected error: {err}")
        raise HTTPException(status_code=500, detail=f"Unexpected error: {err}")

@app.get("/edges/{edge_id}", response_model=EdgeResponse)
async def get_edge(edge_id: int):
    """Get a specific edge by ID"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        
        cursor.execute("SELECT * FROM edges WHERE id = %s", (edge_id,))
        edge = cursor.fetchone()
        
        cursor.close()
        
        if not edge:
            raise HTTPException(status_code=404, detail=f"Edge with ID {edge_id} not found")
        
        return EdgeResponse(
            id=edge['id'],
            source_node_id=edge['source_node_id'],
            target_node_id=edge['target_node_id'],
            edge_data=_maybe_json(edge['edge_data']) or {},
            created_at=edge['created_at']
        )
        
    except mysql.connector.Error as err:
        print(f"Database error: {err}")
        raise HTTPException(status_code=500, detail=f"Database error: {err}")
    except Exception as err:
        print(f"Unexpected error: {err}")
        raise HTTPException(status_code=500, detail=f"Unexpected error: {err}")

@app.put("/edges/{edge_id}", response_model=EdgeResponse)
async def update_edge(edge_id: int, edge_data: EdgeUpdate):
    """Update an existing edge"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        
        # Check if edge exists
        cursor.execute("SELECT * FROM edges WHERE id = %s", (edge_id,))
        existing_edge = cursor.fetchone()
        
        if not existing_edge:
            cursor.close()
            raise HTTPException(status_code=404, detail=f"Edge with ID {edge_id} not found")
        
        # Validate source and target nodes if provided
        if edge_data.source_node_id is not None or edge_data.target_node_id is not None:
            source_id = edge_data.source_node_id if edge_data.source_node_id is not None else existing_edge['source_node_id']
            target_id = edge_data.target_node_id if edge_data.target_node_id is not None else existing_edge['target_node_id']
            
            # Check if nodes exist
            cursor.execute("SELECT id FROM nodes WHERE id IN (%s, %s)", (source_id, target_id))
            nodes = cursor.fetchall()
            
            if len(nodes) != 2:
                cursor.close()
                raise HTTPException(
                    status_code=404,
                    detail="One or both nodes do not exist"
                )
            
            # Check if new edge would conflict
            cursor.execute("SELECT * FROM edges WHERE source_node_id = %s AND target_node_id = %s AND id != %s", 
                          (source_id, target_id, edge_id))
            if cursor.fetchone():
                cursor.close()
                raise HTTPException(
                    status_code=409,
                    detail=f"Edge from node {source_id} to {target_id} already exists"
                )
        
        # Prepare update values
        update_fields = []
        update_values = []
        
        if edge_data.source_node_id is not None:
            update_fields.append("source_node_id = %s")
            update_values.append(edge_data.source_node_id)
        
        if edge_data.target_node_id is not None:
            update_fields.append("target_node_id = %s")
            update_values.append(edge_data.target_node_id)
        
        if edge_data.edge_data is not None:
            update_fields.append("edge_data = %s")
            update_values.append(json.dumps(edge_data.edge_data))
        
        if not update_fields:
            cursor.close()
            raise HTTPException(status_code=400, detail="No fields to update")
        
        # Execute update
        update_query = f"UPDATE edges SET {', '.join(update_fields)} WHERE id = %s"
        update_values.append(edge_id)
        cursor.execute(update_query, update_values)
        
        # Get the updated edge
        cursor.execute("SELECT * FROM edges WHERE id = %s", (edge_id,))
        updated_edge = cursor.fetchone()
        
        cursor.close()
        conn.commit()
        
        return EdgeResponse(
            id=updated_edge['id'],
            source_node_id=updated_edge['source_node_id'],
            target_node_id=updated_edge['target_node_id'],
            edge_data=_maybe_json(updated_edge['edge_data']) or {},
            created_at=updated_edge['created_at']
        )
        
    except mysql.connector.Error as err:
        print(f"Database error: {err}")
        raise HTTPException(status_code=500, detail=f"Database error: {err}")
    except Exception as err:
        print(f"Unexpected error: {err}")
        raise HTTPException(status_code=500, detail=f"Unexpected error: {err}")

@app.delete("/edges/{edge_id}")
async def delete_edge(edge_id: int):
    """Delete an edge from the graph"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        
        # Check if edge exists
        cursor.execute("SELECT source_node_id, target_node_id FROM edges WHERE id = %s", (edge_id,))
        edge = cursor.fetchone()
        
        if not edge:
            cursor.close()
            raise HTTPException(status_code=404, detail=f"Edge with ID {edge_id} not found")
        
        # Delete the edge
        cursor.execute("DELETE FROM edges WHERE id = %s", (edge_id,))
        
        cursor.close()
        conn.commit()
        
        return {
            "status": "success",
            "message": f"Edge from node {edge['source_node_id']} to {edge['target_node_id']} (ID: {edge_id}) deleted successfully",
            "deleted_edge_id": edge_id,
            "source_node_id": edge['source_node_id'],
            "target_node_id": edge['target_node_id']
        }
        
    except mysql.connector.Error as err:
        print(f"Database error: {err}")
        raise HTTPException(status_code=500, detail=f"Database error: {err}")
    except Exception as err:
        print(f"Unexpected error: {err}")
        raise HTTPException(status_code=500, detail=f"Unexpected error: {err}")

@app.get("/graph-stats")
async def get_graph_statistics():
    """Get comprehensive graph statistics"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        
        # Get all nodes with their connection counts
        cursor.execute("""
            SELECT 
                n.id, 
                n.name, 
                n.type,
                (SELECT COUNT(*) FROM edges WHERE source_node_id = n.id) as outgoing_edges,
                (SELECT COUNT(*) FROM edges WHERE target_node_id = n.id) as incoming_edges,
                (SELECT COUNT(*) FROM edges WHERE source_node_id = n.id OR target_node_id = n.id) as total_connections
            FROM nodes n
            ORDER BY n.name
        """)
        
        nodes_with_stats = cursor.fetchall()
        
        # Calculate overall statistics
        total_nodes = len(nodes_with_stats)
        total_edges = sum(node['total_connections'] for node in nodes_with_stats) // 2
        
        node_types = {}
        for node in nodes_with_stats:
            node_type = node['type']
            node_types[node_type] = node_types.get(node_type, 0) + 1
        
        edges_by_type = {}
        cursor.execute("""
            SELECT e.edge_data, n1.name as source_name, n2.name as target_name
            FROM edges e
            JOIN nodes n1 ON e.source_node_id = n1.id
            JOIN nodes n2 ON e.target_node_id = n2.id
        """)
        
        edges = cursor.fetchall()
        for edge in edges:
            edge_type = edge['edge_data'].get('type', 'standard') if edge['edge_data'] else 'standard'
            edges_by_type[edge_type] = edges_by_type.get(edge_type, 0) + 1
        
        cursor.close()
        
        return {
            "total_nodes": total_nodes,
            "total_edges": total_edges,
            "node_types": node_types,
            "edges_by_type": edges_by_type,
            "average_connections_per_node": total_edges / total_nodes if total_nodes > 0 else 0,
            "nodes_with_stats": nodes_with_stats
        }
        
    except mysql.connector.Error as err:
        print(f"Database error: {err}")
        raise HTTPException(status_code=500, detail=f"Database error: {err}")
    except Exception as err:
        print(f"Unexpected error: {err}")
        raise HTTPException(status_code=500, detail=f"Unexpected error: {err}")
