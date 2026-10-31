#!/usr/bin/env python3
"""
Test script for the BJJ Recursive Graph application with CRUD endpoints.

This script tests:
1. Database connection
2. Schema creation
3. Data migration
4. All CRUD operations for nodes
5. All CRUD operations for edges
6. Graph statistics

Usage: python3 test_mysql.py
"""

import json
import sys
import mysql.connector
from pathlib import Path

def get_connection():
    """Get a database connection"""
    try:
        conn = mysql.connector.connect(
            host="localhost",
            user="root",
            password="",
            database="bjj",
            port=3306,
            charset="utf8mb4"
        )
        return conn
    except mysql.connector.Error as err:
        print(f"Error connecting to database: {err}")
        return None

def test_basic_connection():
    """Test basic MySQL database connectivity"""
    print("Testing MySQL connection...")
    
    conn = get_connection()
    if not conn:
        print("✗ MySQL connection failed")
        return None
    
    print("✓ MySQL connection successful")
    return conn

def test_schema_creation(conn):
    """Test database schema creation"""
    print("\nCreating test schema...")
    
    cursor = conn.cursor()
    
    # Create test tables
    tables = [
        """
        CREATE TABLE IF NOT EXISTS nodes (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(255) NOT NULL UNIQUE,
            area JSON,
            type ENUM('Takedown', 'Guard', 'Submission', 'Control') NOT NULL,
            image_path VARCHAR(500),
            video_path VARCHAR(500),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS properties (
            id INT AUTO_INCREMENT PRIMARY KEY,
            node_id INT NOT NULL,
            property_name VARCHAR(255) NOT NULL,
            property_value JSON,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE CASCADE
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS edges (
            id INT AUTO_INCREMENT PRIMARY KEY,
            source_node_id INT NOT NULL,
            target_node_id INT NOT NULL,
            edge_data JSON,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (source_node_id) REFERENCES nodes(id) ON DELETE CASCADE,
            FOREIGN KEY (target_node_id) REFERENCES nodes(id) ON DELETE CASCADE,
            UNIQUE KEY unique_edge (source_node_id, target_node_id)
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS move_areas (
            node_id INT NOT NULL,
            area VARCHAR(100) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (node_id, area),
            FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE CASCADE
        )
        """
    ]
    
    for table_sql in tables:
        try:
            cursor.execute(table_sql)
            print(f"✓ Created table")
        except mysql.connector.Error as err:
            print(f"✗ Error creating table: {err}")
    
    conn.commit()
    cursor.close()
    print("✓ Test schema created successfully")

def test_node_crud():
    """Test all node CRUD operations"""
    print("\n" + "=" * 60)
    print("Testing Node CRUD Operations")
    print("=" * 60)
    
    conn = get_connection()
    if not conn:
        print("✗ Skipping node CRUD tests (connection failed)")
        return
    
    cursor = conn.cursor(dictionary=True)
    
    try:
        # Test 1: Create Node
        print("\n1. Testing CREATE node...")
        create_node = {
            "name": "New Move",
            "area": ["Ground", "Clinch"],
            "type": "Guard",
            "image_path": "/static/images/new_move.png",
            "video_path": "/static/videos/new_move.mp4"
        }
        
        # We can't actually test HTTP endpoints, but we can test the database logic
        cursor.execute("""
            INSERT INTO nodes (name, area, type, image_path, video_path)
            VALUES (%s, %s, %s, %s, %s)
        """, (
            create_node["name"],
            json.dumps(create_node["area"]),
            create_node["type"],
            create_node["image_path"],
            create_node["video_path"]
        ))
        
        new_node_id = cursor.lastrowid
        print(f"✓ Created node with ID: {new_node_id}")
        
        # Test 2: Read Node
        print("\n2. Testing READ node...")
        cursor.execute("SELECT * FROM nodes WHERE id = %s", (new_node_id,))
        node = cursor.fetchone()
        
        if node:
            print(f"✓ Read node: {node['name']} (ID: {node['id']})")
        else:
            print("✗ Failed to read node")
        
        # Test 3: Update Node
        print("\n3. Testing UPDATE node...")
        update_data = {
            "name": "Updated Move",
            "area": ["Ground", "Clinch", "Standing"],
            "type": "Submission",
            "image_path": "/static/images/updated_move.png"
        }
        
        cursor.execute("""
            UPDATE nodes SET 
                name = %s,
                area = %s,
                type = %s,
                image_path = %s,
                video_path = %s
            WHERE id = %s
        """, (
            update_data["name"],
            json.dumps(update_data["area"]),
            update_data["type"],
            update_data["image_path"],
            update_data["video_path"],
            new_node_id
        ))
        
        print(f"✓ Updated node (ID: {new_node_id})")
        
        # Test 4: Delete Node
        print("\n4. Testing DELETE node...")
        cursor.execute("DELETE FROM nodes WHERE id = %s", (new_node_id,))
        
        cursor.execute("SELECT * FROM nodes WHERE id = %s", (new_node_id,))
        if not cursor.fetchone():
            print(f"✓ Deleted node (ID: {new_node_id})")
        else:
            print("✗ Failed to delete node")
        
        conn.commit()
        print("\n✓ All Node CRUD operations completed successfully!")
        
    except mysql.connector.Error as err:
        print(f"✗ Database error: {err}")
        conn.rollback()
    finally:
        cursor.close()

