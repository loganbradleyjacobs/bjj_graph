const CONFIG = {
  edgeColor: "#A9B7C6",
  nodeColors: {
    "Guard": "#6897BB", "Pass": "#CC7832", "Predicament": "#FFC66D",
    "Submission": "#F92672", "Takedown": "#A9B7C6", "Control": "#9876AA",
    "Neutral": "#9876AA", "Transition": "#808080", "Unknown": "#ff5555",
    "default": "#A9B7C6"
  }
};

class GraphDataProcessor {
  static processMovesetData(data) {
    const elements = [];
    const positions = data.positions || {};
    const moves = data.moves || [];

    Object.keys(positions).forEach(name => {
      const pos = positions[name];
      elements.push({ data: {
        id: name, label: name, type: pos.type, area: pos.area || [],
        image: pos.image || `/static/images/${name.replace(/\s+/g, "_").toLowerCase()}.png`,
        video: pos.video, images: pos.images || [], videos: pos.videos || [],
        notes: pos.notes || "", stub: !!pos._stub,
        x: pos.x != null ? pos.x : null, y: pos.y != null ? pos.y : null,
      }});
    });

    const edgeKeys = new Set();
    moves.forEach(move => {
      const froms = move.from || [];
      const tos = move.to || [];
      froms.forEach(f => {
        tos.forEach(t => {
          if (!positions[f] || !positions[t]) return;
          const key = [f, t].sort().join("::") + "::" + (move.name || "");
          if (edgeKeys.has(key)) return;
          edgeKeys.add(key);
          const safeId = "e_" + key.replace(/[^a-zA-Z0-9_:]/g, "_");
          elements.push({ data: {
            id: safeId, source: f, target: t, label: move.name || "",
            moveType: move.type || "Transition", moveName: move.name || null,
            notes: move.notes || "", images: move.images || [], videos: move.videos || [],
          }});
        });
      });
    });
    return elements;
  }
}

class GraphStyleManager {
  constructor(cy) { this.cy = cy; }

  getBaseStyles() {
    return [
      { selector: "node", style: this._getNodeStyles() },
      { selector: "node.debug-hide-label", style: { label: "" } },
      { selector: "edge.hide-edge-label", style: { label: "" } },
      { selector: "node[?stub]", style: { "border-style": "dashed", "border-color": "#ff5555", "background-color": "#552222" } },
      { selector: "edge", style: this._getEdgeStyles() },
      { selector: 'edge[moveType = "Finish"]', style: { "line-color": "#d62728" } },
      { selector: 'edge[moveType = "Escape"]', style: { "line-style": "dashed", opacity: 0.7 } },
      { selector: "edge.curve-straight", style: { "curve-style": "straight" } },
      { selector: "edge.curve-bezier", style: { "curve-style": "bezier" } },
      { selector: "edge.curve-unbundled-bezier", style: { "curve-style": "unbundled-bezier" } },
      { selector: "edge.curve-haystack", style: { "curve-style": "haystack" } },
      { selector: "edge.curve-segments", style: { "curve-style": "segments" } },
      { selector: "edge.curve-taxi", style: { "curve-style": "taxi" } },
      { selector: "edge.avoid-overlap", style: { "curve-style": "unbundled-bezier", "control-point-distances": 60, "control-point-weights": 0.5 } },
      { selector: "edge.highlighted", style: { "line-color": "#ffffff", "opacity": 1, "z-index": 10 } },
      { selector: "edge.faded", style: { opacity: 0.1 } },
      { selector: "node.faded", style: { opacity: 0.15 } },
    ];
  }

  _getNodeStyles() {
    return {
      label: ele => ele.data("label"),
      "font-family": "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
      "font-size": ele => ele.width() * 0.2, color: "#fff",
      "text-valign": "center", "text-halign": "center", "text-wrap": "wrap", "text-max-width": "50%",
      width: ele => this._calculateNodeWidth(ele), height: ele => ele.width(),
      "background-color": ele => CONFIG.nodeColors[ele.data("type")] || CONFIG.nodeColors.default,
      "shape": "ellipse",
      "background-image": ele => ele.data("image") || null,
      "background-fit": "cover", "background-clip": "node",
      "background-width": "30%", "background-height": "30%",
      "border-width": 4,
      "border-color": ele => CONFIG.nodeColors[ele.data("type")] || CONFIG.nodeColors.default,
    };
  }

  _getEdgeStyles() {
    return {
      width: 1, "line-color": CONFIG.edgeColor,
      "target-arrow-shape": "none", "source-arrow-shape": "none", "curve-style": "bezier",
      label: ele => ele.data("label") || "", "font-size": 8, color: "#fff",
      "text-rotation": "autorotate", "text-background-opacity": 0.7,
      "text-background-color": "#000", "text-background-padding": 2,
    };
  }

  _calculateNodeWidth(ele) {
    const deg = ele.degree ? ele.degree() : 1;
    return Math.min(60, 30 + deg * 5);
  }

  updateEdgeWidths() {
    const zoom = this.cy.zoom();
    this.cy.batch(() => { this.cy.edges().forEach(e => e.style("width", 1 / zoom)); });
  }

  updateEdgeStyle(mode) {
    const classes = "curve-straight curve-bezier curve-unbundled-bezier curve-haystack curve-segments curve-taxi";
    this.cy.edges().removeClass(classes);
    this.cy.edges().addClass(`curve-${mode}`);
    this.detectOverlappingEdges();
  }

  updateLabelSizing() {
    const zoom = this.cy.zoom();
    this.cy.nodes().forEach(node => {
      node.style({ "font-size": Math.max(4, Math.min(node.width() * 0.2, 16 / zoom)) });
    });
  }

