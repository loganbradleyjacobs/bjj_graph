# BJJ Recursive Graph - Database Architecture Summary

## Overview
This document describes the new MySQL database architecture for the BJJ Recursive Graph application, replacing the original flat JSON storage with a normalized, scalable database solution.

## Original Architecture (JSON-based)

**Data Storage**: Single `moveset.json` file
**Schema**: Flat JSON structure
```json
{
  "Double Leg Takedown": {
    "parents": ["Standing"],
    "children": {
      "Top Half Guard": {},
      "Top Full Guard": {},
      "Top Side Control": {}
    },
    "area": ["Standing", "Clinch"],
    "type": "Takedown"
  }
}
```

**Limitations**:
- Data duplication
- No data integrity constraints
- Difficult to query complex relationships
- No backup/recovery capabilities
- Schema changes require application code changes

## New Architecture (MySQL Database)

**Data Storage**: MySQL database with normalized schema
**File**: `app.py` (FastAPI backend)

### Database Schema

#### 1. `nodes` Table
```sql
CREATE TABLE nodes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    area JSON,
    type ENUM('Takedown', 'Guard', 'Submission', 'Control') NOT NULL,
    image_path VARCHAR(500),
    video_path VARCHAR(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

**Purpose**: Stores basic node information
- `name`: Unique identifier for the move
- `type`: Move classification (Takedown, Guard, Submission, Control)
- `area`: JSON array of areas (Standing, Clinch, Ground)
- `image_path`, `video_path`: Media file references

#### 2. `properties` Table
```sql
CREATE TABLE properties (
    id INT AUTO_INCREMENT PRIMARY KEY,
    node_id INT NOT NULL,
    property_name VARCHAR(255) NOT NULL,
    property_value JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE CASCADE,
    UNIQUE KEY unique_node_property (node_id, property_name)
);
```

**Purpose**: Stores dynamic properties for nodes
- Normalizes parent/child relationships
- Allows easy addition of new property types
- Enforces data integrity with unique constraint

#### 3. `edges` Table
```sql
CREATE TABLE edges (
    id INT AUTO_INCREMENT PRIMARY KEY,
    source_node_id INT NOT NULL,
    target_node_id INT NOT NULL,
    edge_data JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (source_node_id) REFERENCES nodes(id) ON DELETE CASCADE,
    FOREIGN KEY (target_node_id) REFERENCES nodes(id) ON DELETE CASCADE,
    INDEX idx_source (source_node_id),
    INDEX idx_target (target_node_id),
    UNIQUE KEY unique_edge (source_node_id, target_node_id)
);
```

**Purpose**: Stores graph edges with metadata
- `source_node_id`, `target_node_id`: Foreign keys
- `edge_data`: JSON metadata (gifs, animations, etc.)
- Unique constraint prevents duplicate edges

#### 4. `move_areas` Table
```sql
CREATE TABLE move_areas (
    node_id INT NOT NULL,
    area VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (node_id, area),
    FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE CASCADE
);
```

**Purpose**: Junction table for many-to-many relationship
- Nodes can have multiple areas
- Areas can be associated with multiple nodes

## Data Flow

### Initialization

1. **User** requests `/moveset` endpoint
2. **FastAPI app** queries database:
   ```python
   SELECT n.id, n.name, n.area, n.type, n.image_path, n.video_path,
          p.property_name, p.property_value
   FROM nodes n
   LEFT JOIN properties p ON n.id = p.node_id
   ORDER BY n.name
   ```
3. **App** processes results into original JSON structure
4. **Web App** renders graph

### Data Modification

1. **User** submits new moveset data via `POST /moveset`
2. **App**:
   - Disables foreign key checks
   - Clears existing data
   - Inserts nodes into `nodes` table
   - Inserts properties into `properties` table
   - Inserts edges into `edges` table
   - Re-enables foreign key checks
   - Commits transaction

## Benefits of New Architecture

### 1. **Data Integrity**
- Foreign key constraints ensure referential integrity
- Unique constraints prevent duplicates
- JSON type supports flexible data structures

### 2. **Query Performance**
- Indexes on frequently queried columns
- JOIN operations for complex queries
- Better scalability for large datasets

### 3. **Flexibility**
- Easy to add new property types
- Dynamic schema changes possible
- Supports complex queries across relationships

### 4. **Backup & Recovery**
- Database dump/restore capabilities
- Point-in-time recovery
- Easier data migration

### 5. **Maintainability**
- Separation of data and application logic
- Clear data relationships
- Easier to understand and maintain

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Serve web interface |
| GET | `/moveset` | Get moveset data from database |
| POST | `/moveset` | Save moveset data to database |
| POST | `/initialize` | Initialize database from moveset.json |
| GET | `/health` | Check database health |
| GET | `/stats` | Get database statistics |

## Setup Process

### Option 1: Automated Setup (Recommended)

```bash
# Make setup script executable
chmod +x setup.sh

