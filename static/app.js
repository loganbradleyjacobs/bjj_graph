// Configuration module
const CONFIG = {
  edgeColor: "#AAFDE9",
  maxEdgeWidth: 3,
  minArrowScale: 0.5,
  nodeColors: {
    "Guard": "#1f77b4",
    "Pass": "#ff7f0e",
    "Submission": "#d62728",
    "Takedown": "#DEB887",
    "Control": "#379a1c",
    "default": "#888"
  },
  debug: true
};

// Data processing module
class GraphDataProcessor {
  static processMovesetData(moveset) {
    const elements = [];

    Object.keys(moveset).forEach(key => {
      const move = moveset[key];
      elements.push({
        data: {
          id: key,
          label: key,
          path: move.path || [],
          parents: move.parents || [],
          children: move.children || [],
          area: move.area,
          type: move.type,
          image: move.image || `/static/images/${key.replace(/\s+/g, "_").toLowerCase()}.png`,
          video: move.video,
        },
      });
    });

    // Add edges
    Object.keys(moveset).forEach(key => {
      const move = moveset[key];
      if (move.children) {
        move.children.forEach(child => {
          if (moveset[child]) {
            elements.push({
              data: { source: key, target: child },
            });
          }
        });
      }
    });

    return elements;
  }
}

// Style manager
class GraphStyleManager {
  constructor(cy) {
    this.cy = cy;
  }

  getBaseStyles() {
    return [
      {
        selector: "node",
        style: this._getNodeStyles()
      },
      {
        selector: "node.debug-hide-label",
        style: {
          label: ""
        }
      },
      {
        selector: "edge",
        style: this._getEdgeStyles()
      }
    ];
  }

  _getNodeStyles() {
    return {
      //text
      label: (ele) => ele.data("label"),
      "font-size": (ele) => ele.width() * 0.2,
      color: "#fff",
      "text-valign": "center",
      "text-halign": "center",
      "text-wrap": "wrap",
      "text-max-width": "50%",

      //node
      width: (ele) => this._calculateNodeWidth(ele),
      height: (ele) => ele.width(),
      "background-color": (ele) => CONFIG.nodeColors[ele.data("type")] || CONFIG.nodeColors.default,
      
      // image
      "shape": "ellipse",
      "background-image": (ele) => ele.data("image") || null,
      "background-fit": "cover",
      "background-clip": "node",
      "background-width": "30%",
      "background-height": "30%",   

      //border
      "border-width": 4,
      "border-color": (ele) => CONFIG.nodeColors[ele.data("type")] || CONFIG.nodeColors.default,
    };
  }

  _getEdgeStyles() {
    return {
      width: 2,
      "line-color": CONFIG.edgeColor,
      "target-arrow-color": CONFIG.edgeColor,
      "target-arrow-shape": "triangle",
      "arrow-scale": 2,
      "curve-style": "straight",
    };
  }

  _calculateNodeWidth(ele) {
    const childrenCount = ele.data("children")?.length || 1;
    const parentCount = ele.data("parents")?.length || 1;
    return 30 + (childrenCount + parentCount) * 5;
  }

  updateEdgeWidths() {
    const zoom = this.cy.zoom();
    const width = Math.min(CONFIG.maxEdgeWidth, CONFIG.maxEdgeWidth / zoom);
    const arrowScale = Math.min(1, width);

    this.cy.batch(() => {
      this.cy.edges().forEach(edge => {
        edge.style("width", width);
        edge.style("arrow-scale", arrowScale);
      });
    });
  }

  updateEdgeStyle(mode) {
    this.cy.edges().style("curve-style", mode);
  }

  updateLabelSizing() {
    const zoom = this.cy.zoom();
    this.cy.nodes().forEach(node => {
      const width = node.width();
      node.style({
        "font-size": Math.max(4, Math.min(width * 0.2, 16 / zoom)),
      });
    });
  }
}

// Layout manager
class GraphLayoutManager {
  constructor(cy) {
    this.cy = cy;
  }

