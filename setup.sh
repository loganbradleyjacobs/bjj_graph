#!/bin/bash

# BJJ Database Setup Script
# This script will:
# 1. Create the MySQL database and tables
# 2. Run the migration to populate data from moveset.json

PROJECT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
DB_CONFIG_FILE="$PROJECT_DIR/db_config.env"

# Check if db_config.env exists, create if not
if [ ! -f "$DB_CONFIG_FILE" ]; then
    echo "Database configuration not found. Creating $DB_CONFIG_FILE..."
    echo "# MySQL Database Configuration
# Update these values as needed
MYSQL_HOST=localhost
MYSQL_USER=root
MYSQL_PASSWORD=  # Set your password here
MYSQL_DATABASE=bjj
MYSQL_PORT=3306" > "$DB_CONFIG_FILE"
    echo "Please edit $DB_CONFIG_FILE to configure your MySQL connection"
    echo "Then run this script again"
    exit 1
fi

# Load database configuration
source "$DB_CONFIG_FILE"

# Check if mysql is available
if ! command -v mysql &> /dev/null; then
    echo "Error: MySQL client not found. Please install MySQL client."
    exit 1
fi

# Check if Python is available
if ! command -v python3 &> /dev/null; then
    echo "Error: Python3 not found. Please install Python3."
    exit 1
fi

# Create database
echo "Creating database '$MYSQL_DATABASE'...
"mysql -h"$MYSQL_HOST" -u"$MYSQL_USER" -p$MYSQL_PASSWORD" 2>/dev/null << EOF
CREATE DATABASE IF NOT EXISTS $MYSQL_DATABASE;
USE $MYSQL_DATABASE;
EOF

# Check if creation was successful
if [ $? -ne 0 ]; then
    echo "Error: Failed to create database. Please check your MySQL configuration."
    echo "Make sure MySQL server is running and the user has sufficient privileges."
    exit 1
fi

# Create tables using the schema.sql file
if [ -f "$PROJECT_DIR/schema.sql" ]; then
    echo "Creating database tables from schema.sql..."
    mysql -h "$MYSQL_HOST" -u "$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE" < "$PROJECT_DIR/schema.sql"
    if [ $? -ne 0 ]; then
        echo "Error: Failed to create tables from schema.sql"
        exit 1
    fi
else
    echo "Error: schema.sql not found in project directory"
    exit 1
fi

# Run the migration script
if [ -f "$PROJECT_DIR/migrate.py" ]; then
    echo "Running data migration..."
    python3 "$PROJECT_DIR/migrate.py"
    if [ $? -ne 0 ]; then
        echo "Error: Migration failed"
        exit 1
    fi
else
    echo "Error: migrate.py not found in project directory"
    exit 1
fi

# Check if database setup was successful
if [ -f "$PROJECT_DIR/app.py" ]; then
    echo "\nSetting up the application..."
    python3 -c "
import mysql.connector
from pathlib import Path

try:
    conn = mysql.connector.connect(
        host='$MYSQL_HOST',
        user='$MYSQL_USER',
        password='$MYSQL_PASSWORD',
        database='$MYSQL_DATABASE',
        port=$MYSQL_PORT,
        charset='utf8mb4'
    )
    
    cursor = conn.cursor()
    
    # Test query
    cursor.execute('SELECT COUNT(*) FROM nodes')
    count = cursor.fetchone()[0]
    
    if count > 0:
        print(f'Successfully connected to database with {count} nodes')
        cursor.close()
        conn.close()
    else:
        print('Error: Database appears to be empty')
        exit(1)
        
except Exception as e:
    print(f'Error: {e}')
    exit(1)
" 2>&1
fi

echo "\n"Database setup completed successfully!"
echo "\nYou can now start the application with:"
echo "  cd $PROJECT_DIR"
echo "  pip install -r requirements.txt"
echo "  python3 migrate.py  # (if you want to run migration again)"
echo "  uvicorn app:app --reload"
echo "\nAPI endpoints available:"
echo "  GET http://localhost:8000/ - Web interface"
echo "  GET http://localhost:8000/moveset - Get moveset data from database"
echo "  POST http://localhost:8000/moveset - Save moveset data to database"
echo "  POST http://localhost:8000/initialize - Initialize database from moveset.json"
echo "  GET http://localhost:8000/health - Database health check"
echo "  GET http://localhost:8000/stats - Database statistics"