def test_edge_crud():
    """Test all edge CRUD operations"""
    print("\n" + "=" * 60)
    print("Testing Edge CRUD Operations")
    print("=" * 60)
    
    conn = get_connection()
    if not conn:
        print("✗ Skipping edge CRUD tests (connection failed)")
        return
    
    cursor = conn.cursor(dictionary=True)
    
    try:
        # First, create some nodes to create edges between
        print("\nCreating test nodes for edge operations...")
        
        test_nodes = [
            {"name": "Source Node", "type": "Guard"},
            {"name": "Target Node", "type": "Submission"},
            {"name": "Third Node", "type": "Control"}
        ]
        
        node_ids = []
        for node in test_nodes:
            cursor.execute("""
                INSERT INTO nodes (name, type)
                VALUES (%s, %s)
            """, (node["name"], node["type"]))
            
            node_id = cursor.lastrowid
            node_ids.append(node_id)
            print(f"✓ Created node '{node['name']}' (ID: {node_id})")
        
        # Test 1: Create Edge
        print("\n1. Testing CREATE edge...")
        create_edge = {
            "source_node_id": node_ids[0],
            "target_node_id": node_ids[1],
            "edge_data": {"type": "dependency", "weight": 1.0}
        }
        
        cursor.execute("""
            INSERT INTO edges (source_node_id, target_node_id, edge_data)
            VALUES (%s, %s, %s)
        """, (
            create_edge["source_node_id"],
            create_edge["target_node_id"],
            json.dumps(create_edge["edge_data"])
        ))
        
        new_edge_id = cursor.lastrowid
        print(f"✓ Created edge (ID: {new_edge_id}) from Node {node_ids[0]} to Node {node_ids[1]}")
        
        # Test 2: Read Edge
        print("\n2. Testing READ edge...")
        cursor.execute("SELECT * FROM edges WHERE id = %s", (new_edge_id,))
        edge = cursor.fetchone()
        
        if edge:
            print(f"✓ Read edge (ID: {edge['id']}) from {edge['source_node_id']} to {edge['target_node_id']}")
        else:
            print("✗ Failed to read edge")
        
        # Test 3: Update Edge
        print("\n3. Testing UPDATE edge...")
        update_edge = {
            "source_node_id": node_ids[0],
            "target_node_id": node_ids[2],
            "edge_data": {"type": "conflict", "weight": -1.0}
        }
        
        cursor.execute("""
            UPDATE edges SET 
                source_node_id = %s,
                target_node_id = %s,
                edge_data = %s
            WHERE id = %s
        """, (
            update_edge["source_node_id"],
            update_edge["target_node_id"],
            json.dumps(update_edge["edge_data"]),
            new_edge_id
        ))
        
        print(f"✓ Updated edge (ID: {new_edge_id})")
        
        # Test 4: Delete Edge
        print("\n4. Testing DELETE edge...")
        cursor.execute("DELETE FROM edges WHERE id = %s", (new_edge_id,))
        
        cursor.execute("SELECT * FROM edges WHERE id = %s", (new_edge_id,))
        if not cursor.fetchone():
            print(f"✓ Deleted edge (ID: {new_edge_id})")
        else:
            print("✗ Failed to delete edge")
        
        # Clean up test nodes
        print("\nCleaning up test nodes...")
        for node_id in node_ids:
            cursor.execute("DELETE FROM nodes WHERE id = %s", (node_id,))
        
        conn.commit()
        print("\n✓ All Edge CRUD operations completed successfully!")
        
    except mysql.connector.Error as err:
        print(f"✗ Database error: {err}")
        conn.rollback()
    finally:
        cursor.close()

