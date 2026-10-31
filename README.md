This README has been updated with information about the new MySQL database integration.

# BJJ Recursive Graph

A simple graph-based visualization web app. It loads a moveset JSON, and renders the nodes and edges with Cytoscape. The backend is FastAPI.

## Architecture

This application now supports two data storage modes:

1. **JSON File Mode (default)**: Reads/writes data from `moveset.json` file
2. **MySQL Database Mode**: Reads/writes data from a MySQL database with normalized schema

## MySQL Database Integration

The application now includes a complete MySQL database integration for storing the BJJ moveset data in a normalized schema.

### Database Schema

The database is organized into four tables:

1. **nodes**: Stores basic node information (name, type, area, etc.)
2. **properties**: Stores dynamic properties like parents and children (normalized)
3. **edges**: Stores connections between nodes
4. **move_areas**: Junction table for the many-to-many relationship between nodes and areas

### Setup Instructions

1. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

2. **Configure MySQL database**:
   ```bash
   # Create the database and tables
   bash setup.sh
   
   # This will prompt you to create a db_config.env file with your MySQL credentials
   ```

3. **Alternatively, you can manually**:
   ```bash
   # Create the database
   mysql -u root -p
   CREATE DATABASE IF NOT EXISTS bjj;
   USE bjj;
   
   # Create tables from schema.sql
   mysql -u root -p bjj < schema.sql
   
   # Run the migration to import data from moveset.json
   python3 migrate.py
   ```

### Running the Application

```bash
cd bjj_recursive_graph
pip install -r requirements.txt
uvicorn app:app --reload
```

### API Endpoints

The application now provides additional endpoints for database operations:

- **GET /moveset** - Get moveset data from database (same as before)
- **POST /moveset** - Save moveset data to database (NEW)
- **POST /initialize** - Initialize database from moveset.json (NEW)
- **GET /health** - Check database health (NEW)
- **GET /stats** - Get database statistics (NEW)

### Database Operations

#### Initialize Database from JSON

To initialize the database with the current moveset.json data:

```bash
curl -X POST http://localhost:8000/initialize
```

#### Save Custom Data to Database

You can save custom moveset data to the database:

```bash
curl -X POST http://localhost:8000/moveset \
  -H "Content-Type: application/json" \
  -d '{
    "Move Name": {
      "parents": ["Parent1", "Parent2"],
      "children": {"Child1": {}, "Child2": {}},
      "area": ["Area1", "Area2"],
      "type": "Takedown"
    }
  }'
```

#### Database Health Check

Check if the database is properly connected:

```bash
curl http://localhost:8000/health
```

#### Database Statistics

Get information about the database contents:

```bash
curl http://localhost:8000/stats
```

### Data Migration

The `migrate.py` script handles the migration of data from `moveset.json` to the MySQL database:

```bash
python3 migrate.py
```

This script will:
1. Create the database schema (if not exists)
2. Clear existing data
3. Import all nodes, properties, and edges from the JSON file

### Schema

The new normalized schema supports:

1. **nodes table**:
   - id (primary key)
   - name (unique)
   - type (Takedown, Guard, Submission, Control)
   - area (JSON array)
   - image_path, video_path

2. **properties table**:
   - id (primary key)
   - node_id (foreign key to nodes)
   - property_name (parents, children, etc.)
   - property_value (JSON data)

3. **edges table**:
   - id (primary key)
   - source_node_id, target_node_id (foreign keys)
   - edge_data (JSON metadata for edges)

4. **move_areas table**:
   - node_id, area (composite primary key)
   - Junction table for many-to-many relationship

### Benefits

- **Normalized data**: Eliminates data redundancy
- **Scalability**: Can handle larger datasets efficiently
- **Flexibility**: Easy to add new properties without schema changes
- **Consistency**: Enforced relationships and constraints
- **Backup**: Database backup is easier than JSON file

### Notes

- The application maintains backward compatibility - it will use the database if available, otherwise fall back to the JSON file
- Database connection is configured via the `DB_CONFIG` dictionary in app.py
- The setup script will guide you through the initial database setup