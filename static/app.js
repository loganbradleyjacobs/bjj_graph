const CONFIG = {
  edgeColor: "#AAFDE9",
  maxEdgeWidth: 3,
  nodeColors: {
    Guard: "#1f77b4",
    Pass: "#ff7f0e",
    Submission: "#d62728",
    Takedown: "#DEB887",
    Control: "#379a1c",
    default: "#888"
  },
  debug: true,
  defaultTreeDepth: 4,
  persistedTreeRootKey: "bjj-tree-root"
};

let expandedTreeInstanceKeysRef = new Set();

function listToString(list) {
  if (!list) return "";
  if (Array.isArray(list)) return list.join(", ");
  if (typeof list === "object") return Object.keys(list).join(", ");
  return String(list);
}

function defaultGifForEdge(parent, child) {
  const safe = (value) => value.replace(/\s+/g, "_").toLowerCase();
  return `/static/gifs/${safe(child)}__${safe(parent)}.gif`;
}

function getNeighbors(nodeId, direction, moveset) {
  if (direction === "forward") {
    return Object.keys(moveset[nodeId]?.children || {});
  } else {
    return moveset[nodeId]?.parents || [];
  }
}

function isOnActivePath(node, activeInstanceKey) {
  if (!activeInstanceKey) return false;
  return activeInstanceKey.startsWith(node.instanceKey);
}

function buildTree({
  rootId,
  moveset,
  direction,
  maxDepth = CONFIG.defaultTreeDepth
}) {
  function buildNode(nodeId, path, depth, parentKey) {
    const newPath = [...path, nodeId];
    const instanceKey = newPath.join(" > ");

    const firstIndex = path.indexOf(nodeId);
    const isRepeated = firstIndex !== -1;

    const node = {
      instanceKey,
      positionId: nodeId,
      label: nodeId,
      depth,
      path: newPath,
      isRepeated,
      repeatedFromIndex: isRepeated ? firstIndex : null,
      isTruncated: false,
      children: [],
      parentInstanceKey: parentKey
    };

    if (isRepeated) {
      node.isTruncated = true;
      return node;
    }

    const isExpanded = expandedTreeInstanceKeysRef.has(instanceKey);
    if (depth >= maxDepth && !isExpanded) {
      node.isTruncated = true;
      return node;
    }

    const neighbors = getNeighbors(nodeId, direction, moveset);
    node.children = neighbors.map((childId) =>
      buildNode(childId, newPath, depth + 1, instanceKey)
    );

    return node;
  }

  return buildNode(rootId, [], 0, null);
}

class GraphDataProcessor {
  static processMovesetData(moveset) {
    const elements = [];

    Object.keys(moveset).forEach((key) => {
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
          image:
            move.image ||
            `/static/images/${key.replace(/\s+/g, "_").toLowerCase()}.png`,
          video: move.video
        }
      });
    });

    Object.keys(moveset).forEach((parent) => {
      const move = moveset[parent];
      const children = move.children;

      if (!children) {
        return;
      }

      if (Array.isArray(children)) {
        children.forEach((child) => {
          if (!moveset[child]) {
            return;
          }

          elements.push({
            data: {
              source: parent,
              target: child,
              gifs: [defaultGifForEdge(parent, child)]
            }
          });
        });
        return;
      }

      Object.entries(children).forEach(([child, meta]) => {
        if (!moveset[child]) {
          return;
        }

        elements.push({
          data: {
            source: parent,
            target: child,
            gifs: meta.gifs?.length ? meta.gifs : [defaultGifForEdge(parent, child)]
          }
        });
      });
    });

    return elements;
  }
}

class GraphStyleManager {
  constructor(cy) {
    this.cy = cy;
  }

  getBaseStyles() {
    return [
      {
        selector: "node",
        style: this.getNodeStyles()
      },
      {
        selector: "node.debug-hide-label",
        style: {
          label: ""
        }
      },
      {
        selector: "edge",
        style: this.getEdgeStyles()
      }
    ];
  }

