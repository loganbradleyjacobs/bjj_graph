#!/usr/bin/env python3
"""
Test script for the BJJ Recursive Graph application with MySQL database.

This script tests:
1. Database connection
2. Schema creation
3. Data migration
4. API endpoints

Usage: python3 test_mysql.py
"""

import sys
import json
import mysql.connector
from pathlib import Path

def test_mysql_connection():
    """Test MySQL database connection"""
    print("Testing MySQL connection...")
    
    try:
        conn = mysql.connector.connect(
            host="localhost",
            user="root",
            password="",
            database="bjj",
            port=3306,
            charset="utf8mb4"
        )
        print("✓ MySQL connection successful")
        return conn
    except mysql.connector.Error as err:
        print(f"✗ MySQL connection failed: {err}")
        print("  Make sure MySQL is running and the database 'bjj' exists")
        return None

def create_test_schema(conn):
    """Create test tables"""
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
            video_path VARCHAR(500)
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS properties (
            id INT AUTO_INCREMENT PRIMARY KEY,
            node_id INT NOT NULL,
            property_name VARCHAR(255) NOT NULL,
            property_value JSON,
            FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE CASCADE
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS edges (
            id INT AUTO_INCREMENT PRIMARY KEY,
            source_node_id INT NOT NULL,
            target_node_id INT NOT NULL,
            edge_data JSON,
            FOREIGN KEY (source_node_id) REFERENCES nodes(id) ON DELETE CASCADE,
            FOREIGN KEY (target_node_id) REFERENCES nodes(id) ON DELETE CASCADE
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

def test_migration_script():
    """Test the migration script"""
    print("\nTesting migration script...")
    
    try:
        import subprocess
        result = subprocess.run(
            [sys.executable, "migrate.py"],
            capture_output=True,
            text=True,
            cwd=Path(__file__).parent
        )
        
        if result.returncode == 0:
            print("✓ Migration script executed successfully")
            print(result.stdout)
        else:
            print("✗ Migration script failed")
            print("Error output:", result.stderr)
            return False
            
    except Exception as e:
        print(f"✗ Error running migration script: {e}")
        return False
    
    return True

def main():
    print("BJJ Recursive Graph MySQL Test")
    print("=" * 50)
    
    # Test MySQL connection
    conn = test_mysql_connection()
    if not conn:
        print("\nSkipping database tests (connection failed)")
        print("Run setup.sh first to initialize the database")
        return
    
    try:
        # Create test schema
        create_test_schema(conn)
        
        # Test migration
        if not test_migration_script():
            print("\nMigration test failed")
            return
        
        print("\n" + "=" * 50)
        print("All tests completed successfully!")
        print("\nNext steps:")
        print("1. Start the application:")
        print("   cd bjj_recursive_graph")
        print("   pip install -r requirements.txt")
        print("   uvicorn app:app --reload")
        print("\n2. Test the API endpoints:")
        print("   curl http://localhost:8000/health")
        print("   curl http://localhost:8000/stats")
        print("   curl http://localhost:8000/moveset")
        
    finally:
        conn.close()

if __name__ == "__main__":
    main()