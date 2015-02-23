/**
 * Created by krause on 2014-09-29.
 */

function TypeView(pool, sel, sortDropdownSel) {
  var that = this;
  var totalHeight = Number.NaN;
  var totalWidth = 265;

  var typeSort = null;
  var dropdown = sortDropdownSel.append("select").classed("dropdown", true).on("change", function() {
    var dd = dropdown.node();
    var s = d3.select(dd.options[dd.selectedIndex]).datum();
    that.selectSort(s);
  });
  this.addSort = function(desc, sort) {
    var g = {
      desc: desc,
      sort: sort
    };
    dropdown.append("option").datum(g).text(g.desc);
    return g;
  };
  this.selectSort = function(s) {
    typeSort = s.sort;
    dropdown.selectAll("option").each(function(g, i) {
      if(g !== s) return;
      var tmpChg = dropdown.on("change");
      dropdown.on("change", null);
      dropdown.node().selectedIndex = i;
      dropdown.on("change", tmpChg);
    });
    that.updateLists();
  };

  var selectedTypes = {};
  pool.addSelectionListener(function(es, types, singleSlot, singleType) {
    selectedTypes = types;
    that.updateLists();
  });
  sel.style({
    "display": "inline-block",
    "padding": 0,
    "width": totalWidth + "px"
  });
  this.resize = function(allowedHeight, bodyPadding) {
    totalHeight = allowedHeight;
    sel.style({
      "position": "absolute",
      "top": bodyPadding + "px",
      "right": 10 + "px",
      "width": totalWidth + "px",
      "height": totalHeight + "px"
    });
    this.updateLists();
  };

  this.clearLists = function() {
    sel.selectAll("div.pType").remove();
  };

  var groupIx = 0;
  this.updateLists = function() {
    var groups = {};
    pool.traverseTypes(function(gid, tid, t) {
      if(!(gid in groups)) {
        groups[gid] = {
          desc: t.getRoot().getDesc(),
          types: []
        };
      }
      groups[gid].types.push(t);
    });

    var gKeys = Object.keys(groups).filter(function(_, ix) {
      return ix === groupIx;
    });
    var gCount = Object.keys(groups).length;

    function chgGroupIx(inc) {
      groupIx += inc ? 1 : -1;
      if(groupIx < 0) {
        groupIx = gCount - 1;
      }
      if(groupIx >= gCount) {
        groupIx = 0;
      }
      that.updateLists();
    }

    var pType = sel.selectAll("div.pType").data(gKeys, function(key) {
      return key;
    });
    pType.exit().remove();
    var pe = pType.enter().append("div").classed("pType", true);
    var head = pe.append("div").classed("pTypeHead", true);
    head.append("span").classed("pTypeLeft", true);
    head.append("span").classed("pTypeSpan", true);
    head.append("span").classed("pTypeRight", true);
    pe.append("div").classed("pTypeDiv", true);

    pType.selectAll("span.pTypeLeft").text("<").on("click", function() {
      chgGroupIx(false);
    }).style({
      "left": "10px",
      "position": "absolute",
      "cursor": "pointer",
      "text-align": "center"
    });
    pType.selectAll("span.pTypeRight").text(">").on("click", function() {
      chgGroupIx(true);
    }).style({
      "right": "10px",
      "position": "absolute",
      "cursor": "pointer",
      "text-align": "center"
    });

    pType.selectAll("div.pTypeHead").style({
      "border-radius": 4 + "px",
      "text-align": "center",
      "margin": "0 0 4px 0",
      "padding": "5px 0",
      "background-color": function(gid) {
        return pool.getGroupColor(gid);
      },
      "color": function(gid) {
        return jkjs.util.getFontColor(pool.getGroupColor(gid));
      }
    });
    pType.selectAll("span.pTypeSpan").text(function(gid) {
      return groups[gid].desc;
    }).on("click", function(gid) {
      if(d3.event.button != 0) return;
      pool.startBulkValidity();
      var state = Number.NaN;
      pool.traverseGroup(gid, function(t) {
        if(state == 0) {
          return;
        }
        var v = t.isValid();
        if(isNaN(state)) {
          state = v ? 1 : -1;
        } else if((state > 0 && !v) || (state < 0 && v)) {
          state = 0;
        }
      });
      var setV = state <= 0;
      pool.traverseGroup(gid, function(t) {
        t.setValid(setV);
      });
      pool.endBulkValidity();
    });
    var h = totalHeight / gKeys.length - 46; // 24: padding + margin + border; 22: buffer
    var divs = pType.selectAll("div.pTypeDiv").style({
      "font-size": "10px",
      "font-family": "monospace",
      "white-space": "nowrap",
      "max-height": h + "px",
      "margin": "0 0 12px 0",
    });

    function Node(id, type) {
      var that = this;
      var children = {};
      var childs = null;
      var count = Number.NaN;
      var y = Number.NaN;
      var isRoot = false;
      this.isRoot = function(_) {
        if(!arguments.length) return isRoot;
        isRoot = !!_;
      };
      this.putChild = function(node) {
        var id = node.getId();
        if(that.getId() == id) {
          console.warn("tried to add itself as child", "'" + id + "'");
          return;
        }
        children[id] = node;
        childs = null;
        count = Number.NaN;
        y = Number.NaN;
      };
      this.getId = function() {
        return id;
      };
      this.getType = function() {
        return type;
      };
      this.getDesc = function() {
        return type.getDesc();
      };
      this.getName = function() {
        return type.getName();
      };
      this.getCount = function() {
        if(Number.isNaN(count)) {
          if(that.hasChildren()) {
            count = 0;
            that.getChildren().forEach(function(c) {
              count += c.getCount();
            });
          } else {
            count = type.getCount();
          }
        }
        return count;
      };
      this.getY = function() {
        if(Number.isNaN(y)) {
          y = Number.POSITIVE_INFINITY;
          that.getChildren().forEach(function(c) {
            y = Math.min(y, c.getY());
          });
        }
        return y;
      };
      this.getChildren = function() {
        if(!childs) {
          childs = Object.keys(children).map(function(c) {
            return children[c];
          });
        }
        return childs;
      };
      this.hasChildren = function() {
        return that.getChildren().length > 0;
      };
      this.isExpanded = function() {
        return that.isRoot() || !that.getChildren().some(function(c) {
          return c.getType().hasRealProxy();
        });
      };
      this.preorder = function(cb, level, onlyVisible) {
        cb(level, that, that.hasChildren(), that.isExpanded());
        if(that.hasChildren() && (!onlyVisible || that.isExpanded())) {
          var cs = that.getChildren();
          typeSort && cs.sort(function(a, b) {
            return typeSort(a, b);
          });
          cs.forEach(function(n) {
            n.preorder(cb, level + 1, onlyVisible);
          });
        }
      };
    } // Node

    var roots = {};
    var nodeMap = {};
    function buildHierarchy(type) {
      var g = type.getGroup();
      if(!(g in nodeMap)) {
        nodeMap[g] = {};
      }
      var nm = nodeMap[g];
      var t = type;
      var node = null;
      while(t) {
        var id = t.getTypeId();
        var p = id in nm ? nm[id] : new Node(id, t);
        if(node) {
          p.putChild(node);
        }
        if(id == "" && !(g in roots)) {
          p.isRoot(true);
          roots[g] = p;
        }
        if(!(id in nm)) {
          nm[id] = p;
        } else {
          break;
        }
        node = p;
        t = t.getParent();
      }
      if(!(g in roots)) {
        console.warn("no real root found!");
        roots[g] = new Node("", {
          "getGroup": function() {
            return g;
          },
          "getTypeId": function() {
            return "";
          }
        });
        roots[g].isRoot(true);
        node && roots[g].putChild(node);
      }
    }

    Object.keys(groups).forEach(function(gid) {
      groups[gid].types.forEach(function(type) {
        buildHierarchy(type);
      });
    });

    function toggle(node, collapse) {
      var type = node.getType();
      pool.startBulkValidity();
      node.preorder(function(level, n) {
        if(!level) return;
        var t = n.getType();
        if(collapse) {
          t.proxyType(type);
        } else {
          t.proxyType(t);
        }
      }, 0, false);
      pool.endBulkValidity();
      that.updateLists();
    }

    divs.selectAll("div.pT").remove();
    divs.each(function(gid) {
      var pT = d3.select(this);
      roots[gid].preorder(function(level, node, isInner, isExpanded) {
        var type = node.getType();
        if(type.getTypeId() == "") {
          return;
        }
        var div = pT.append("div").classed("pT", true).datum(type);
        if("createListEntry" in type) {
          var objs = type.createListEntry(div, level, isInner, isExpanded);
          objs["space"].on("click", function() {
            toggle(node, isExpanded);
          });
        }
      }, 0, true);
    });

    divs.selectAll("div.pT").each(function(t) {
      var div = d3.select(this);
      var hasSelected = t.getTypeId() in selectedTypes;
      var onlyOneTypeSelected = Object.keys(selectedTypes).length;
      if("updateListEntry" in t) {
        t.updateListEntry(div, hasSelected, onlyOneTypeSelected);
      }
    });
  };
} // EventView