  detectOverlappingEdges() {
    const THRESH = 0.98;
    this.cy.batch(() => {
      this.cy.edges().removeClass("avoid-overlap");
      this.cy.nodes().forEach(node => {
        const pos = node.position();
        const edges = node.connectedEdges();
        if (edges.length < 2) return;
        const vecs = edges.map(edge => {
          const other = edge.source().id() === node.id() ? edge.target() : edge.source();
          const op = other.position();
          const dx = op.x - pos.x, dy = op.y - pos.y;
          return { edge, dx, dy, len: Math.sqrt(dx * dx + dy * dy) || 1 };
        }).sort((a, b) => a.len - b.len);
        for (let i = 0; i < vecs.length; i++) {
          for (let j = i + 1; j < vecs.length; j++) {
            const v1 = vecs[i], v2 = vecs[j];
            const dot = (v1.dx / v1.len) * (v2.dx / v2.len) + (v1.dy / v1.len) * (v2.dy / v2.len);
            if (dot > THRESH) v2.edge.addClass("avoid-overlap");
          }
        }
      });
    });
  }
}

class GraphLayoutManager {
  constructor(cy, styleManager) {
    this.cy = cy; this.styleManager = styleManager;
    this._activeLayout = null; this._layoutToken = 0;
  }

  runLayout(mode, opts = {}) {
    if (this._activeLayout && typeof this._activeLayout.stop === "function") {
      try { this._activeLayout.stop(); } catch (e) {}
    }
    this._activeLayout = null; this.cy.stop(); this._layoutToken += 1;

    if (mode === "preset") return this._applyPresetLayout(opts);
    if (mode === "concentric") return this._applyConcentricLayout();
    if (mode === "fcose") return this._applyFcoseLayout();

    this._applyConcentricLayout();
    if (mode === "dagre") this._applyDagreLayout();
    else this._applyColaLayout();
  }

  _applyPresetLayout(opts = {}) {
    const animate = opts.animate !== false;
    const startup = opts.startup === true;
    const nodes = this.cy.nodes();
    const allHavePositions = nodes.length > 0 && nodes.every(n => n.data("x") != null && n.data("y") != null);
    if (!allHavePositions) { this.cy.fit(undefined, 40); return; }

    if (!animate) {
      nodes.forEach(n => n.position({ x: n.data("x"), y: n.data("y") }));
      this.cy.fit(undefined, 40);
      if (this.styleManager) this.styleManager.detectOverlappingEdges();
      return;
    }

    if (startup) {
      nodes.forEach(n => n.position({ x: (Math.random() - 0.5) * 260, y: (Math.random() - 0.5) * 260 }));
      this.cy.fit(nodes, 40);
    }

    const cur = nodes.map(n => ({ ...n.position() }));
    nodes.forEach(n => n.position({ x: n.data("x"), y: n.data("y") }));
    const bb = nodes.boundingBox();
    nodes.forEach((n, i) => n.position(cur[i]));

    const duration = 800, easing = "ease-out";
    const myToken = this._layoutToken;

    if (bb.w > 0 && bb.h > 0) {
      const w = this.cy.width(), h = this.cy.height(), pad = 40;
      const tz = Math.min((w - 2 * pad) / bb.w, (h - 2 * pad) / bb.h);
      this.cy.animate({
        zoom: tz,
        pan: { x: w / 2 - tz * (bb.x1 + bb.w / 2), y: h / 2 - tz * (bb.y1 + bb.h / 2) },
        duration, easing,
      });
    }

    nodes.forEach(n => n.animate({ position: { x: n.data("x"), y: n.data("y") } }, { duration, easing }));
    this._activeLayout = { stop: () => { this.cy.stop(); nodes.stop(); } };
    if (this.styleManager) setTimeout(() => this.styleManager.detectOverlappingEdges(), duration + 150);
  }

  _applyConcentricLayout() {
    const layout = this.cy.layout({ name: "concentric", concentric: n => n.degree(), levelWidth: () => 1, padding: 50 });
    this._activeLayout = layout; layout.run();
  }

  _applyDagreLayout() {
    const layout = this.cy.layout({ name: "dagre", rankDir: "TB", rankSep: 50, nodeSep: 30, edgeSep: 10, fit: true, padding: 20 });
    this._activeLayout = layout; layout.run();
  }

  _applyFcoseLayout() {
    const IDEAL = { Finish: 20, Transition: 300, Escape: 500 };
    const ELAST = { Finish: 1.0, Transition: 0.2, Escape: 0.1 };
    const layout = this.cy.layout({
      name: "fcose", randomize: true, animate: true, animationDuration: 600,
      nodeRepulsion: 8000,
      idealEdgeLength: e => IDEAL[e.data("moveType")] ?? 300,
      edgeElasticity: e => ELAST[e.data("moveType")] ?? 0.2,
      gravity: 0.15, numIter: 2500, fit: true, padding: 40,
    });
    this._activeLayout = layout; layout.run();
  }

  _applyColaLayout() {
    const SPRING = { Finish: 10, Transition: 30, Escape: 100 };
    const layout = this.cy.layout({
      name: "cola", animate: true, randomize: false, maxSimulationTime: 3000,
      fit: true, padding: 20, nodeSpacing: () => 20, avoidOverlap: true,
      edgeLength: e => SPRING[e.data("moveType")] ?? 90,
    });
    this._activeLayout = layout; layout.run();
  }
}