  getNodeStyles() {
    return {
      label: (ele) => ele.data("label"),
      "font-size": (ele) => ele.width() * 0.2,
      color: "#fff",
      "text-valign": "center",
      "text-halign": "center",
      "text-wrap": "wrap",
      "text-max-width": "50%",
      width: (ele) => this.calculateNodeWidth(ele),
      height: (ele) => ele.width(),
      "background-color": (ele) =>
        CONFIG.nodeColors[ele.data("type")] || CONFIG.nodeColors.default,
      shape: "ellipse",
      "background-image": (ele) => ele.data("image") || null,
      "background-fit": "cover",
      "background-clip": "node",
      "background-width": "30%",
      "background-height": "30%",
      "border-width": 4,
      "border-color": (ele) =>
        CONFIG.nodeColors[ele.data("type")] || CONFIG.nodeColors.default
    };
  }

  getEdgeStyles() {
    return {
      width: 2,
      "line-color": CONFIG.edgeColor,
      "target-arrow-color": CONFIG.edgeColor,
      "target-arrow-shape": "triangle",
      "arrow-scale": 2,
      "curve-style": "straight"
    };
  }

  calculateNodeWidth(ele) {
    const children = ele.data("children");
    const childCount = Array.isArray(children)
      ? children.length
      : children
        ? Object.keys(children).length
        : 0;

    const parentCount = ele.data("parents")?.length || 0;
    return 30 + (childCount + parentCount) * 5;
  }

