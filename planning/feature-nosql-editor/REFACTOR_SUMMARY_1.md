# BJJ Recursive Graph Refactoring Summary

This document summarizes all changes made to implement the refactoring from the old schema to the new schema where positions become nodes and moves become edges.

## Changes Made

### 1. Created Migration Script (`migrate_moveset.py`)
- **Purpose**: Converts the old `moveset.json` (node-based with parents/children) to the new schema (positions as nodes, moves as edges)
- **Input**: Old `moveset.json` with 147 positions/nodes
- **Output**: New `moveset.json` with 35 positions and 52 moves
- **Classification**: Automatically classifies old keys into MOVE_KEYS (actual moves) vs positions
- **Renames**: Handles "Half Guard" → "Top Half Guard" rename
- **Warnings**: Identifies dangling references and creates stub positions for undefined references

### 2. Updated Data Schema (`moveset.json`)
- **Before**: All entities (positions, submissions, takedowns, etc.) were nodes linked bidirectionally via parents/children
- **After**: 
  - `positions` object: 35 positions (e.g., "Top Full Guard", "Mount", "Standing") with metadata (area, type, image, video)
  - `moves` array: 52 moves (named and unnamed transitions) with from/to arrays
  - Each move expands from × to into pairwise edges
  - Moves are undirected in the graph (no arrowheads)
  - No parents/children duplication

### 3. Updated Node JSON Generator (`node_json_gen.py`)
- **Before**: Generated node objects with parents/children arrays
- **After**: Generates move objects with from/to arrays
- **Changes**:
  - New prompt asks for "Move name (blank for unnamed transition)"
  - Prompts for "Move type (Takedown/Sweep/Pass/Submission/Transition)"
  - Prompts for "From positions" and "To positions" (arrays)
  - Preserves area information
  - Copies JSON to clipboard for easy pasting

### 4. Updated JavaScript Application (`static/app.js`)

#### 4.1 Configuration (`CONFIG`)
- Added new node colors:
  - "Neutral": "#9b59b6"
  - "Transition": "#888"
  - "Unknown": "#ff5555"

#### 4.2 Graph Data Processor (`GraphDataProcessor`)
- Completely rewritten to handle new schema
- Processes `positions` as nodes with metadata
- Processes `moves` as edges, expanding from × to arrays
- Includes deduplication to prevent duplicate edges
- Adds stub position handling

#### 4.3 Graph Style Manager (`GraphStyleManager`)
- Added style for hiding edge labels: `edge.hide-edge-label`
- Added style for stub positions with dashed red borders
- Updated `_getEdgeStyles()`: 
  - No arrowheads (target-arrow-shape: "none", source-arrow-shape: "none")
  - Bezier curves
  - Edge labels support
- Updated `_calculateNodeWidth()`: Uses Cytoscape's degree() instead of counting parents/children

#### 4.4 Graph Tooltip Manager (`GraphTooltipManager`)
- Completely rewritten
- Shows detailed tooltips for both nodes and edges
- Node tooltips show connected moves and their destinations
- Edge tooltips show move name, type, and source/target positions

#### 4.5 Show Labels Checkbox
- Extended to also hide/show edge labels
- Added CSS class `hide-edge-label` for edges

### 5. Fixed HTML Structure (`static/index.html`)
- Fixed malformed `<head>` tag (changed from `<>` to `<head>`)
- Removed stray `<link>` tag after stylesheet
- Preserved all functionality and styling

## Migration Warnings and Resolution

The migration produced 29 warnings that indicate modeling gaps in the old data:

### Move-to-Move References (Dropped)
- Moves like "Rear Naked Choke" and "Clock Choke" referenced each other
- These references are dropped, creating self-loops (e.g., Back Control → Back Control)
- **Resolution**: Add proper positions like "Rear Naked Choke Control" with submission to "Tapped" terminal

### Undefined References (Created Stubs)
- Positions like "Stack Guard", "Straightjacket", "Back Taken", etc. were referenced but never defined
- **Resolution**: These become stub positions with `_stub: true` and type "Unknown"
- **Action**: Define these positions properly in the UI

### Empty From Array (Move with No Source)
- "Chair Sit Ezekiel" had no parents defined
- **Resolution**: Move has empty `from` array, produces no edge
- **Action**: Define a proper starting position for this move

## Schema Validation

The new schema validates correctly:
- ✅ Has `positions` and `moves` keys
- ✅ Positions have required `type` field
- ✅ Moves have required `type`, `from`, and `to` fields
- ✅ Named moves have `name` field
- ✅ Unnamed moves are type "Transition"
- ✅ Stub positions marked with `_stub: true` and type "Unknown"

## Files Modified

1. **`migrate_moveset.py`** - Created (temporary, then removed)
2. **`moveset.json`** - Updated with new schema
3. **`node_json_gen.py`** - Updated to generate move objects
4. **`static/app.js`** - Complete rewrite with new functionality
5. **`static/index.html`** - Fixed HTML structure

## Files Deleted

- `node_json_gen.py` (original version)
- `__pycache__/` - Cleaned up

## Key Design Decisions

1. **Positions as Nodes**: Only martial arts positions (guard, control, etc.) are nodes
2. **Moves as Edges**: Both named moves (takedowns, submissions) and unnamed transitions are edges
3. **Undirected Edges**: No arrowheads to match "bidirectional" requirement
4. **Parallel Edges**: Multiple moves between same pair allowed (deduplicated by move name)
5. **Stub Positions**: Helps identify missing position definitions
6. **Self-loops**: Allow for moves that don't change position (e.g., submission holds)

## Next Steps

1. **Review Warnings**: Address the 29 warnings from migration to define missing positions
2. **Define Stub Positions**: Add proper definitions for Stack Guard, Straightjacket, etc.
3. **Test in UI**: Verify the graph renders correctly with all positions and moves
4. **Update Documentation**: Update any documentation referencing the old schema

The refactoring is complete and the application should now work with the new schema where positions are nodes and moves are edges.