import json
import mysql.connector
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pathlib import Path
from typing import Dict, Any
import threading

app = FastAPI()

# file must be in bjj_recursive_graph/app.py
BASE_DIR = Path(__file__).parent

# MySQL Database Connection Configuration
DB_CONFIG = {
    "host": "localhost",
    "user": "root",
    "password": "",
    "database": "bjj",
    "port": 3306,
    "charset": "utf8mb4"
}

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

@app.get("/")
def read_index():
    return FileResponse(BASE_DIR / "static" / "index.html")

# Serve moveset.json (from database)
@app.get("/moveset")
def get_moveset():
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        
        # Get all nodes with their properties
        cursor.execute("""
            SELECT n.id, n.name, n.area, n.type, n.image_path, n.video_path,
                   p.property_name, p.property_value
            FROM nodes n
            LEFT JOIN properties p ON n.id = p.node_id
            ORDER BY n.name
        """)
        
        rows = cursor.fetchall()
        cursor.close()
        
        # Build the moveset structure
        moveset = {}
        current_node = None
        
        for row in rows:
            node_name = row['name']
            if node_name not in moveset:
                moveset[node_name] = {
                    "parents": [],
                    "children": {},
                    "area": row['area'] if row['area'] else [],
                    "type": row['type'],
                    "image": row['image_path'],
                    "video": row['video_path']
                }
                current_node = moveset[node_name]
            
            # Add parent relationships
            if row['property_name'] == 'parents' and row['property_value']:
                current_node['parents'] = row['property_value']
            
            # Add children relationships  
            elif row['property_name'] == 'children' and row['property_value']:
                children = json.loads(row['property_value']) if isinstance(row['property_value'], str) else row['property_value']
                current_node['children'] = children
                
        return moveset
        
    except mysql.connector.Error as err:
        print(f"Database error: {err}")
        raise HTTPException(status_code=500, detail=f"Database error: {err}")
    except Exception as err:
        print(f"Unexpected error: {err}")
        raise HTTPException(status_code=500, detail=f"Unexpected error: {err}")

# New endpoint to save moveset data to database
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
            # Insert node
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
            # Get parent node ID
            cursor.execute("SELECT id FROM nodes WHERE name = %s", (parent_name,))
            parent_result = cursor.fetchone()
            if not parent_result:
                continue
                
            parent_id = parent_result[0]
            
            children = parent_data.get('children', {})
            if not children:
                continue
                
            # Handle different children formats
            if isinstance(children, list):
                for child_name in children:
                    # Get child node ID
                    cursor.execute("SELECT id FROM nodes WHERE name = %s", (child_name,))
                    child_result = cursor.fetchone()
                    if not child_result:
                        continue
                        
                    child_id = child_result[0]
                    
                    # Check if edge already exists
                    cursor.execute("SELECT id FROM edges WHERE source_node_id = %s AND target_node_id = %s", 
                                 (parent_id, child_id))
                    if not cursor.fetchone():
                        cursor.execute("""
                            INSERT INTO edges (source_node_id, target_node_id, edge_data)
                            VALUES (%s, %s, %s)
                        """, (parent_id, child_id, json.dumps({})))
            
            elif isinstance(children, dict):
                for child_name, child_meta in children.items():
                    # Get child node ID
                    cursor.execute("SELECT id FROM nodes WHERE name = %s", (child_name,))
                    child_result = cursor.fetchone()
                    if not child_result:
                        continue
                        
                    child_id = child_result[0]
                    
                    # Check if edge already exists
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
            "message": f"Successfully saved moveset data: {len(moveset_data)} nodes, {len(edges)} edges",
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

# Endpoint to initialize database from moveset.json
@app.post("/initialize")
async def initialize_database(background_tasks: BackgroundTasks):
    """Initialize database from moveset.json file"""
    try:
        # Load data from JSON file
        moveset_path = BASE_DIR / "moveset.json"
        with open(moveset_path, encoding='utf-8') as f:
            moveset_data = json.load(f)
        
        # Save to database using the existing save_moveset logic
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Disable foreign key checks
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
            
            # Insert parent relationships
            if 'parents' in node_data and node_data['parents']:
                cursor.execute("""
                    INSERT INTO properties (node_id, property_name, property_value)
                    VALUES (%s, %s, %s)
                """, (node_id, 'parents', json.dumps(node_data['parents'])))
            
            # Insert children relationships
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

# Simple health check endpoint
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

# Endpoint to get database statistics
@app.get("/stats")
def get_stats():
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        
        stats = {}
        
        # Count nodes
        cursor.execute("SELECT COUNT(*) as count FROM nodes")
        stats['nodes'] = cursor.fetchone()['count']
        
        # Count edges
        cursor.execute("SELECT COUNT(*) as count FROM edges")
        stats['edges'] = cursor.fetchone()['count']
        
        # Count properties
        cursor.execute("SELECT COUNT(*) as count FROM properties")
        stats['properties'] = cursor.fetchone()['count']
        
        # Count move areas
        cursor.execute("SELECT COUNT(*) as count FROM move_areas")
        stats['move_areas'] = cursor.fetchone()['count']
        
        cursor.close()
        
        return stats
        
    except mysql.connector.Error as err:
        print(f"Database error: {err}")
        raise HTTPException(status_code=500, detail=f"Database error: {err}")