#!/usr/bin/env python3
"""
Migration script to transfer data from moveset.json to MySQL database.

This script:
1. Reads data from moveset.json
2. Creates the database schema if it doesn't exist
3. Migrates all nodes, edges, and properties to the database

Usage: python migrate.py
"""

import json
import mysql.connector
from pathlib import Path
import sys

# Database configuration
DB_CONFIG = {
    "host": "localhost",
    "user": "root",
    "password": "",  # Update as needed
    "database": "bjj",
    "port": 3306,
    "charset": "utf8mb4"
}

def get_connection():
    """Get a database connection"""
    try:
        return mysql.connector.connect(**DB_CONFIG)
    except mysql.connector.Error as err:
        print(f"Error connecting to database: {err}")
        print("Make sure MySQL is running and the database 'bjj' exists")
        sys.exit(1)

def create_schema(conn):
    """Create the database schema"""
    cursor = conn.cursor()
    
    schema_sql = Path(__file__).parent / "schema.sql"
    with open(schema_sql, 'r') as f:
        sql_script = f.read()
    
    # Execute each statement in the schema
    statements = [stmt.strip() for stmt in sql_script.split(';') if stmt.strip()]
    
    for statement in statements:
        try:
            cursor.execute(statement)
        except mysql.connector.Error as err:
            print(f"Error creating table: {err}")
            # Some tables might already exist, which is fine
            pass
    
    conn.commit()
    cursor.close()
    print("Database schema created successfully")

def migrate_data(conn):
    """Migrate data from moveset.json to database"""
    cursor = conn.cursor()
    
    # Load data from JSON
    moveset_path = Path(__file__).parent / "moveset.json"
    with open(moveset_path, 'r', encoding='utf-8') as f:
        moveset = json.load(f)
    
    print(f"Loading data from moveset.json: {len(moveset)} nodes")
    
    # Disable foreign key checks for data import
    cursor.execute("SET FOREIGN_KEY_CHECKS = 0")
    
    # Clear existing data (if any)
    print("Clearing existing data...")
    cursor.execute("DELETE FROM edges")
    cursor.execute("DELETE FROM properties")
    cursor.execute("DELETE FROM move_areas")
    cursor.execute("DELETE FROM nodes")
    
    # Insert nodes and their properties
    print("Inserting nodes...")
    node_insert_count = 0
    property_insert_count = 0
    
    for node_name, node_data in moveset.items():
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
        node_insert_count += 1
        
        # Insert parent relationships
        if 'parents' in node_data and node_data['parents']:
            cursor.execute("""
                INSERT INTO properties (node_id, property_name, property_value)
                VALUES (%s, %s, %s)
            """, (node_id, 'parents', json.dumps(node_data['parents'])))
            property_insert_count += 1
        
        # Insert children relationships
        if 'children' in node_data and node_data['children']:
            cursor.execute("""
                INSERT INTO properties (node_id, property_name, property_value)
                VALUES (%s, %s, %s)
            """, (node_id, 'children', json.dumps(node_data['children'])))
            property_insert_count += 1
        
        # Insert areas
        if 'area' in node_data and node_data['area']:
            for area in node_data['area']:
                cursor.execute("""
                    INSERT INTO move_areas (node_id, area)
                    VALUES (%s, %s)
                """, (node_id, area))
    
    # Insert edges
    print("Inserting edges...")
    edge_insert_count = 0
    
    for parent_name, parent_data in moveset.items():
        # Get parent node ID
        cursor.execute("SELECT id FROM nodes WHERE name = %s", (parent_name,))
        parent_result = cursor.fetchone()
        if not parent_result:
            continue
            
        parent_id = parent_result[0]
        
        children = parent_data.get('children', {})
        if not children:
            continue
            
        # Handle different children formats (array or dict)
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
                    edge_insert_count += 1
        
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
                    edge_insert_count += 1
    
    # Re-enable foreign key checks
    cursor.execute("SET FOREIGN_KEY_CHECKS = 1")
    conn.commit()
    cursor.close()
    
    print("\nMigration completed successfully!")
    print(f"  Nodes inserted: {node_insert_count}")
    print(f"  Properties inserted: {property_insert_count}")
    print(f"  Edges inserted: {edge_insert_count}")

def main():
    print("BJJ Recursive Graph Database Migration")
    print("=" * 50)
    
    # Get connection and create schema
    conn = get_connection()
    create_schema(conn)
    
    # Migrate data
    migrate_data(conn)
    
    conn.close()
    
    print("\nTo start the application, run:")
    print("  uvicorn app:app --reload")
    print("\nAPI endpoints:")
    print("  GET / - Serve the web interface")
    print("  GET /moveset - Get moveset data from database")
    print("  POST /moveset - Save moveset data to database")
    print("  POST /initialize - Initialize database from moveset.json")
    print("  GET /health - Check database health")
    print("  GET /stats - Get database statistics")

if __name__ == "__main__":
    main()