class GraphTooltipManager {
  constructor(cy) {
    this.cy = cy; this.tooltip = this._create(); this._listeners();
  }
  _create() {
    const t = document.createElement("div");
    t.className = "tooltip"; t.style.display = "none";
    document.body.appendChild(t); return t;
  }
  _listeners() {
    this.cy.on("mouseover", "node", e => this._showNode(e));
    this.cy.on("mouseover", "edge", e => this._showEdge(e));
    this.cy.on("mousemove", e => this._move(e));
    this.cy.on("mouseout", "node, edge", () => this._hide());
    document.getElementById("cy").addEventListener("mouseleave", () => this._hide());
    document.getElementById("sidebar").addEventListener("mouseenter", () => this._hide());
  }
  _showNode(evt) {
    const n = evt.target;
    const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const inc = n.incomers("edge").map(e => {
      const k = e.data("moveType") || "transition";
      const nm = e.data("label") ? `: ${esc(e.data("label"))}` : "";
      return `&nbsp;&nbsp;← ${esc(k)}${nm} (from ${esc(e.source().id())})`;
    });
    const out = n.outgoers("edge").map(e => {
      const k = e.data("moveType") || "transition";
      const nm = e.data("label") ? `: ${esc(e.data("label"))}` : "";
      return `&nbsp;&nbsp;→ ${esc(k)}${nm} (to ${esc(e.target().id())})`;
    });
    const p = [
      `<strong>${esc(n.data("label"))}</strong>`,
      `Type: ${esc(n.data("type") || "?")}`,
      `Area: ${(n.data("area") || []).map(esc).join(", ") || "—"}`,
    ];
    if (inc.length) p.push("Entries:<br>" + inc.join("<br>"));
    if (out.length) p.push("Exits:<br>" + out.join("<br>"));
    const notes = n.data("notes");
    if (notes) p.push(`<hr>${esc(notes).replace(/\n/g, "<br>")}`);
    this.tooltip.innerHTML = p.join("<br>");
    this.tooltip.style.display = "block";
  }
  _showEdge(evt) {
    const e = evt.target;
    const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const p = [
      `<strong>${esc(e.data("label") || "(unnamed transition)")}</strong>`,
      `Type: ${esc(e.data("moveType") || "Transition")}`,
      `${esc(e.source().id())} ↔ ${esc(e.target().id())}`,
    ];
    const notes = e.data("notes");
    if (notes) p.push(`<hr>${esc(notes).replace(/\n/g, "<br>")}`);
    this.tooltip.innerHTML = p.join("<br>");
    this.tooltip.style.display = "block";
  }
  _move(evt) {
    this.tooltip.style.left = `${evt.originalEvent.pageX + 10}px`;
    this.tooltip.style.top = `${evt.originalEvent.pageY + 10}px`;
  }
  _hide() { this.tooltip.style.display = "none"; }
}

class GraphInteractionManager {
  constructor(cy, layoutSelect, edgeStyleSelect, graphRef) {
    this.cy = cy; this.layoutSelect = layoutSelect; this.edgeStyleSelect = edgeStyleSelect;
    this.graphRef = graphRef;
    this.layoutManager = new GraphLayoutManager(cy);
    this.styleManager = new GraphStyleManager(cy);
    this._listeners();
  }

  _listeners() {
    this.layoutSelect.addEventListener("change", () => this.layoutManager.runLayout(this.layoutSelect.value));
    this.edgeStyleSelect.addEventListener("change", () => this.styleManager.updateEdgeStyle(this.edgeStyleSelect.value));
    this.cy.on("zoomend", () => { this.styleManager.updateEdgeWidths(); this.styleManager.updateLabelSizing(); });

    const updateHighlights = () => {
      this.cy.batch(() => {
        this.cy.elements().removeClass("highlighted").removeClass("faded");
        const selected = this.cy.nodes(":selected");
        if (selected.length === 1) {
          const node = selected[0];
          const connectedEdges = node.connectedEdges();
          const connectedNodes = connectedEdges.connectedNodes();
          connectedEdges.addClass("highlighted");
          const keepVisible = connectedEdges.union(connectedNodes).union(node);
          this.cy.elements().not(keepVisible).addClass("faded");
        }
      });
    };

    this.cy.on("select", "node", () => { this.graphRef._handleSelectionChange(); updateHighlights(); });
    this.cy.on("unselect", "node", () => { this.graphRef._handleSelectionChange(); updateHighlights(); });

    this.cy.on("tap", "node", evt => {
      if (this.graphRef.currentTab === 'search') document.getElementById("tab-edit").click();
      const node = evt.target;
      const connectedEdges = node.connectedEdges();
      const connectedNodes = connectedEdges.connectedNodes();
      const sub = connectedEdges.union(connectedNodes).union(node);

      // Compute fit target once, then animate zoom+pan explicitly
      const bb = sub.boundingBox();
      if (bb.w === 0 && bb.h === 0) return; // guard: single point / empty

      const w = this.cy.width();
      const h = this.cy.height();
      const pad = 120;
      const targetZoom = Math.min(
        (w - 2 * pad) / Math.max(bb.w, 1),
        (h - 2 * pad) / Math.max(bb.h, 1)
      );
      const targetPan = {
        x: w / 2 - targetZoom * (bb.x1 + bb.w / 2),
        y: h / 2 - targetZoom * (bb.y1 + bb.h / 2),
      };

      // Delay briefly so the sidebar's cy.resize() has settled (or use 0 if sidebar is already open)
      const delay = this.graphRef.sidebar.classList.contains("open") ? 0 : 150;
      setTimeout(() => {
        this.cy.animate({ zoom: targetZoom, pan: targetPan, duration: 600, easing: "ease-in-out" });
      }, delay);
    });

    this.cy.on("tap", evt => {
      if (evt.target === this.cy) {
        const had = this.cy.nodes(":selected").length > 0;
        this.cy.elements().unselect();
        if (!had) this.graphRef._openSidebar(null);
      }
    });
  }

  enableInteractions() { this.cy.userZoomingEnabled(true); this.cy.userPanningEnabled(true); }
}

