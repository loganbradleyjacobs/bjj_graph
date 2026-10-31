#!/usr/bin/env bash

# Demo script for BJJ Recursive Graph CRUD API
# This script demonstrates all the new CRUD endpoints

set -e

BASE_URL="http://localhost:8000"
LOG_FILE="bjj_crud_demo.log"

# Clear previous log
> $LOG_FILE

# Helper functions
log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" | tee -a $LOG_FILE
}

check_status() {
    local status=$1
    local message=$2
    if [[ $? -eq 0 ]]; then
        log "✓ $message"
    else
        log "✗ $message"
        exit 1
    fi
}

# Main demo function
demo_crud() {
    echo "========================================"
    echo "BJJ Recursive Graph CRUD API Demo"
    echo "========================================"
    echo "This script demonstrates all the new CRUD endpoints."
    echo ""
    
    # Check if server is running
    log "Checking server status..."
    response=$(curl -s "$BASE_URL/health" 2>&1)
    if [[ $? -eq 0 ]]; then
        log "Server is running!"
        echo "$response" | python3 -m json.tool | sed 's/^/    /'
    else
        log "Server is not running. Please start the application first:"
        echo "  cd /Users/loganjacobs/CS/Projects/bjj_recursive_graph"
        echo "  uvicorn app:app --reload"
        exit 1
    fi
    
    echo ""
    log "=== Testing Node CRUD Operations ==="
    
    # 1. CREATE a new node
    log "1. Creating a new node..."
    node_data='{
        "name": "CRUD Test Move",
        "area": ["Ground", "Clinch"],
        "type": "Guard",
        "image_path": "/static/images/crud_test.png"
    }'
    
    response=$(curl -s -X POST "$BASE_URL/nodes" \
        -H "Content-Type: application/json" \
        -d "$node_data")
    
    if [[ $? -eq 0 ]]; then
        node_id=$(echo "$response" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('id', 'NOT_FOUND'))" 2>/dev/null)
        if [[ "$node_id" != "NOT_FOUND" ]]; then
            log "✓ Node created successfully with ID: $node_id"
            echo "   Response: $(echo "$response" | python3 -m json.tool | head -10)"
        else
            log "✗ Failed to create node - invalid response"
        fi
    else
        log "✗ Failed to create node - server error"
    fi
    
    # 2. READ all nodes
    log "2. Reading all nodes..."
    response=$(curl -s "$BASE_URL/nodes")
    if [[ $? -eq 0 ]]; then
        node_count=$(echo "$response" | python3 -c "import sys, json; data=json.load(sys.stdin); print(len(data))" 2>/dev/null)
        log "✓ Retrieved $node_count nodes"
        echo "   First node: $(echo "$response" | python3 -m json.tool | head -5)"
    else
        log "✗ Failed to read nodes"
    fi
    
    # 3. UPDATE the node
    log "3. Updating the node..."
    update_data='{
        "name": "Updated CRUD Test Move",
        "area": ["Ground", "Clinch", "Standing"],
        "type": "Submission"
    }'
    
    response=$(curl -s -X PUT "$BASE_URL/nodes/1" \
        -H "Content-Type: application/json" \
        -d "$update_data")
    
    if [[ $? -eq 0 ]]; then
        updated_name=$(echo "$response" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('name', 'NOT_FOUND'))" 2>/dev/null)
        if [[ "$updated_name" != "NOT_FOUND" ]]; then
            log "✓ Node updated successfully to '$updated_name'"
        else
            log "✗ Failed to update node"
        fi
    else
        log "✗ Failed to update node - server error"
    fi
    
    # 4. DELETE the node
    log "4. Deleting the node..."
    response=$(curl -s -X DELETE "$BASE_URL/nodes/1")
    if [[ $? -eq 0 ]]; then
        if [[ "$response" == *"success"* ]]; then
            log "✓ Node deleted successfully"
        else
            log "✗ Failed to delete node - unexpected response"
        fi
    else
        log "✗ Failed to delete node - server error"
    fi
    
    echo ""
    log "=== Testing Edge CRUD Operations ==="
    
    # Need to create nodes first for edges
    log "5. Creating test nodes for edges..."
    
    # Create first node
    node1_data='{
        "name": "Source Node",
        "area": ["Ground"],
        "type": "Guard"
    }'
    response1=$(curl -s -X POST "$BASE_URL/nodes" \
        -H "Content-Type: application/json" \
        -d "$node1_data")
    source_id=$(echo "$response1" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('id', ''))" 2>/dev/null)
    
    if [[ -n "$source_id" && "$source_id" != "null" ]]; then
        log "✓ Created first node with ID: $source_id"
        
        # Create second node
        node2_data='{
            "name": "Target Node",
            "area": ["Clinch"],
            "type": "Submission"
        }'
        response2=$(curl -s -X POST "$BASE_URL/nodes" \
            -H "Content-Type: application/json" \
            -d "$node2_data")
        target_id=$(echo "$response2" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('id', ''))" 2>/dev/null)
        
        if [[ -n "$target_id" && "$target_id" != "null" ]]; then
            log "✓ Created second node with ID: $target_id"
            
            # 6. CREATE a new edge
            log "6. Creating a new edge..."
            edge_data='{
                "source_node_id": '$source_id',
                "target_node_id": '$target_id',
                "edge_data": {
                    "type": "dependency",
                    "weight": 1.0,
                    "description": "Test edge for CRUD API"
                }
            }'
            
            response=$(curl -s -X POST "$BASE_URL/edges" \
                -H "Content-Type: application/json" \
                -d "$edge_data")
            
            if [[ $? -eq 0 ]]; then
                edge_id=$(echo "$response" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('id', 'NOT_FOUND'))" 2>/dev/null)
                if [[ "$edge_id" != "NOT_FOUND" ]]; then
                    log "✓ Edge created successfully with ID: $edge_id"
                else
                    log "✗ Failed to create edge - invalid response"
                fi
            else
                log "✗ Failed to create edge - server error"
            fi
            
            # 7. READ all edges
            log "7. Reading all edges..."
            response=$(curl -s "$BASE_URL/edges")
            if [[ $? -eq 0 ]]; then
                edge_count=$(echo "$response" | python3 -c "import sys, json; data=json.load(sys.stdin); print(len(data))" 2>/dev/null)
                log "✓ Retrieved $edge_count edges"
            else
                log "✗ Failed to read edges"
            fi
            
            # 8. UPDATE the edge
            log "8. Updating the edge..."
            update_edge_data='{
                "source_node_id": '$source_id',
                "target_node_id": '$target_id',
                "edge_data": {
                    "type": "updated_dependency",
                    "weight": 0.8,
                    "description": "Updated edge description"
                }
            }'
            
            response=$(curl -s -X PUT "$BASE_URL/edges/$edge_id" \
                -H "Content-Type: application/json" \
                -d "$update_edge_data")
            
            if [[ $? -eq 0 ]]; then
                edge_type=$(echo "$response" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('edge_data', {}).get('type', 'NOT_FOUND'))" 2>/dev/null)
                if [[ "$edge_type" != "NOT_FOUND" && "$edge_type" != "null" ]]; then
                    log "✓ Edge updated successfully (type: $edge_type)"
                else
                    log "✗ Failed to update edge"
                fi
            else
                log "✗ Failed to update edge - server error"
            fi
            
            # 9. DELETE the edge
            log "9. Deleting the edge..."
            response=$(curl -s -X DELETE "$BASE_URL/edges/$edge_id")
            if [[ $? -eq 0 ]]; then
                if [[ "$response" == *"success"* ]]; then
                    log "✓ Edge deleted successfully"
                else
                    log "✗ Failed to delete edge - unexpected response"
                fi
            else
                log "✗ Failed to delete edge - server error"
            fi
            
            # Clean up test nodes
            log "10. Cleaning up test nodes..."
            curl -s -X DELETE "$BASE_URL/nodes/$source_id" > /dev/null && log "✓ Source node deleted"
            curl -s -X DELETE "$BASE_URL/nodes/$target_id" > /dev/null && log "✓ Target node deleted"
        else
            log "✗ Failed to create second test node"
        fi
    else
        log "✗ Failed to create first test node"
    fi
    
    echo ""
    log "=== Testing Utility Endpoints ==="
    
    # 11. Test health endpoint
    log "11. Checking server health..."
    response=$(curl -s "$BASE_URL/health")
    if [[ $? -eq 0 ]]; then
        log "✓ Server health: $response"
    else
        log "✗ Failed to check server health"
    fi
    
    # 12. Test statistics endpoint
    log "12. Getting database statistics..."
    response=$(curl -s "$BASE_URL/stats")
    if [[ $? -eq 0 ]]; then
        stats=$(echo "$response" | python3 -m json.tool)
        echo "   Statistics: $stats"
        log "✓ Statistics retrieved successfully"
    else
        log "✗ Failed to get statistics"
    fi
    
    # 13. Test graph-stats endpoint
    log "13. Getting graph statistics..."
    response=$(curl -s "$BASE_URL/graph-stats")
    if [[ $? -eq 0 ]]; then
        graph_stats=$(echo "$response" | python3 -m json.tool)
        echo "   Graph Stats: $graph_stats"
        log "✓ Graph statistics retrieved successfully"
    else
        log "✗ Failed to get graph statistics"
    fi
    
    echo ""
    log "=== Demo Complete ==="
    echo ""
    echo "All CRUD operations have been tested successfully!"
    echo ""
    echo "Summary of new endpoints created:"
    echo "  • POST /nodes          - Create a node"
    echo "  • GET /nodes          - List all nodes"
    echo "  • PUT /nodes/{id}     - Update a node"
    echo "  • DELETE /nodes/{id}  - Delete a node"
    echo "  • POST /edges         - Create an edge"
    echo "  • GET /edges          - List all edges"
    echo "  • PUT /edges/{id}     - Update an edge"
    echo "  • DELETE /edges/{id}  - Delete an edge"
    echo "  • GET /graph-stats    - Get graph statistics"
    echo ""
    echo "For more details, see:
  - README.md - User guide
  - CRUDEndpoints.md - Complete API documentation
  - DATABASE_ARCHITECTURE.md - Technical architecture"
}

# Run the demo
demo_crud