  runLayout(mode) {
    if (mode === "concentric") {
      this._applyConcentricLayout();
      return;
    }

    this._applyConcentricLayout(); // seed positions first

    if (mode === "dagre") {
      this._applyDagreLayout();
    } else {
      this._applyColaLayout();
    }
  }

  _applyConcentricLayout() {
    this.cy.layout({
      name: "concentric",
      concentric: n => n.degree(),
      levelWidth: () => 1,
      padding: 50,
    }).run();
  }

  _applyDagreLayout() {
    this.cy.layout({
      name: "dagre",
      rankDir: "TB",
      rankSep: 50,
      nodeSep: 30,
      edgeSep: 10,
      fit: true,
      padding: 20,
    }).run();
  }

  _applyColaLayout() {
    this.cy.layout({
      name: "cola",
      animate: true,
      randomize: false,
      maxSimulationTime: 3000,
      fit: true,
      padding: 20,
      nodeSpacing: () => 20,
      avoidOverlap: true,
    }).run();
  }
}

// Tooltip manager
class GraphTooltipManager {
  constructor(cy) {
    this.cy = cy;
    this.tooltip = this._createTooltip();
    this._setupEventListeners();
  }

  _createTooltip() {
    const tooltip = document.createElement("div");
    tooltip.className = "tooltip";
    tooltip.style.display = "none";
    document.body.appendChild(tooltip);
    return tooltip;
  }

  _setupEventListeners() {
    this.cy.on("mouseover", "node", evt => this._showTooltip(evt));
    this.cy.on("mousemove", evt => this._moveTooltip(evt));
    this.cy.on("mouseout", "node", () => this._hideTooltip());
    this.cy.on("tap", "node", evt => CONFIG.debug && console.log(`Data for clicked node: ${evt.target.id()}`, evt.target.data()))
  }

  _showTooltip(evt) {
    const node = evt.target;
    this.tooltip.innerHTML = `
      <strong>${node.data("label")}</strong><br>
      Parents: ${node.data("parents").join(", ")}<br>
      Children: ${node.data("children").join(", ")}<br>
      Area: ${node.data("area")}<br>
      Type: ${node.data("type")}<br>
      Image: ${node.data("image")}<br>
      Video: ${node.data("video")}
    `;
    this.tooltip.style.display = "block";
  }

  _moveTooltip(evt) {
    this.tooltip.style.left = `${evt.originalEvent.pageX + 10}px`;
    this.tooltip.style.top = `${evt.originalEvent.pageY + 10}px`;
  }

  _hideTooltip() {
    this.tooltip.style.display = "none";
  }
}

// Interaction manager
class GraphInteractionManager {
  constructor(cy, layoutSelect, edgeStyleSelect) {
    this.cy = cy;
    this.layoutSelect = layoutSelect;
    this.edgeStyleSelect = edgeStyleSelect;
    this.layoutManager = new GraphLayoutManager(cy);
    this.styleManager = new GraphStyleManager(cy);
    this._setupEventListeners();
  }

  _setupEventListeners() {
    this.layoutSelect.addEventListener("change", () => {
      this.layoutManager.runLayout(this.layoutSelect.value);
    });

    this.edgeStyleSelect.addEventListener("change", () => {
      this.styleManager.updateEdgeStyle(this.edgeStyleSelect.value);
    });

    this.cy.on("zoom", () => {
      this.styleManager.updateEdgeWidths();
      this.styleManager.updateLabelSizing();
    });

    this.cy.on("tap", "node", (evt) => {
      const node = evt.target;
      const fractionOfViewport = 0.15
      this.cy.animate({
        center: { eles: node },
        zoom: this.cy.container().clientWidth * fractionOfViewport / node.width(),
        duration: 300,
        easing: "ease-in-out"
      });
    });
  }

  enableInteractions() {
    this.cy.userZoomingEnabled(true);
    this.cy.userPanningEnabled(true);
  }
}