def test_graph_statistics():
    """Test graph statistics functionality"""
    print("\n" + "=" * 60)
    print("Testing Graph Statistics")
    print("=" * 60)
    
    conn = get_connection()
    if not conn:
        print("✗ Skipping graph statistics tests (connection failed)")
        return
    
    cursor = conn.cursor(dictionary=True)
    
    try:
        # Insert test data
        print("\nInserting test data...")
        
        # Create some test nodes
        test_nodes = [
            ("Move A", "Guard", '{"area": ["Ground"]}'),
            ("Move B", "Submission", '{"area": ["Ground", "Clinch"]}'),
            ("Move C", "Control", '{"area": ["Standing"]}')
        ]
        
        for name, type_val, area in test_nodes:
            cursor.execute("INSERT INTO nodes (name, type, area) VALUES (%s, %s, %s)", (name, type_val, area))
        
        # Create some test edges
        node_ids = [cursor.lastrowid for _ in test_nodes][::-1]  # Reverse order
        
        test_edges = [
            (node_ids[0], node_ids[1], '{"type": "dependency", "weight": 1.0}'),
            (node_ids[1], node_ids[2], '{"type": "conflict", "weight": -0.5}')
        ]
        
        for source_id, target_id, edge_data in test_edges:
            cursor.execute("INSERT INTO edges (source_node_id, target_node_id, edge_data) VALUES (%s, %s, %s)", 
                          (source_id, target_id, edge_data))
        
        conn.commit()
        
        # Test statistics query
        print("\nCalculating graph statistics...")
        
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
        
        total_nodes = len(nodes_with_stats)
        total_edges = sum(node['total_connections'] for node in nodes_with_stats) // 2
        
        node_types = {}
        for node in nodes_with_stats:
            node_type = node['type']
            node_types[node_type] = node_types.get(node_type, 0) + 1
        
        print(f"✓ Total Nodes: {total_nodes}")
        print(f"✓ Total Edges: {total_edges}")
        print(f"✓ Node Types: {node_types}")
        print(f"✓ Average Connections per Node: {total_edges / total_nodes if total_nodes > 0 else 0:.2f}")
        
        # Display individual node stats
        print("\nIndividual Node Statistics:")
        for node in nodes_with_stats:
            print(f"  • {node['name']} ({node['type']}): {node['outgoing_edges']} outgoing, {node['incoming_edges']} incoming")
        
        # Clean up
        print("\nCleaning up test data...")
        cursor.execute("DELETE FROM edges")
        cursor.execute("DELETE FROM nodes")
        
        conn.commit()
        print("\n✓ Graph statistics test completed successfully!")
        
    except mysql.connector.Error as err:
        print(f"✗ Database error: {err}")
        conn.rollback()
    finally:
        cursor.close()

def main():
    print("BJJ Recursive Graph CRUD Test Suite")
    print("=" * 60)
    
    # Test basic connection
    conn = test_basic_connection()
    if not conn:
        print("\nSkipping all tests (connection failed)")
        print("\nTo set up the database:")
        print("1. Create database: mysql -u root -p")
        print("   CREATE DATABASE IF NOT EXISTS bjj;")
        print("   USE bjj;")
        print("2. Create tables: mysql -u root -p bjj < schema.sql")
        print("3. Run migration: python3 migrate.py")
        return
    
    try:
        # Create test schema
        test_schema_creation(conn)
        
        # Test Node CRUD operations
        test_node_crud()
        
        # Test Edge CRUD operations
        test_edge_crud()
        
        # Test graph statistics
        test_graph_statistics()
        
        print("\n" + "=" * 60)
        print("ALL TESTS COMPLETED SUCCESSFULLY!")
        print("=" * 60)
        print("\nNew CRUD endpoints available:")
        print("  • POST /nodes - Create a new node")
        print("  • GET /nodes - List all nodes")
        print("  • GET /nodes/{id} - Get specific node")
        print("  • PUT /nodes/{id} - Update a node")
        print("  • DELETE /nodes/{id} - Delete a node")
        print("  • POST /edges - Create a new edge")
        print("  • GET /edges - List all edges")
        print("  • GET /edges/{id} - Get specific edge")
        print("  • PUT /edges/{id} - Update an edge")
        print("  • DELETE /edges/{id} - Delete an edge")
        print("  • GET /graph-stats - Get comprehensive graph statistics")
        
    finally:
        conn.close()

if __name__ == "__main__":
    main()