class Graph {
  constructor(containerId, layoutSelectId, edgeStyleSelectId) {
    this.containerId = containerId;
    this.layoutSelect = document.getElementById(layoutSelectId);
    this.edgeStyleSelect = document.getElementById(edgeStyleSelectId);
    this.currentTab = 'edit';
    this.searchIndex = [];
    this._isClosingSidebar = false;
    this.pendingImage = null;
  }

  async initialize() {
    try {
      const moveset = await this._fetchMovesetData();
      this.allMoves = moveset.moves || [];
      const elements = GraphDataProcessor.processMovesetData(moveset);

      this.cy = cytoscape({
        container: document.getElementById(this.containerId),
        elements, style: [], layout: { name: "preset" }
      });

      this.styleManager = new GraphStyleManager(this.cy);
      this.cy.style().fromJson(this.styleManager.getBaseStyles()).update();

      this.layoutManager = new GraphLayoutManager(this.cy, this.styleManager);
      this.interactionManager = new GraphInteractionManager(this.cy, this.layoutSelect, this.edgeStyleSelect, this);
      this.tooltipManager = new GraphTooltipManager(this.cy);

      const nodes = this.cy.nodes();
      const allPos = nodes.length > 0 && nodes.every(n => n.data("x") != null && n.data("y") != null);
      if (allPos) { this.layoutSelect.value = "preset"; this.layoutManager.runLayout("preset", { startup: true }); }
      else this.layoutManager.runLayout(this.layoutSelect.value);

      this.styleManager.updateEdgeWidths();
      this.styleManager.updateLabelSizing();
      this.styleManager.updateEdgeStyle(this.edgeStyleSelect.value);
      this.interactionManager.enableInteractions();

      document.getElementById("showLabelCheckbox").addEventListener("change", e => {
        const show = e.target.checked;
        this.cy.nodes().forEach(n => show ? n.removeClass("debug-hide-label") : n.addClass("debug-hide-label"));
        this.cy.edges().forEach(ed => show ? ed.removeClass("hide-edge-label") : ed.addClass("hide-edge-label"));
      });

      document.getElementById("nodeColorPicker").addEventListener("input", e => {
        this.cy.nodes().style({ "background-color": e.target.value, "border-color": e.target.value });
      });
      document.getElementById("resetNodeColors").addEventListener("click", () => {
        this.cy.nodes().style({
          "background-color": el => CONFIG.nodeColors[el.data("type")] || CONFIG.nodeColors.default,
          "border-color": el => CONFIG.nodeColors[el.data("type")] || CONFIG.nodeColors.default,
        });
      });
      document.getElementById("bgColorPicker").addEventListener("input", e => {
        document.documentElement.style.setProperty("--page-bg", e.target.value);
      });
      document.getElementById("edgeColorPicker").addEventListener("input", e => {
        CONFIG.edgeColor = e.target.value;
        this.cy.edges().style({ "line-color": CONFIG.edgeColor });
      });
      document.getElementById("resetColors").addEventListener("click", () => {
        document.documentElement.style.setProperty("--page-bg", "#5050a0");
        this.cy.nodes().style({
          "background-color": el => CONFIG.nodeColors[el.data("type")] || CONFIG.nodeColors.default,
          "border-color": el => CONFIG.nodeColors[el.data("type")] || CONFIG.nodeColors.default,
        });
        this.cy.edges().style({ "line-color": CONFIG.edgeColor });
      });

      this._wireUpSaveButton();
      document.getElementById("restoreBackup").addEventListener("click", async () => {
        if (!confirm("Restore moveset.json from the last backup?")) return;
        try {
          const r = await fetch("/moveset/restore", { method: "POST" });
          if (!r.ok) throw new Error("Failed");
          window.location.reload();
        } catch (e) { alert("Error: " + e.message); }
      });

      this._setupSidebar();
      this._setupImageUpload();
      this._buildSearchIndex();
      this._setupSearch();

      this.cy.on("layoutstop", () => this.styleManager.detectOverlappingEdges());
      this.cy.on("dragfree", "node", () => this.styleManager.detectOverlappingEdges());

      document.addEventListener("keydown", e => { if (e.key === "Escape") this._closeSidebar(); });
    } catch (err) { console.error("Init failed:", err); }
  }

  async _fetchMovesetData() {
    const r = await fetch("/moveset");
    if (!r.ok) throw new Error(`Failed to fetch: ${r.status}`);
    return await r.json();
  }

  _wireUpSaveButton() {
    const btn = document.getElementById("savePositions");
    const status = document.getElementById("saveStatus");
    if (!btn || !status) return;
    btn.addEventListener("click", async () => {
      btn.disabled = true; status.textContent = "Saving…";
      try {
        const result = await this.savePositions();
        status.textContent = `Saved ${result.saved} / ${result.total} nodes`;
        setTimeout(() => { status.textContent = ""; }, 3000);
      } catch (err) {
        console.error(err); status.textContent = `Save failed: ${err.message}`;
      } finally { btn.disabled = false; }
    });
  }

