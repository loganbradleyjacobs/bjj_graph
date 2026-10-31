-- MySQL Schema for BJJ Recursive Graph
-- Database: bjj

-- Create database if not exists
CREATE DATABASE IF NOT EXISTS bjj;
USE bjj;

-- Nodes table - stores basic move information
CREATE TABLE IF NOT EXISTS nodes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    area JSON,
    type ENUM('Takedown', 'Guard', 'Submission', 'Control') NOT NULL,
    image_path VARCHAR(500),
    video_path VARCHAR(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Properties table - stores dynamic properties for nodes
CREATE TABLE IF NOT EXISTS properties (
    id INT AUTO_INCREMENT PRIMARY KEY,
    node_id INT NOT NULL,
    property_name VARCHAR(255) NOT NULL,
    property_value JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE CASCADE,
    UNIQUE KEY unique_node_property (node_id, property_name)
);

-- Edges table - stores connections between nodes
CREATE TABLE IF NOT EXISTS edges (
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

-- Move areas junction table - many-to-many relationship between nodes and areas
CREATE TABLE IF NOT EXISTS move_areas (
    node_id INT NOT NULL,
    area VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (node_id, area),
    FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE CASCADE
);

-- Indexes for better query performance
CREATE INDEX idx_nodes_name ON nodes(name);
CREATE INDEX idx_properties_node_id ON properties(node_id);