# Run setup (will prompt for database credentials)
bash setup.sh
```

### Option 2: Manual Setup

```bash
# 1. Create database
mysql -u root -p
CREATE DATABASE IF NOT EXISTS bjj;
USE bjj;

# 2. Create tables
mysql -u root -p bjj < schema.sql

# 3. Run migration
python3 migrate.py
```

### Option 3: Update Existing Database

```bash
# If database already exists but needs migration
python3 migrate.py
```

## Migration Process

The `migrate.py` script performs the following:

1. **Schema Creation**: Creates all tables if they don't exist
2. **Data Clearing**: Removes existing data to start fresh
3. **Node Import**: Reads `moveset.json` and inserts nodes
4. **Property Import**: Inserts parent/child relationships
5. **Area Import**: Inserts area associations
6. **Edge Import**: Creates graph edges with metadata

## File Structure

```
BJJ Recursive Graph/
├── app.py                    # FastAPI application with MySQL integration
├── schema.sql                # SQL schema definition
├── migrate.py                # Data migration script
├── setup.sh                  # Automated setup script
├── test_mysql.py             # Test script
├── README.md                 # Updated documentation
├── moveset.json              # Original data file
├── static/                   # Frontend files
├── .gitignore                # Git ignore file
└── requirements.txt          # Python dependencies (updated)
```

## Database Configuration

Database connection is configured in `app.py`:

```python
DB_CONFIG = {
    "host": "localhost",
    "user": "root",
    "password": "",  # Set your password
    "database": "bjj",
    "port": 3306,
    "charset": "utf8mb4"
}
```

Database credentials are stored in `db_config.env`:
```bash
MYSQL_HOST=localhost
MYSQL_USER=root
MYSQL_PASSWORD=your_password_here
MYSQL_DATABASE=bjj
MYSQL_PORT=3306
```

## Testing

The `test_mysql.py` script can be used to:
1. Test database connection
2. Verify schema creation
3. Run migration tests

```bash
python3 test_mysql.py
```

## Backward Compatibility

The new implementation maintains backward compatibility:
- Original `GET /moveset` endpoint still works
- Reads from database if available
- Falls back to JSON file if database unavailable
- All existing functionality preserved

## Future Enhancements

The new architecture enables future enhancements:

1. **Advanced Queries**:
   - Find moves by area or type
   - Calculate graph statistics
   - Find similar moves

2. **Dynamic Properties**:
   - Add distance, control rating, grip count
   - Support for video/gif metadata
   - Custom move attributes

3. **Data Analytics**:
   - Move popularity statistics
   - Path analysis
   - Performance metrics

## Performance Considerations

### Query Optimization

The schema includes indexes for frequently queried columns:
- `nodes.name` for lookups
- `properties.node_id` for property queries
- `edges.source_node_id`, `edges.target_node_id` for graph traversal

### Memory Usage

- JSON columns use minimal storage
- Database connection pooling for high concurrency
- Efficient JOIN operations

## Security Considerations

1. **Database Access**:
   - Use strong passwords
   - Limit database user privileges
   - Consider SSL encryption

2. **Input Validation**:
   - All data is validated by FastAPI
   - JSON schema validation
   - SQL injection prevention

3. **Error Handling**:
   - Generic error messages
   - No sensitive data exposure
   - Comprehensive logging

## Conclusion

The new MySQL database architecture provides a robust, scalable solution for storing and managing the BJJ move relationships. It offers significant advantages over the original JSON-based approach while maintaining full backward compatibility with existing functionality.