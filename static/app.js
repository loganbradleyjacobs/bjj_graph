// Configuration module
const CONFIG = {
  edgeColor: "#AAFDE9",
  nodeColors: {
    "Guard": "#1f77b4",
    "Pass": "#ff7f0e",
    "Predicament": "#d4a017",
    "Submission": "#d62728",
    "Takedown": "#DEB887",
    "Control": "#379a1c",
    "Neutral": "#9b59b6",
    "Transition": "#888",
    "Unknown": "#ff5555",
    "default": "#888"
  }
};

// Data processing module
class GraphDataProcessor {
  static processMovesetData(data) {
    const elements = [];
    const positions = data.positions || {};
    const moves = data.moves || [];

    // Nodes
    Object.keys(positions).forEach(name => {
      const pos = positions[name];
      elements.push({
        data: {
          id: name,
          label: name,
          type: pos.type,
          area: pos.area || [],
          image: pos.image ||
            `/static/images/${name.replace(/\s+/g, "_").toLowerCase()}.png`,
          video: pos.video,
          images: pos.images || [],
          videos: pos.videos || [],
          notes: pos.notes || "",
          stub: !!pos._stub,
          x: pos.x != null ? pos.x : null,
          y: pos.y != null ? pos.y : null,
        }
      });
    });

    // Edges: expand each move's from x to into pairwise edges.
    // Dedupe on (pair, move name) so two different moves on the same
    // pair render as parallel edges, but the same move isn't doubled.
    const edgeKeys = new Set();
    moves.forEach((move, mi) => {
      const froms = move.from || [];
      const tos = move.to || [];
      froms.forEach((f, fi) => {
        tos.forEach((t, ti) => {
          if (!positions[f] || !positions[t]) return; // guard
          const key = [f, t].sort().join("::") + "::" + (move.name || "");
          if (edgeKeys.has(key)) return;
          edgeKeys.add(key);
          elements.push({
            data: {
              id: `e${mi}_${fi}_${ti}`,
              source: f,
              target: t,
              label: move.name || "",
              moveType: move.type || "Transition",
              moveName: move.name || null,
              notes: move.notes || "",
              images: move.images || [],
              videos: move.videos || [],
            }
          });
        });
      });
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
        selector: "edge.hide-edge-label",
        style: { label: "" }
      },
      {
        selector: "node[?stub]",
        style: {
          "border-style": "dashed",
          "border-color": "#ff5555",
          "background-color": "#552222"
        }
      },
      {
        selector: "edge",
        style: this._getEdgeStyles()
      },
      {
        selector: 'edge[moveType = "Finish"]',
        style: {
          "line-color": "#d62728"
        }
      },
      {
        selector: 'edge[moveType = "Escape"]',
        style: {
          "line-style": "dashed",
          opacity: 0.7
        }
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
      width: 1,
      "line-color": CONFIG.edgeColor,
      "target-arrow-shape": "none",
      "source-arrow-shape": "none",
      "curve-style": "bezier",
      label: (ele) => ele.data("label") || "",
      "font-size": 8,
      color: "#fff",
      "text-rotation": "autorotate",
      "text-background-opacity": 0.7,
      "text-background-color": "#000",
      "text-background-padding": 2,
    };
  }

  _calculateNodeWidth(ele) {
    const deg = ele.degree ? ele.degree() : 1;
    return Math.min(60, 30 + deg * 5);
  }

  updateEdgeWidths() {
    const zoom = this.cy.zoom();
    const screenWidth = 1;
    this.cy.batch(() => {
      this.cy.edges().forEach(edge => {
        edge.style("width", screenWidth / zoom);
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
    this._activeLayout = null;
    this._layoutToken = 0;
  }

  runLayout(mode, opts = {}) {
    // Stop any layout that's still running.
    if (this._activeLayout && typeof this._activeLayout.stop === "function") {
      try { this._activeLayout.stop(); } catch (e) { /* noop */ }
    }
    this._activeLayout = null;
    this.cy.stop();
    this._layoutToken += 1;

    if (mode === "preset") {
      this._applyPresetLayout(opts);
      return;
    }

    if (mode === "concentric") {
      this._applyConcentricLayout();
      return;
    }

    if (mode === "fcose") {
      this._applyFcoseLayout();
      return;
    }

    this._applyConcentricLayout(); // seed positions first for dagre/cola

    if (mode === "dagre") {
      this._applyDagreLayout();
    } else {
      this._applyColaLayout();
    }
  }

  _applyPresetLayout(opts = {}) {
    const animate = opts.animate !== false;
    const startup = opts.startup === true;

    const nodes = this.cy.nodes();
    const allHavePositions = nodes.length > 0 && nodes.every(n => {
      return n.data("x") != null && n.data("y") != null;
    });

    if (!allHavePositions) {
      this.cy.fit(undefined, 40);
      return;
    }

    if (!animate) {
      nodes.forEach(n => n.position({ x: n.data("x"), y: n.data("y") }));
      this.cy.fit(undefined, 40);
      return;
    }

    // 1. Set starting positions
    if (startup) {
      // Scatter nodes near origin so they are distinguishable
      nodes.forEach(n => {
        n.position({
          x: (Math.random() - 0.5) * 260,
          y: (Math.random() - 0.5) * 260,
        });
      });
      this.cy.fit(nodes, 40);
    }

    // 2. Pre-calculate the target viewport from saved positions.
    // We temporarily move nodes to their saved positions, calculate the
    // bounding box, and restore them. This lets us animate the camera
    // and the nodes concurrently, so nodes stay in view the whole time.
    const currentPositions = nodes.map(n => ({ ...n.position() }));
    nodes.forEach(n => n.position({ x: n.data("x"), y: n.data("y") }));
    const targetBB = nodes.boundingBox();
    nodes.forEach((n, i) => n.position(currentPositions[i]));

    const duration = 800;
    const easing = "ease-out";
    const myToken = this._layoutToken;

    // 3. Animate the viewport concurrently with node movement.
    if (targetBB.w > 0 && targetBB.h > 0) {
      const w = this.cy.width();
      const h = this.cy.height();
      const padding = 40;
      const targetZoom = Math.min(
        (w - 2 * padding) / targetBB.w,
        (h - 2 * padding) / targetBB.h
      );
      const targetPan = {
        x: w / 2 - targetZoom * (targetBB.x1 + targetBB.w / 2),
        y: h / 2 - targetZoom * (targetBB.y1 + targetBB.h / 2),
      };
      this.cy.animate({
        zoom: targetZoom,
        pan: targetPan,
        duration,
        easing,
      });
    }

    // 4. Animate nodes to saved positions.
    nodes.forEach(n => {
      n.animate(
        { position: { x: n.data("x"), y: n.data("y") } },
        { duration, easing }
      );
    });

    // 5. Track layout for cancellation.
    this._activeLayout = {
      stop: () => {
        this.cy.stop();
        nodes.stop();
      },
    };
  }

  _applyConcentricLayout() {
    const layout = this.cy.layout({
      name: "concentric",
      concentric: n => n.degree(),
      levelWidth: () => 1,
      padding: 50,
    });
    this._activeLayout = layout;
    layout.run();
  }

  _applyDagreLayout() {
    const layout = this.cy.layout({
      name: "dagre",
      rankDir: "TB",
      rankSep: 50,
      nodeSep: 30,
      edgeSep: 10,
      fit: true,
      padding: 20,
    });
    this._activeLayout = layout;
    layout.run();
  }

  _applyFcoseLayout() {
    const IDEAL = { Finish: 20, Transition: 300, Escape: 500 };
    const ELAST = { Finish: 1.0, Transition: 0.2, Escape: 0.1 };

    const layout = this.cy.layout({
      name: "fcose",
      randomize: true,
      animate: true,
      animationDuration: 600,
      nodeRepulsion: 8000,
      idealEdgeLength: edge => IDEAL[edge.data("moveType")] ?? 300,
      edgeElasticity: edge => ELAST[edge.data("moveType")] ?? 0.2,
      gravity: 0.15,
      numIter: 2500,
      fit: true,
      padding: 40,
    });
    this._activeLayout = layout;
    layout.run();
  }

  _applyColaLayout() {
    const SPRING = {
      Finish: 10,
      Transition: 30,
      Escape: 100,
    };

    const layout = this.cy.layout({
      name: "cola",
      animate: true,
      randomize: false,
      maxSimulationTime: 3000,
      fit: true,
      padding: 20,
      nodeSpacing: () => 20,
      avoidOverlap: true,
      edgeLength: edge => SPRING[edge.data("moveType")] ?? 90,
    });
    this._activeLayout = layout;
    layout.run();
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
    this.cy.on("mouseover", "node", evt => this._showNodeTooltip(evt));
    this.cy.on("mouseover", "edge", evt => this._showEdgeTooltip(evt));
    this.cy.on("mousemove", evt => this._moveTooltip(evt));
    this.cy.on("mouseout", "node, edge", () => this._hideTooltip());
  }

  _showNodeTooltip(evt) {
    const node = evt.target;
    const escape = s => String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    const incoming = node.incomers("edge").map(e => {
      const kind = e.data("moveType") || "transition";
      const nm = e.data("label") ? ` — ${escape(e.data("label"))}` : "";
      return `&nbsp;&nbsp;← ${escape(e.source().id())} (${escape(kind)}${nm})`;
    });
    const outgoing = node.outgoers("edge").map(e => {
      const kind = e.data("moveType") || "transition";
      const nm = e.data("label") ? ` — ${escape(e.data("label"))}` : "";
      return `&nbsp;&nbsp;→ ${escape(e.target().id())} (${escape(kind)}${nm})`;
    });

    const parts = [
      `<strong>${escape(node.data("label"))}</strong>`,
      `Type: ${escape(node.data("type") || "?")}`,
      `Area: ${(node.data("area") || []).map(escape).join(", ") || "—"}`,
    ];

    if (incoming.length) parts.push("Entries:<br>" + incoming.join("<br>"));
    if (outgoing.length) parts.push("Exits:<br>" + outgoing.join("<br>"));

    const notes = node.data("notes");
    if (notes) parts.push(`<hr>${escape(notes).replace(/\n/g, "<br>")}`);

    const images = node.data("images") || [];
    if (images.length) {
      parts.push("Images:<br>" + images.map(src =>
        `<a href="${escape(src)}" target="_blank">${escape(src.split("/").pop())}</a>`
      ).join("<br>"));
    }

    const videos = node.data("videos") || [];
    if (videos.length) {
      parts.push("Videos:<br>" + videos.map(url =>
        `<a href="${escape(url)}" target="_blank">${escape(url)}</a>`
      ).join("<br>"));
    }

    this.tooltip.innerHTML = parts.join("<br>");
    this.tooltip.style.display = "block";
  }

  _showEdgeTooltip(evt) {
    const e = evt.target;
    const escape = s => String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    const parts = [
      `<strong>${escape(e.data("label") || "(unnamed transition)")}</strong>`,
      `Type: ${escape(e.data("moveType") || "Transition")}`,
      `${escape(e.source().id())} ↔ ${escape(e.target().id())}`,
    ];

    const notes = e.data("notes");
    if (notes) parts.push(`<hr>${escape(notes).replace(/\n/g, "<br>")}`);

    const images = e.data("images") || [];
    if (images.length) {
      parts.push("Images:<br>" + images.map(src =>
        `<a href="${escape(src)}" target="_blank">${escape(src.split("/").pop())}</a>`
      ).join("<br>"));
    }

    const videos = e.data("videos") || [];
    if (videos.length) {
      parts.push("Videos:<br>" + videos.map(url =>
        `<a href="${escape(url)}" target="_blank">${escape(url)}</a>`
      ).join("<br>"));
    }

    this.tooltip.innerHTML = parts.join("<br>");
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

    this.cy.on("zoomend", () => {
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

      // Apply initial layout and styles.
      // If every node has saved x/y, use preset mode and apply positions.
      // Otherwise run the selected layout as usual.
      const allNodes = this.cy.nodes();
      const allHavePositions = allNodes.length > 0 && allNodes.every(n => {
        const x = n.data("x");
        const y = n.data("y");
        return x != null && y != null;
      });

      if (allHavePositions) {
        this.layoutSelect.value = "preset";
        this.layoutManager.runLayout("preset", { startup: true });
      } else {
        this.layoutManager.runLayout(this.layoutSelect.value);
      }

      this.styleManager.updateEdgeWidths();
      this.styleManager.updateLabelSizing();
      this.styleManager.updateEdgeStyle(this.edgeStyleSelect.value);
      this.interactionManager.enableInteractions();

      // hook up show label checkbox
      const showLabelCheckbox = document.getElementById("showLabelCheckbox");
      showLabelCheckbox.addEventListener("change", () => {
        const show = showLabelCheckbox.checked;
        this.cy.nodes().forEach(n =>
          show ? n.removeClass("debug-hide-label") : n.addClass("debug-hide-label"));
        this.cy.edges().forEach(e =>
          show ? e.removeClass("hide-edge-label") : e.addClass("hide-edge-label"));
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

      this._wireUpSaveButton();

    } catch (err) {
      console.error("Failed to initialize graph:", err);
    }
  }

  async _fetchMovesetData() {
    const response = await fetch("/moveset");
    if (!response.ok) throw new Error(`Failed to fetch moveset: ${response.status}`);
    return await response.json();
  }

  _wireUpSaveButton() {
    const btn = document.getElementById("savePositions");
    const status = document.getElementById("saveStatus");
    if (!btn || !status) return;

    btn.addEventListener("click", async () => {
      btn.disabled = true;
      status.textContent = "Saving…";
      try {
        const result = await this.savePositions();
        status.textContent = `Saved ${result.saved} / ${result.total} nodes`;
        setTimeout(() => { status.textContent = ""; }, 3000);
      } catch (err) {
        console.error(err);
        status.textContent = `Save failed: ${err.message}`;
      } finally {
        btn.disabled = false;
      }
    });
  }

  async savePositions() {
    const positions = {};
    this.cy.nodes().forEach(n => {
      const p = n.position();
      positions[n.id()] = { x: p.x, y: p.y };
    });

    const resp = await fetch("/moveset/positions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ positions }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`${resp.status} — ${text.slice(0, 200)}`);
    }

    // Keep in-memory data in sync with disk so that switching back to
    // preset restores the just-saved layout, not the previous one.
    this.cy.nodes().forEach(n => {
      n.data("x", n.position("x"));
      n.data("y", n.position("y"));
    });

    return await resp.json();
  }
}

// Initialize graph
async function loadGraph() {
  const graph = new Graph("cy", "layoutMode", "edgeStyleMode");
  await graph.initialize();
} loadGraph();