  updateEdgeWidths() {
    const zoom = this.cy.zoom();
    const width = Math.min(CONFIG.maxEdgeWidth, CONFIG.maxEdgeWidth / zoom);
    const arrowScale = Math.min(1, width);

    this.cy.batch(() => {
      this.cy.edges().forEach((edge) => {
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
    this.cy.nodes().forEach((node) => {
      const width = node.width();
      node.style({
        "font-size": Math.max(4, Math.min(width * 0.2, 16 / zoom))
      });
    });
  }
}

class GraphLayoutManager {
  constructor(cy) {
    this.cy = cy;
  }

  runLayout(mode) {
    if (mode === "concentric") {
      this.applyConcentricLayout();
      return;
    }

    this.applyConcentricLayout();

    if (mode === "dagre") {
      this.applyDagreLayout();
    } else {
      this.applyColaLayout();
    }
  }

  applyConcentricLayout() {
    this.cy.layout({
      name: "concentric",
      concentric: (n) => n.degree(),
      levelWidth: () => 1,
      padding: 50
    }).run();
  }

  applyDagreLayout() {
    this.cy.layout({
      name: "dagre",
      rankDir: "TB",
      rankSep: 50,
      nodeSep: 30,
      edgeSep: 10,
      fit: true,
      padding: 20
    }).run();
  }

  applyColaLayout() {
    this.cy.layout({
      name: "cola",
      animate: true,
      randomize: false,
      maxSimulationTime: 3000,
      fit: true,
      padding: 20,
      nodeSpacing: () => 20,
      avoidOverlap: true
    }).run();
  }
}

class GraphTooltipManager {
  constructor(cy) {
    this.cy = cy;
    this.tooltip = this.createTooltip();
    this.setupEventListeners();
  }

  createTooltip() {
    const tooltip = document.createElement("div");
    tooltip.className = "tooltip";
    tooltip.style.display = "none";
    document.body.appendChild(tooltip);
    return tooltip;
  }

  setupEventListeners() {
    this.cy.on("mouseover", "node", (evt) => this.showTooltip(evt));
    this.cy.on("mousemove", (evt) => this.moveTooltip(evt));
    this.cy.on("mouseout", "node", () => this.hideTooltip());
    this.cy.on("tap", "node", (evt) => {
      if (CONFIG.debug) {
        console.log(`Data for clicked node: ${evt.target.id()}`, evt.target.data());
      }
    });
  }

  showTooltip(evt) {
    const node = evt.target;
    let childrenHtml = "";
    const children = node.data("children");

    if (children) {
      const childIds = Array.isArray(children) ? children : Object.keys(children);
      childIds.forEach((childId) => {
        const edge = this.cy.edges(`[source = "${node.id()}"][target = "${childId}"]`)[0];
        let gifs = edge?.data("gifs");
        if (!gifs) {
          gifs = ["/static/images/placeholder.png"];
        } else if (!Array.isArray(gifs)) {
          gifs = [gifs];
        }

        childrenHtml += `
          <div style="display:flex; align-items:center; margin-bottom:4px;">
            <span style="margin-right:8px;">${childId}</span>
            <img src="${gifs[0]}" alt="Edge GIF" width="60" style="border:1px solid #fff; border-radius:4px;" />
          </div>
        `;
      });
    } else {
      childrenHtml = "None";
    }

    this.tooltip.innerHTML = `
      <strong>${node.data("label")}</strong><br>
      Parents: ${listToString(node.data("parents"))}<br>
      Children:<br>${childrenHtml}
      Area: ${listToString(node.data("area"))}<br>
      Type: ${node.data("type")}<br>
      Image: <img src="${node.data("image") || ""}" width="60" /><br>
      Video: ${node.data("video") || "None"}
    `;
    this.tooltip.style.display = "block";
  }

  moveTooltip(evt) {
    this.tooltip.style.left = `${evt.originalEvent.pageX + 10}px`;
    this.tooltip.style.top = `${evt.originalEvent.pageY + 10}px`;
  }

  hideTooltip() {
    this.tooltip.style.display = "none";
  }
}

class SidebarManager {
  constructor(moveset) {
    this.moveset = moveset;
    this.sidebar = document.getElementById("node-sidebar");
    this.closeBtn = document.getElementById("closeSidebar");
    this.closeBtn.addEventListener("click", () => this.hide());
  }

  showPosition(positionId) {
    const data = this.moveset[positionId];
    if (!data) {
      return;
    }

    document.getElementById("sidebarLabel").textContent = positionId;
    document.getElementById("sidebarType").textContent = data.type || "";
    document.getElementById("sidebarVideo").href = data.video || "#";
    document.getElementById("sidebarImage").src =
      data.image || `/static/images/${positionId.replace(/\s+/g, "_").toLowerCase()}.png`;
    document.getElementById("sidebarParents").textContent = listToString(data.parents);
    document.getElementById("sidebarArea").textContent = listToString(data.area);

    const childrenContainer = document.getElementById("sidebarChildren");
    childrenContainer.innerHTML = "";

    const childIds = Array.isArray(data.children)
      ? data.children
      : Object.keys(data.children || {});
    if (!childIds.length) {
      childrenContainer.textContent = "None";
    } else {
      childIds.forEach((childId) => {
        const childRow = document.createElement("div");
        childRow.style.display = "flex";
        childRow.style.alignItems = "center";
        childRow.style.marginBottom = "4px";

        const childLabel = document.createElement("span");
        childLabel.textContent = childId;
        childLabel.style.marginRight = "8px";
        childRow.appendChild(childLabel);

        const meta = Array.isArray(data.children) ? {} : data.children[childId] || {};
        let gifs = meta.gifs;
        if (!gifs) {
          gifs = [defaultGifForEdge(positionId, childId)];
        } else if (!Array.isArray(gifs)) {
          gifs = [gifs];
        }

        const img = document.createElement("img");
        img.src = gifs[0];
        img.alt = "Edge GIF";
        img.width = 80;
        img.style.border = "1px solid #fff";
        img.style.borderRadius = "4px";
        childRow.appendChild(img);

        childrenContainer.appendChild(childRow);
      });
    }

    this.sidebar.classList.remove("hidden");
    this.sidebar.style.transform = "translateX(0)";
    this.sidebar.style.display = "block";
  }

  hide() {
    this.sidebar.classList.add("hidden");
    this.sidebar.style.transform = "translateX(-100%)";
  }
}

class GraphView {
  constructor({ containerId, layoutSelectId, edgeStyleSelectId, onNodeSelect }) {
    this.container = document.getElementById(containerId);
    this.layoutSelect = document.getElementById(layoutSelectId);
    this.edgeStyleSelect = document.getElementById(edgeStyleSelectId);
    this.onNodeSelect = onNodeSelect;
    this.cy = null;
    this.layoutManager = null;
    this.styleManager = null;
    this.tooltipManager = null;
  }

  initialize(moveset) {
    const elements = GraphDataProcessor.processMovesetData(moveset);

    this.cy = cytoscape({
      container: this.container,
      elements,
      style: [],
      layout: { name: "preset" }
    });

    this.styleManager = new GraphStyleManager(this.cy);
    this.cy.style().fromJson(this.styleManager.getBaseStyles()).update();
    this.layoutManager = new GraphLayoutManager(this.cy);
    this.tooltipManager = new GraphTooltipManager(this.cy);

    this.registerEventListeners();
    this.layoutManager.runLayout(this.layoutSelect.value);
    this.styleManager.updateEdgeWidths();
    this.styleManager.updateLabelSizing();
    this.styleManager.updateEdgeStyle(this.edgeStyleSelect.value);

    this.cy.userZoomingEnabled(true);
    this.cy.userPanningEnabled(true);
  }

  registerEventListeners() {
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
      const fractionOfViewport = 0.15;
      this.cy.animate({
        center: { eles: node },
        zoom: (this.cy.container().clientWidth * fractionOfViewport) / node.width(),
        duration: 300,
        easing: "ease-in-out"
      });
      this.onNodeSelect(node.id());
    });
  }

  resize() {
    if (!this.cy) {
      return;
    }
    this.cy.resize();
    this.cy.fit(undefined, 20);
  }

  setLabelsVisible(show) {
    this.cy.nodes().forEach((node) => {
      if (show) {
        node.removeClass("debug-hide-label");
      } else {
        node.addClass("debug-hide-label");
      }
    });
  }

  setNodeColor(color) {
    this.cy.nodes().style({
      "background-color": color,
      "border-color": color
    });
  }

  resetNodeColors() {
    this.cy.nodes().style({
      "background-color": (ele) =>
        CONFIG.nodeColors[ele.data("type")] || CONFIG.nodeColors.default,
      "border-color": (ele) =>
        CONFIG.nodeColors[ele.data("type")] || CONFIG.nodeColors.default
    });
  }

  setEdgeColor(color) {
    CONFIG.edgeColor = color;
    this.cy.edges().style({
      "line-color": CONFIG.edgeColor,
      "target-arrow-color": CONFIG.edgeColor
    });
  }
}

class TreeView {
  constructor({ containerId, onNodeSelect }) {
    this.container = document.getElementById(containerId);
    this.onNodeSelect = onNodeSelect;
    this.moveset = {};
    this.rootNode = null;
    this.activeInstanceKey = null;
    this.hoverInstanceKey = null;
    this.expandedTreeInstanceKeys = new Set();
    this.collapsedTreeInstanceKeys = new Set();
  }

  setMoveset(moveset) {
    this.moveset = moveset;
  }

  render({ rootId, direction, maxDepth }) {
    if (!rootId || !this.moveset[rootId]) {
      this.container.innerHTML = '<div class="tree-empty">No tree root selected.</div>';
      return;
    }

    expandedTreeInstanceKeysRef = this.expandedTreeInstanceKeys;
    this.rootNode = buildTree({
      rootId,
      moveset: this.moveset,
      direction,
      maxDepth
    });

    this.container.innerHTML = "";

    const shell = document.createElement("div");
    shell.className = "tree-shell";

    const header = document.createElement("div");
    header.className = "tree-header";

    const title = document.createElement("div");
    title.className = "tree-title";
    title.textContent = `${rootId} (${direction})`;

    const subtitle = document.createElement("div");
    subtitle.className = "tree-subtitle";
    subtitle.textContent = "Expand nodes to continue past the default depth limit.";

    header.appendChild(title);
    header.appendChild(subtitle);
    shell.appendChild(header);

    const rootElement = this.renderNode(this.rootNode, true);
    rootElement.classList.add("tree-root");
    shell.appendChild(rootElement);
    this.container.appendChild(shell);
  }

  renderNode(node, isRoot = false) {
    const wrapper = document.createElement("div");
    wrapper.className = "tree-node";
    if (isRoot) {
      wrapper.classList.add("tree-root");
    }

    const content = document.createElement("div");
    content.className = "tree-node-content";
    content.dataset.instanceKey = node.instanceKey;
    if (node.isRepeated) {
      content.classList.add("is-repeated");
    }
    if (isOnActivePath(node, this.hoverInstanceKey || this.activeInstanceKey)) {
      content.classList.add("path-active");
    }

    const toggleButton = document.createElement("button");
    toggleButton.className = "tree-toggle";

    const hasChildren = node.children.length > 0;
    const isCollapsed = this.collapsedTreeInstanceKeys.has(node.instanceKey);
    const canExpandDepth = node.isTruncated && !node.isRepeated;

    if (canExpandDepth) {
      toggleButton.textContent = "+";
      toggleButton.title = "Expand deeper";
      toggleButton.addEventListener("click", (evt) => {
        evt.stopPropagation();
        this.expandedTreeInstanceKeys.add(node.instanceKey);
        this.collapsedTreeInstanceKeys.delete(node.instanceKey);
        this.refresh();
      });
    } else if (hasChildren) {
      toggleButton.textContent = isCollapsed ? "+" : "−";
      toggleButton.title = isCollapsed ? "Expand branch" : "Collapse branch";
      toggleButton.addEventListener("click", (evt) => {
        evt.stopPropagation();
        if (isCollapsed) {
          this.collapsedTreeInstanceKeys.delete(node.instanceKey);
        } else {
          this.collapsedTreeInstanceKeys.add(node.instanceKey);
        }
        this.refresh();
      });
    } else {
      toggleButton.textContent = "•";
      toggleButton.disabled = true;
    }

    const main = document.createElement("div");
    main.className = "tree-node-main";
    main.addEventListener("mouseenter", () => {
      this.hoverInstanceKey = node.instanceKey;
      this.updateActivePathClasses();
    });
    main.addEventListener("mouseleave", () => {
      this.hoverInstanceKey = null;
      this.updateActivePathClasses();
    });
    main.addEventListener("click", () => {
      this.activeInstanceKey = node.instanceKey;
      this.onNodeSelect(node.positionId, node.instanceKey);
      this.updateActivePathClasses();
    });

    const label = document.createElement("div");
    label.className = "tree-label";
    if (node.isRepeated) {
      const repeatedLabel = node.path[node.repeatedFromIndex] || node.label;
      label.textContent = `↺ ${node.label} (seen above as ${repeatedLabel})`;
    } else {
      label.textContent = node.label;
    }

    const meta = document.createElement("div");
    meta.className = "tree-meta";
    meta.textContent = node.isTruncated
      ? node.isRepeated
        ? "Repeated in this branch"
        : "Depth-limited, expand for more"
      : `Depth ${node.depth}`;

    const path = document.createElement("div");
    path.className = "tree-path";
    path.textContent = node.instanceKey;

    main.appendChild(label);
    main.appendChild(meta);
    main.appendChild(path);

    content.appendChild(toggleButton);
    content.appendChild(main);
    wrapper.appendChild(content);

    if (hasChildren && !isCollapsed) {
      const childrenEl = document.createElement("div");
      childrenEl.className = "tree-children";
      node.children.forEach((child) => {
        childrenEl.appendChild(this.renderNode(child));
      });
      wrapper.appendChild(childrenEl);
    }

    return wrapper;
  }

  refresh() {
    if (!this.rootNode) {
      return;
    }
    const currentRoot = this.currentRootId;
    const currentDirection = this.currentDirection;
    const currentDepth = this.currentMaxDepth;
    this.render({
      rootId: currentRoot,
      direction: currentDirection,
      maxDepth: currentDepth
    });
  }

  updateConfig({ rootId, direction, maxDepth }) {
    this.currentRootId = rootId;
    this.currentDirection = direction;
    this.currentMaxDepth = maxDepth;
    this.render({ rootId, direction, maxDepth });
  }

  updateActivePathClasses() {
    const activeKey = this.hoverInstanceKey || this.activeInstanceKey;
    const nodes = this.container.querySelectorAll("[data-instance-key]");
    nodes.forEach((element) => {
      const instanceKey = element.dataset.instanceKey;
      const isActive = activeKey ? activeKey.startsWith(instanceKey) : false;
      element.classList.toggle("path-active", isActive);
    });
  }
}

class App {
  constructor() {
    this.moveset = {};
    this.nodeIds = [];
    this.state = {
      viewMode: "graph",
      currentPositionId: null,
      treeRootId: null,
      treeDirection: "forward"
    };

    this.elements = {
      cy: document.getElementById("cy"),
      treeContainer: document.getElementById("tree-container"),
      viewMode: document.getElementById("viewMode"),
      graphControls: document.getElementById("graph-controls"),
      treeControls: document.getElementById("tree-controls"),
      treeRootSelect: document.getElementById("treeRootSelect"),
      treeDirection: document.getElementById("treeDirection"),
      layoutMode: document.getElementById("layoutMode"),
      edgeStyleMode: document.getElementById("edgeStyleMode"),
      showLabelCheckbox: document.getElementById("showLabelCheckbox"),
      nodeColorPicker: document.getElementById("nodeColorPicker"),
      resetNodeColors: document.getElementById("resetNodeColors"),
      bgColorPicker: document.getElementById("bgColorPicker"),
      resetColors: document.getElementById("resetColors"),
      edgeColorPicker: document.getElementById("edgeColorPicker")
    };
  }

  async initialize() {
    this.moveset = await this.fetchMoveset();
    this.nodeIds = Object.keys(this.moveset);

    this.sidebarManager = new SidebarManager(this.moveset);
    this.graphView = new GraphView({
      containerId: "cy",
      layoutSelectId: "layoutMode",
      edgeStyleSelectId: "edgeStyleMode",
      onNodeSelect: (positionId) => this.handleGraphNodeSelect(positionId)
    });
    this.treeView = new TreeView({
      containerId: "tree-container",
      onNodeSelect: (positionId, instanceKey) =>
        this.handleTreeNodeSelect(positionId, instanceKey)
    });
    this.treeView.setMoveset(this.moveset);

    this.initializeState();
    this.populateTreeRootOptions();
    this.graphView.initialize(this.moveset);
    this.bindGlobalControls();
    this.syncControls();
    this.applyViewMode();
  }

  async fetchMoveset() {
    const response = await fetch("/moveset");
    if (!response.ok) {
      throw new Error(`Failed to fetch moveset: ${response.status}`);
    }
    return response.json();
  }

  initializeState() {
    const persistedRoot = localStorage.getItem(CONFIG.persistedTreeRootKey);
    const fallbackRoot = this.resolveDefaultRoot();
    this.state.treeRootId =
      persistedRoot && this.moveset[persistedRoot] ? persistedRoot : fallbackRoot;
    this.state.currentPositionId = this.state.treeRootId;
  }

  resolveDefaultRoot() {
    if (this.moveset.Standing) {
      return "Standing";
    }
    return this.nodeIds[0] || null;
  }

  persistTreeRoot(rootId) {
    if (!rootId) {
      return;
    }
    localStorage.setItem(CONFIG.persistedTreeRootKey, rootId);
  }

  populateTreeRootOptions() {
    this.elements.treeRootSelect.innerHTML = "";
    this.nodeIds.forEach((nodeId) => {
      const option = document.createElement("option");
      option.value = nodeId;
      option.textContent = nodeId;
      this.elements.treeRootSelect.appendChild(option);
    });
  }

  bindGlobalControls() {
    this.elements.viewMode.addEventListener("change", () => {
      this.state.viewMode = this.elements.viewMode.value;
      if (this.state.viewMode === "tree" && !this.state.treeRootId) {
        this.state.treeRootId = this.resolveDefaultRoot();
      }
      this.applyViewMode();
    });

    this.elements.treeRootSelect.addEventListener("change", () => {
      this.state.treeRootId = this.elements.treeRootSelect.value;
      this.persistTreeRoot(this.state.treeRootId);
      this.renderTree();
    });

    this.elements.treeDirection.addEventListener("change", () => {
      this.state.treeDirection = this.elements.treeDirection.value;
      this.treeView.expandedTreeInstanceKeys.clear();
      this.treeView.collapsedTreeInstanceKeys.clear();
      this.renderTree();
    });

    this.elements.showLabelCheckbox.addEventListener("change", () => {
      this.graphView.setLabelsVisible(this.elements.showLabelCheckbox.checked);
    });

    this.elements.nodeColorPicker.addEventListener("input", (evt) => {
      this.graphView.setNodeColor(evt.target.value);
    });

    this.elements.resetNodeColors.addEventListener("click", () => {
      this.graphView.resetNodeColors();
    });

    this.elements.bgColorPicker.addEventListener("input", (evt) => {
      document.documentElement.style.setProperty("--page-bg", evt.target.value);
    });

    this.elements.edgeColorPicker.addEventListener("input", (evt) => {
      this.graphView.setEdgeColor(evt.target.value);
    });

    this.elements.resetColors.addEventListener("click", () => {
      document.documentElement.style.setProperty("--page-bg", "#5050a0");
      this.graphView.resetNodeColors();
      this.graphView.setEdgeColor("#AAFDE9");
      this.elements.edgeColorPicker.value = "#AAFDE9";
      this.elements.bgColorPicker.value = "#5050a0";
    });
  }

  syncControls() {
    this.elements.viewMode.value = this.state.viewMode;
    if (this.state.treeRootId && this.moveset[this.state.treeRootId]) {
      this.elements.treeRootSelect.value = this.state.treeRootId;
    }
    this.elements.treeDirection.value = this.state.treeDirection;
  }

  handleGraphNodeSelect(positionId) {
    this.state.currentPositionId = positionId;
    this.state.treeRootId = positionId;
    this.persistTreeRoot(positionId);
    this.sidebarManager.showPosition(positionId);
    this.syncControls();

    if (this.state.viewMode === "tree") {
      this.treeView.activeInstanceKey = null;
      this.treeView.hoverInstanceKey = null;
      this.renderTree();
    }
  }

  handleTreeNodeSelect(positionId, instanceKey) {
    this.state.currentPositionId = positionId;
    this.treeView.activeInstanceKey = instanceKey;
    this.sidebarManager.showPosition(positionId);
  }

  applyViewMode() {
    const isTree = this.state.viewMode === "tree";
    this.elements.graphControls.classList.toggle("hidden", isTree);
    this.elements.treeControls.classList.toggle("hidden", !isTree);
    this.elements.graphControls.style.display = isTree ? "none" : "block";
    this.elements.treeControls.style.display = isTree ? "block" : "none";
    this.elements.cy.classList.toggle("hidden", isTree);
    this.elements.treeContainer.classList.toggle("hidden", !isTree);
    this.elements.cy.style.display = isTree ? "none" : "block";
    this.elements.treeContainer.style.display = isTree ? "block" : "none";

    this.syncControls();

    if (isTree) {
      this.renderTree();
    } else {
      this.graphView.resize();
    }
  }

  renderTree() {
    if (!this.state.treeRootId) {
      this.state.treeRootId = this.resolveDefaultRoot();
      this.persistTreeRoot(this.state.treeRootId);
      this.syncControls();
    }

    this.treeView.updateConfig({
      rootId: this.state.treeRootId,
      direction: this.state.treeDirection,
      maxDepth: CONFIG.defaultTreeDepth
    });
  }
}

async function loadGraph() {
  const app = new App();
  window.bjjGraphApp = app;
  try {
    await app.initialize();
  } catch (error) {
    console.error("Failed to initialize graph:", error);
  }
}

loadGraph();