// Main Graph class
class Graph {
  constructor(containerId, layoutSelectId, edgeStyleSelectId) {
    this.containerId = containerId;
    this.layoutSelect = document.getElementById(layoutSelectId);
    this.edgeStyleSelect = document.getElementById(edgeStyleSelectId);
    this.cy = null;
    this.layoutManager = null;
    this.styleManager = null;
    this.interactionManager = null;
    this.tooltipManager = null;
  }

  async initialize() {
    try {
      const moveset = await this._fetchMovesetData();
      const elements = GraphDataProcessor.processMovesetData(moveset);

      // Initialize Cytoscape first
      this.cy = cytoscape({
        container: document.getElementById(this.containerId),
        elements: elements,
        style: [], // start empty
        layout: { name: "preset" }
      });

      // Now style manager can reference cy
      this.styleManager = new GraphStyleManager(this.cy);
      this.cy.style().fromJson(this.styleManager.getBaseStyles()).update();

      this.layoutManager = new GraphLayoutManager(this.cy);
      this.interactionManager = new GraphInteractionManager(
        this.cy,
        this.layoutSelect,
        this.edgeStyleSelect
      );
      this.tooltipManager = new GraphTooltipManager(this.cy);

      // Apply initial layout and styles
      this.layoutManager.runLayout(this.layoutSelect.value);
      this.styleManager.updateEdgeWidths();
      this.styleManager.updateLabelSizing();
      this.styleManager.updateEdgeStyle(this.edgeStyleSelect.value);
      this.interactionManager.enableInteractions();

      // hook up show label checkbox
      const showLabelCheckbox = document.getElementById("showLabelCheckbox")
      showLabelCheckbox.addEventListener("change", () => {
        const show = showLabelCheckbox.checked;
        this.cy.nodes().forEach(node => {
          if (show) node.removeClass("debug-hide-label");
          else node.addClass("debug-hide-label");
        });
      });

      const nodeColorPicker = document.getElementById("nodeColorPicker");
      nodeColorPicker.addEventListener("input", (e) => {
        const color = e.target.value;
        this.cy.nodes().style({
          "background-color": color,
          "border-color": color
        });
      });

      document.getElementById("resetNodeColors").addEventListener("click", () => {
        this.cy.nodes().style({
          "background-color": (ele) =>
            CONFIG.nodeColors[ele.data("type")] || CONFIG.nodeColors.default,
          "border-color": (ele) =>
            CONFIG.nodeColors[ele.data("type")] || CONFIG.nodeColors.default
        });
      });

      const bgColorPicker = document.getElementById("bgColorPicker");
        bgColorPicker.addEventListener("input", (e) => {
          document.documentElement.style.setProperty(
            "--page-bg",
            e.target.value
          );
        });

      const edgeColorPicker = document.getElementById("edgeColorPicker");
        edgeColorPicker.addEventListener("input", (e) => {
          CONFIG.edgeColor = e.target.value;
          this.cy.edges().style({
            "line-color": CONFIG.edgeColor,
            "target-arrow-color": CONFIG.edgeColor
          });
        });


      document.getElementById("resetColors").addEventListener("click", () => {
      document.documentElement.style.setProperty("--page-bg", "#5050a0");

      this.cy.nodes().style({
        "background-color": (ele) =>
          CONFIG.nodeColors[ele.data("type")] || CONFIG.nodeColors.default,
        "border-color": (ele) =>
          CONFIG.nodeColors[ele.data("type")] || CONFIG.nodeColors.default
      });

      this.cy.edges().style({
        "line-color": CONFIG.edgeColor,
        "target-arrow-color": CONFIG.edgeColor
      });
    });



    } catch (err) {
      console.error("Failed to initialize graph:", err);
    }
  }

  async _fetchMovesetData() {
    const response = await fetch("/moveset");
    if (!response.ok) throw new Error(`Failed to fetch moveset: ${response.status}`);
    return await response.json();
  }
}

// Initialize graph
async function loadGraph() {
  const graph = new Graph("cy", "layoutMode", "edgeStyleMode");
  await graph.initialize();
} loadGraph();