  _setupSidebar() {
    this.sidebar = document.getElementById("sidebar");
    this.graphContainer = document.getElementById("graph-container");
    this.sbTitle = document.getElementById("sb-title");
    this.sbType = document.getElementById("sb-type");
    this.sbNotes = document.getElementById("sb-notes");
    this.sbConnections = document.getElementById("sb-connections");
    this.btnSave = document.getElementById("sb-save");
    this.btnDelete = document.getElementById("sb-delete");
    this.activeNode = null;
    this.activeConnections = [];

    this.sbTitle.addEventListener("input", () => {
      this.btnSave.disabled = !this.sbTitle.value.trim();
    });

    this.cy.on("dragfree", "node", evt => {
      const n = evt.target;
      n.data("x", n.position("x")); n.data("y", n.position("y"));
    });

    document.getElementById("sb-close").addEventListener("click", () => this._closeSidebar());

    // Resize handle
    const rh = document.getElementById("sb-resize-handle");
    let resizing = false, sx, sw;
    rh.addEventListener("mousedown", e => {
      resizing = true; sx = e.clientX;
      sw = parseInt(document.defaultView.getComputedStyle(this.sidebar).width, 10);
      this.sidebar.classList.add("resizing"); rh.classList.add("dragging");
      document.body.style.cursor = "col-resize";
    });
    document.addEventListener("mousemove", e => {
      if (!resizing) return;
      let nw = Math.max(320, Math.min(800, sw + (sx - e.clientX)));
      document.documentElement.style.setProperty("--sidebar-width", `${nw}px`);
    });
    document.addEventListener("mouseup", () => {
      if (!resizing) return;
      resizing = false; this.sidebar.classList.remove("resizing");
      rh.classList.remove("dragging"); document.body.style.cursor = "default";
      this.cy.resize();
    });

    this.btnSave.addEventListener("click", async () => {
      this._syncConnectionsFromDOM();
      const newTitle = this.sbTitle.value.trim();
      if (!newTitle) return alert("Title is required");
      const type = this.sbType.value;
      const area = Array.from(document.querySelectorAll(".sb-area-cb:checked")).map(cb => cb.value);
      const notes = this.sbNotes.value;
      const isNew = !this.activeNode;
      const nodeId = isNew ? newTitle : this.activeNode.id();
      const otherMoves = this.allMoves.filter(m => !m.from.includes(nodeId) && !m.to.includes(nodeId));
      const finalMoves = [...otherMoves, ...this.activeConnections];

      try {
        this.btnSave.textContent = "Saving..."; this.btnSave.disabled = true;
        const url = isNew ? "/moveset/node" : `/moveset/node/${encodeURIComponent(nodeId)}`;
        const method = isNew ? "POST" : "PUT";
        const resp = await fetch(url, {
          method, headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: newTitle,
            type,
            area,
            notes,
            stub: isNew ? true : !!(this.activeNode && this.activeNode.data("stub")),
            moves: finalMoves
          })
        });
        if (!resp.ok) { const e = await resp.json(); throw new Error(e.detail || "Failed"); }

        // Upload the pending image (new-node only)
        if (isNew && this.pendingImage) {
          try {
            const formData = new FormData();
            formData.append('file', this.pendingImage);
            await fetch(`/moveset/node/${encodeURIComponent(newTitle)}/image`, {
              method: 'POST',
              body: formData,
            });
          } catch (e) {
            console.warn('Image upload failed:', e);
          }
          this.pendingImage = null;
        }

        this._closeSidebar();

        const pan = { ...this.cy.pan() };
        const zoom = this.cy.zoom();
        const moveset = await this._fetchMovesetData();
        this.allMoves = moveset.moves || [];
        const elements = GraphDataProcessor.processMovesetData(moveset);
        this._syncGraph(elements);
        this.cy.style().update();
        this.styleManager.detectOverlappingEdges();
        this.cy.pan(pan);
        this.cy.zoom(zoom);
      } catch (e) {
        alert("Error saving: " + e.message);
      } finally {
        this.btnSave.textContent = isNew ? "Create Node" : "Save Node";
        this.btnSave.disabled = !this.sbTitle.value.trim();
      }
    });

    this.btnDelete.addEventListener("click", async () => {
      if (!this.activeNode) return;
      const nodeId = this.activeNode.id();
      if (!confirm(`Delete node "${nodeId}"?`)) return;
      try {
        this.btnDelete.textContent = "Deleting..."; this.btnDelete.disabled = true;
        const r = await fetch(`/moveset/node/${encodeURIComponent(nodeId)}`, { method: "DELETE" });
        if (!r.ok) throw new Error("Failed");

        // Trim local allMoves the same way the backend does
        this.allMoves = this.allMoves
          .map(m => ({
            ...m,
            from: (m.from || []).filter(x => x !== nodeId),
            to: (m.to || []).filter(x => x !== nodeId),
          }))
          .filter(m => m.from.length > 0 && m.to.length > 0);

        // Suppress selection-change handler so the sidebar doesn't reopen to "Create Node"
        this._isClosingSidebar = true;
        this.cy.elements().unselect();
        this.cy.remove(this.activeNode.connectedEdges());
        this.cy.remove(this.activeNode);
        this._buildSearchIndex();
        this._closeSidebar();
      } catch (e) { alert("Error: " + e.message); }
      finally { this.btnDelete.textContent = "Delete Node"; this.btnDelete.disabled = false; }
    });
  }

  _syncGraph(elements) {
    const newNodes = {}, newEdges = {};
    elements.forEach(e => { if (e.data.source) newEdges[e.data.id] = e; else newNodes[e.data.id] = e; });

    this.cy.batch(() => {
      // Remove deleted elements
      this.cy.nodes().forEach(n => { if (!newNodes[n.id()]) n.remove(); });
      this.cy.edges().forEach(e => { if (!newEdges[e.id()]) e.remove(); });

      // Add / update nodes
      Object.values(newNodes).forEach(n => {
        const existing = this.cy.getElementById(n.data.id);
        if (existing.length > 0) {
          // Preserve the node's current visual position AND sync data.x/y to match.
          // The backend's stored x/y may be stale if the user dragged without saving positions.
          const pos = { x: existing.position("x"), y: existing.position("y") };
          existing.data(n.data);
          existing.position(pos);
          existing.data("x", pos.x);
          existing.data("y", pos.y);
        } else {
          // Brand-new node: use backend-provided position
          this.cy.add(n);
          const added = this.cy.getElementById(n.data.id);
          if (added.length > 0 && n.data.x != null && n.data.y != null) {
            added.position({ x: n.data.x, y: n.data.y });
          }
        }
      });

      // Add / update edges
      Object.values(newEdges).forEach(e => {
        const existing = this.cy.getElementById(e.data.id);
        if (existing.length > 0) existing.data(e.data);
        else this.cy.add(e);
      });
    });

    this._buildSearchIndex();
  }

  _renderConnections() {
    this.sbConnections.innerHTML = "";
    const currentId = this.activeNode ? this.activeNode.id() : this.sbTitle.value.trim();
    const outgoing = this.activeConnections.filter(m => currentId && m.from.includes(currentId));
    const incoming = this.activeConnections.filter(m => currentId && !m.from.includes(currentId) && m.to.includes(currentId));

    const createGroup = (title, items, isOutgoing) => {
      const group = document.createElement("div");
      group.className = "conn-group";
      const header = document.createElement("h4");
      header.style.cssText = "display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;color:var(--accent)";
      const titleSpan = document.createElement("span");
      titleSpan.textContent = title;
      const addBtn = document.createElement("button");
      addBtn.className = "btn small";
      addBtn.style.cssText = "background:var(--accent);color:#fff";
      addBtn.textContent = "+ Add";
      addBtn.addEventListener("click", () => this._addConnection(isOutgoing ? 'outgoing' : 'incoming'));
      header.appendChild(titleSpan); header.appendChild(addBtn);
      group.appendChild(header);
      items.forEach(m => group.appendChild(this._createConnRow(m, isOutgoing)));
      this.sbConnections.appendChild(group);
    };
    createGroup("Outgoing", outgoing, true);
    createGroup("Incoming", incoming, false);
  }

  _addConnection(direction) {
    this._syncConnectionsFromDOM();
    const fromNode = this.activeNode ? this.activeNode.id() : (this.sbTitle.value.trim() || "New Node");
    const newConn = direction === 'outgoing'
      ? { name: "", type: "Transition", from: [fromNode], to: [], _isNew: true }
      : { name: "", type: "Transition", from: [], to: [fromNode], _isNew: true };
    this.activeConnections.push(newConn);
    this._renderConnections();
    setTimeout(() => {
      const row = this.sbConnections.querySelector(".flash-new");
      if (row) row.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);
  }

  _createConnRow(m, isOutgoing) {
    const row = document.createElement("div");
    row.className = "connection-row";
    if (m._isNew) { row.classList.add("flash-new"); delete m._isNew; }
    const arrowIcon = isOutgoing ? "&rarr;" : "&larr;";

    const rowIO = isOutgoing ? `
      <div class="row-io">
        <div><label>FROM</label><input type="text" class="conn-from" value="${m.from.join(', ')}" placeholder="e.g. Mount"></div>
        <span class="arrow" title="Swap Direction">${arrowIcon}</span>
        <div><label>TO</label><input type="text" class="conn-to" value="${m.to.join(', ')}" placeholder="e.g. Mount"></div>
      </div>
    ` : `
      <div class="row-io">
        <div><label>TO</label><input type="text" class="conn-to" value="${m.to.join(', ')}" placeholder="e.g. Mount"></div>
        <span class="arrow" title="Swap Direction">${arrowIcon}</span>
        <div><label>FROM</label><input type="text" class="conn-from" value="${m.from.join(', ')}" placeholder="e.g. Mount"></div>
      </div>
    `;

    row.innerHTML = `
      <div class="row-header">
        <input type="text" class="conn-name" placeholder="Unnamed" value="${m.name || ''}">
        <select class="conn-type">
          ${['Transition', 'Finish', 'Escape', 'Takedown', 'Sweep', 'Pass', 'Imposition'].map(t => `<option value="${t}" ${m.type === t ? 'selected' : ''}>${t}</option>`).join('')}
        </select>
        <button class="delete-conn" title="Delete">&times;</button>
      </div>
      ${rowIO}
    `;
    row.querySelector(".delete-conn").addEventListener("click", () => {
      row.remove(); this._syncConnectionsFromDOM(); this._renderConnections();
    });
    row.querySelector(".arrow").addEventListener("click", () => {
      const f = row.querySelector(".conn-from"), t = row.querySelector(".conn-to");
      const temp = f.value; f.value = t.value; t.value = temp;
      this._syncConnectionsFromDOM(); this._renderConnections();
    });
    return row;
  }

  _syncConnectionsFromDOM() {
    const rows = this.sbConnections.querySelectorAll(".connection-row");
    const updated = [];
    rows.forEach(row => {
      const name = row.querySelector(".conn-name").value.trim();
      const mtype = row.querySelector(".conn-type").value;
      const fs = row.querySelector(".conn-from").value.trim();
      const ts = row.querySelector(".conn-to").value.trim();
      const from = fs ? fs.split(",").map(s => s.trim()).filter(Boolean) : [];
      const to = ts ? ts.split(",").map(s => s.trim()).filter(Boolean) : [];
      if (from.length || to.length) updated.push({ name: name || undefined, type: mtype, from, to });
    });
    this.activeConnections = updated;
  }

  _handleSelectionChange() {
    if (this._isClosingSidebar) return;
    if (this.currentTab === 'search') {
      this.currentTab = 'edit';
      document.getElementById("tab-edit").classList.add("active");
      document.getElementById("tab-search").classList.remove("active");
      this.sidebar.classList.remove("search-mode");
      document.getElementById("sb-search-content").style.display = "none";
    }
    const sel = this.cy.nodes(":selected");
    if (sel.length > 1) this._showMultiSelect(sel);
    else if (sel.length === 1) this._openSidebar(sel[0]);
    else this._openSidebar(null);
  }

  _showMultiSelect(nodes) {
    this.activeNode = null;
    document.getElementById("sb-single-content").style.display = "none";
    document.getElementById("sb-search-content").style.display = "none";
    document.getElementById("sb-multi-select").style.display = "block";
    const list = document.getElementById("sb-multi-list");
    list.innerHTML = "";
    nodes.forEach(n => {
      const li = document.createElement("li");
      li.textContent = n.id();
      li.addEventListener("click", () => { this.cy.elements().unselect(); n.select(); });
      list.appendChild(li);
    });
    document.getElementById("sb-name").textContent = "Multiple Selected";
    this.sidebar.classList.add("open");
    this.graphContainer.classList.add("sidebar-open");
    requestAnimationFrame(() => this.cy.resize());
  }

  _setImage(kind, src, bust = false) {
    const vpId = kind === 'search' ? 'sb-search-image-viewport' : 'sb-image-viewport';
    const imgId = kind === 'search' ? 'sb-search-image' : 'sb-image';
    const vp = document.getElementById(vpId);
    const img = document.getElementById(imgId);
    if (!vp || !img) return;

    if (!src) {
      vp.classList.remove('has-image');
      img.removeAttribute('src');
      return;
    }
    const finalSrc = bust ? `${src}${src.includes('?') ? '&' : '?'}v=${Date.now()}` : src;
    if (img.getAttribute('src') === finalSrc) return;
    img.onload = () => vp.classList.add('has-image');
    img.onerror = () => vp.classList.remove('has-image');
    img.src = finalSrc;
  }

  _showSearchImageForResult(id, context) {
    let imgSrc = null;
    if (id) {
      if (context === "Node") {
        const n = this.cy.getElementById(id);
        if (n.length) imgSrc = n.data("image");
      } else {
        const ed = this.cy.getElementById(id);
        if (ed.length) imgSrc = ed.source().data("image");
      }
    }
    this._setImage('search', imgSrc);
  }

  _buildSearchIndex() {
    this.searchIndex = [];
    const seen = new Set();
    this.cy.nodes().forEach(n => {
      const k = `node::${n.id()}`;
      if (!seen.has(k)) { this.searchIndex.push({ id: n.id(), text: n.id(), context: "Node" }); seen.add(k); }
    });
    this.cy.edges().forEach(e => {
      const label = e.data("label");
      if (label) {
        const k = `edge::${label}`;
        if (!seen.has(k)) { this.searchIndex.push({ id: e.id(), text: label, context: "Edge" }); seen.add(k); }
      }
    });
  }

  _setupImageUpload() {
    const vp = document.getElementById('sb-image-viewport');
    if (!vp) return;

    const handleFile = async (file) => {
      if (!file || !file.type.startsWith('image/')) {
        alert('Please choose an image file.');
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        alert('Image is too large (max 10MB).');
        return;
      }

      // New-node mode: stage the file locally and preview it
      if (!this.activeNode) {
        this.pendingImage = file;
        const img = document.getElementById('sb-image');
        img.onload = () => vp.classList.add('has-image');
        img.src = URL.createObjectURL(file);
        return;
      }

      // Existing node: upload immediately
      const nodeId = this.activeNode.id();
      const formData = new FormData();
      formData.append('file', file);

      vp.classList.add('uploading');
      try {
        const resp = await fetch(`/moveset/node/${encodeURIComponent(nodeId)}/image`, {
          method: 'POST',
          body: formData,
        });
        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}));
          throw new Error(err.detail || 'Upload failed');
        }
        const { image } = await resp.json();

        this.activeNode.data('image', image);
        this.cy.getElementById(nodeId).data('image', image);
        this._setImage('inspector', image, true); // bust to show the new bytes
      } catch (e) {
        alert('Upload failed: ' + e.message);
      } finally {
        vp.classList.remove('uploading', 'drag-over');
      }
    };

    vp.addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.addEventListener('change', e => {
        if (e.target.files && e.target.files[0]) handleFile(e.target.files[0]);
      });
      input.click();
    });

    vp.addEventListener('dragover', e => {
      e.preventDefault();
      vp.classList.add('drag-over');
    });
    vp.addEventListener('dragleave', () => vp.classList.remove('drag-over'));
    vp.addEventListener('drop', e => {
      e.preventDefault();
      vp.classList.remove('drag-over');
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        handleFile(e.dataTransfer.files[0]);
      }
    });
  }

  _setupSearch() {
    this.searchInput = document.getElementById("sb-search-input");
    this.searchResults = document.getElementById("sb-search-results");

    const switchTab = tab => {
      this.currentTab = tab;
      document.getElementById("tab-edit").classList.toggle("active", tab === 'edit');
      document.getElementById("tab-search").classList.toggle("active", tab === 'search');
      this.sidebar.classList.toggle("search-mode", tab === 'search');
      if (tab === 'search') {
        document.getElementById("sb-single-content").style.display = "none";
        document.getElementById("sb-multi-select").style.display = "none";
        document.getElementById("sb-search-content").style.display = "block";
        this.searchInput.focus();
      } else {
        document.getElementById("sb-search-content").style.display = "none";
        this._setImage('search', null);
        this._handleSelectionChange();
      }
    };
    document.getElementById("tab-edit").addEventListener("click", () => switchTab('edit'));
    document.getElementById("tab-search").addEventListener("click", () => switchTab('search'));

    this.searchInput.addEventListener("input", e => {
      const q = e.target.value.trim().toLowerCase();
      this.searchResults.innerHTML = "";
      if (!q) {
        this._setImage('search', null);
        return;
      }
      const results = this.searchIndex
        .filter(i => i.text.toLowerCase().includes(q))
        .sort((a, b) => {
          const at = a.text.toLowerCase(), bt = b.text.toLowerCase();
          if (at === q) return -1; if (bt === q) return 1;
          if (at.startsWith(q) && !bt.startsWith(q)) return -1;
          if (bt.startsWith(q) && !at.startsWith(q)) return 1;
          return 0;
        }).slice(0, 4);
      if (!results.length) {
        this.searchResults.innerHTML = "<li>No results</li>";
        this._setImage('search', null);
        return;
      }
      results.forEach(r => {
        const li = document.createElement("li");
        li.dataset.id = r.id;
        li.dataset.context = r.context;
        li.innerHTML = `<span>${r.text}</span><span class="context-tag">${r.context}</span>`;
        li.addEventListener("click", () => this._handleSearchSelect(r.id));
        this.searchResults.appendChild(li);
      });

      if (results.length) {
        this._showSearchImageForResult(results[0].id, results[0].context);
      } else {
        this._setImage('search', null);
      }
    });

    this.searchInput.addEventListener("keydown", e => {
      const items = this.searchResults.querySelectorAll("li");
      if (!items.length) return;
      if (e.key === "Tab") {
        e.preventDefault();
        const cur = Array.from(items).findIndex(li => li.classList.contains("active"));
        let next = (cur + (e.shiftKey ? -1 : 1)) % items.length;
        if (cur === -1 && e.shiftKey) next = items.length - 1;
        items.forEach(li => li.classList.remove("active"));
        items[next].classList.add("active");
        items[next].scrollIntoView({ block: 'nearest' });
        this._showSearchImageForResult(items[next].dataset.id, items[next].dataset.context);
      } else if (e.key === "Enter") {
        e.preventDefault();
        const active = this.searchResults.querySelector("li.active") || items[0];
        if (active) active.click();
      }
    });
  }

  _handleSearchSelect(id) {
    const ele = this.cy.getElementById(id);
    if (!ele || ele.length === 0) return;
    this.searchInput.value = ""; this.searchResults.innerHTML = "";
    this.cy.elements().unselect();
    let target;
    if (ele.isNode()) { target = ele.union(ele.connectedEdges()).union(ele.neighborhood()); ele.select(); }
    else if (ele.isEdge()) { target = ele.union(ele.source()).union(ele.target()); ele.source().select(); }
    this.cy.animate({ fit: { eles: target, padding: 120 }, duration: 600, easing: "ease-in-out" });
    if (!this.sidebar.classList.contains("open")) {
      this.sidebar.classList.add("open"); this.graphContainer.classList.add("sidebar-open");
      requestAnimationFrame(() => this.cy.resize());
    }
    document.getElementById("tab-edit").click();
  }

  _openSidebar(node) {
    const wasOpen = this.sidebar.classList.contains("open");
    this.activeNode = node;
    this.pendingImage = null;

    this.currentTab = 'edit';
    document.getElementById("tab-edit").classList.add("active");
    document.getElementById("tab-search").classList.remove("active");
    this.sidebar.classList.remove("search-mode");
    document.getElementById("sb-search-content").style.display = "none";
    if (this.searchInput) this.searchInput.value = "";
    if (this.searchResults) this.searchResults.innerHTML = "";

    document.getElementById("sb-single-content").style.display = "block";
    document.getElementById("sb-multi-select").style.display = "none";

    const sbName = document.getElementById("sb-name");
    if (sbName) sbName.textContent = node ? node.id() : "Create Node";

    const tabEdit = document.getElementById("tab-edit");
    tabEdit.textContent = node ? "Inspector" : "New Node";

    if (node) {
      this.sbTitle.value = node.id();
      this.sbType.value = node.data("type") || "Control";
      const area = node.data("area") || [];
      document.querySelectorAll(".sb-area-cb").forEach(cb => cb.checked = area.includes(cb.value));
      this.sbNotes.value = node.data("notes") || "";
      this.btnDelete.style.display = "block";
      this.btnSave.textContent = "Save Node";
      this.activeConnections = this.allMoves.filter(m => m.from.includes(node.id()) || m.to.includes(node.id()))
        .map(m => JSON.parse(JSON.stringify(m)));
    } else {
      this.sbTitle.value = "";
      this.sbType.value = "Control";
      document.querySelectorAll(".sb-area-cb").forEach(cb => cb.checked = false);
      this.sbNotes.value = "";
      this.btnDelete.style.display = "none";
      this.btnSave.textContent = "Create Node";
      this.activeConnections = [];
    }

    this._renderConnections();
    this._setImage('inspector', node ? node.data('image') : null);
    this.sidebar.classList.add("open");
    this.graphContainer.classList.add("sidebar-open");
    if (!wasOpen) requestAnimationFrame(() => this.cy.resize());

    this.btnSave.disabled = !this.sbTitle.value.trim();
  }

  _closeSidebar() {
    const wasOpen = this.sidebar.classList.contains("open");
    this._isClosingSidebar = true;
    this.sidebar.classList.remove("open");
    this.graphContainer.classList.remove("sidebar-open");
    this.activeNode = null;
    const sbName = document.getElementById("sb-name");
    if (sbName) sbName.textContent = "Node Inspector";
    this.cy.elements().unselect();
    if (wasOpen) requestAnimationFrame(() => this.cy.resize());
    setTimeout(() => { this._isClosingSidebar = false; }, 150);
  }

  async savePositions() {
    const positions = {};
    this.cy.nodes().forEach(n => { const p = n.position(); positions[n.id()] = { x: p.x, y: p.y }; });
    const r = await fetch("/moveset/positions", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ positions }),
    });
    if (!r.ok) { const text = await r.text(); throw new Error(`${r.status} — ${text.slice(0, 200)}`); }
    this.cy.nodes().forEach(n => { n.data("x", n.position("x")); n.data("y", n.position("y")); });
    return await r.json();
  }
}

async function loadGraph() {
  const graph = new Graph("cy", "layoutMode", "edgeStyleMode");
  await graph.initialize();
}
loadGraph();
