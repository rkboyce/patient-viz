/**
 * Created by krause on 2014-09-24.
 */

function TypePool(busy, overview, setBox, onVC, cw, rh) {
  var that = this;
  var startTime = Number.NaN;
  var endTime = Number.NaN;
  var colW = cw;
  var rowH = rh;
  var width = Number.NaN;
  var groups = {};
  var sel = null;
  var sec = null;
  var helpH = null;
  var helpV = null;
  var hBars = [];
  var vBars = [];
  var vSpan = [];

  this.getBusy = function() {
    return busy;
  };

  this.getMousePos = function() {
    return d3.mouse(sel.node());
  };

  var eventMap = {};
  this.registerNamedEvent = function(id, eve) {
    if(id in eventMap) {
      console.warn("duplicate event id: "+id);
    }
    eventMap[id] = eve;
  };
  this.getNamedEvent = function(id) {
    if(!(id in eventMap)) {
      console.warn("unknown event id: "+id);
    }
    return eventMap[id] || null;
  };
  var eventGroups = {};
  var egSel = null;
  this.registerEventGroup = function(eg_id, eve) {
    if(!(eg_id in eventGroups)) {
      eventGroups[eg_id] = [];
    }
    eventGroups[eg_id].push(eve);
  };
  this.getEventGroup = function(eg_id) {
    return eg_id in eventGroups ? eventGroups[eg_id] : [];
  };
  this.updateEventGroupLines = function(eve) {
    overview.clearShadow();

    function update() {
      if(!egSel) {
        egSel = that.select().append("g");
      }
      egSel.selectAll("line").remove();
      if(!eve) return;
      var eg_id = eve.getEventGroupId();
      var eg = that.getEventGroup(eg_id);
      if(!eg.length && eve.shown()) return;
      var boxSize = that.boxSize();
      var colW = boxSize[0];
      var rowH = boxSize[1];
      var ownX = that.getXByEventTime(eve) + colW * 0.5;
      var ownY = eve.getType().getY() + rowH * 0.5;
      eg.forEach(function(other) {
        if(!other || !other.shown() || other === eve) return;
        var x = that.getXByEventTime(other) + colW * 0.5;
        var y = other.getType().getY() + rowH * 0.5;
        egSel.append("line").attr({
          "stroke-width": 4,
          "stroke": "black",
          "stroke-linecap": "round",
          "x1": ownX,
          "y1": ownY,
          "x2": x,
          "y2": y
        });
      });
    }

    update();
    overview.onBoxUpdate();
  };

  this.addEventToType = function(eve, e, dictionary) {
    var g = e["group"];
    if(!(g in groups)) {
      groups[g] = {};
    }
    var grp = groups[g];
    var id = e["id"];
    var res;
    if(!(id in grp)) {

      function getAliasType(id) {
        if(!(id in dictionary[g])) {
          return null;
        }
        var t = null;
        if("alias" in dictionary[g][id]) {
          var alias = dictionary[g][id]["alias"];
          if(!(alias in grp)) {
            t = getAliasType(alias);
            if(t) {
              grp[alias] = t;
            }
          } else {
            t = grp[alias];
          }
        }
        if(!t && id in dictionary[g]) {
          t = new Type(that, g, id, dictionary);
        }
        return t;
      }

      res = getAliasType(id);
      if(!res) {
        console.warn("unknown type: "+g+" "+id);
        res = new Type(that, g, id, dictionary);
      }

      grp[id] = res;
      // create all subtypes as well
      var t = res;
      while(t.getParentString() && !that.hasTypeFor(g, t.getParentString())) {
        var p = t.getParentString();
        t = new Type(that, g, p, dictionary);
        grp[p] = t;
      }
      if(!("" in grp)) {
        grp[""] = new Type(that, g, "", dictionary);
      }
    } else {
      res = grp[id];
    }
    res.addEvent(eve, e);
    return res;
  };
  this.hasTypeFor = function(group, id) {
    return group in groups && id in groups[group];
  };
  this.getTypeFor = function(group, id) {
    if(!(group in groups)) {
      console.warn("unknown group", group);
      return null;
    }
    var g = groups[group];
    if(!(id in g)) {
      console.warn("unknown id in group " + group, "'" + id + "'");
      return null;
    }
    return g[id];
  };
  this.traverseGroups = function(cb) {
    Object.keys(groups).forEach(function(gid) {
      cb(gid, groups[gid]);
    });
  };
  this.traverseGroup = function(gid, cb) {
    var group = groups[gid];
    Object.keys(group).forEach(function(tid) {
      cb(group[tid]);
    });
  };
  this.traverseTypes = function(cb, sorting) {
    var types = [];
    this.traverseGroups(function(_, group) {
      Object.keys(group).forEach(function(tid) {
        var type = group[tid];
        if(type.hasEvents()) {
          types.push(type);
        }
      });
    });
    if(sorting) {
      types.sort(sorting);
    }
    types.forEach(function(type) {
      cb(type.getGroupId(), type.getTypeId(), type);
    });
  };
  this.traverseDays = function(cb) {
    var types = [];
    that.traverseTypes(function(_, _, type) {
      types.push({
        type: type,
        index: 0,
        event: type.getEventByIndex(0),
        length: type.getCount()
      });
    });
    var finished = false;
    var curTime = Number.NEGATIVE_INFINITY;
    while(!finished) {
      var eventsToday = [];
      var nextTime = Number.POSITIVE_INFINITY;
      finished = true;
      types.forEach(function(obj) {
        var e = obj.event;
        if(!e) {
          return;
        }
        var time = e.getTime();
        if(time < nextTime && time > curTime) {
          nextTime = time;
        }
        if(time == curTime) {
          eventsToday.push(e);
          obj.index += 1;
          if(obj.index < obj.length) {
            obj.event = obj.type.getEventByIndex(obj.index);
          } else {
            obj.event = null;
          }
        }
        finished = false;
      });
      if(eventsToday.length) {
        cb(curTime, eventsToday);
      }
      if(Number.isFinite(nextTime)) {
        curTime = nextTime;
      } else {
        finished = true;
      }
    }
  };
  this.traverseEvents = function(cb) {
    this.traverseTypes(function(gid, tid, type) {
      type.traverseEvents(function(e) {
        cb(gid, tid, e);
      });
    });
  };
  this.traverseAllEvents = function(cb) { // even invisible ones
    this.traverseTypes(function(gid, tid, type) {
      type.traverseAllEvents(function(e) {
        cb(gid, tid, e);
      });
    });
  };
  this.traverseEventsForX = function(x, cb) {
    var toX = x;
    var fromX = toX - colW;
    this.traverseTypes(function(gid, tid, type) {
      if(!type.isValid()) return;
      type.traverseEventRange(fromX, toX, function(e) {
        return that.getXByEventTime(e);
      }, function(e) {
        cb(e);
      });
    });
  };
  this.traverseEventsForTime = function(time, cb) {
    var toTime = time;
    var fromTime = toTime - minTimeDiff;
    this.traverseEventsForTimespan(fromTime, toTime, cb);
  };
  this.traverseEventsForEventTime = function(e, cb) {
    var fromTime = e.getTime();
    var toTime = fromTime + minTimeDiff;
    this.traverseEventsForTimespan(fromTime, toTime, cb);
  };
  this.traverseEventsForTimespan = function(fromTime, toTime, cb) {
    this.traverseTypes(function(gid, tid, type) {
      if(!type.isValid()) return;
      type.traverseEventRange(fromTime, toTime, function(e) {
        return e.getTime();
      }, function(e) {
        cb(e);
      });
    });
  };
  this.toBitVector = function(type) {
    var len = Math.ceil((endTime - startTime) / minTimeDiff);
    var vec = new Uint8Array(len);
    type.traverseEvents(function(e) {
      vec[Math.floor((e.getTime() - startTime) / minTimeDiff)] = 1;
    });
    return vec;
  };

  var topTenWeights = [];
  var distinctTypes = 0;
  var minTimeDiff = Number.POSITIVE_INFINITY;
  this.clearEvents = function() {
    topTenWeights = [];
    startTime = 0;
    endTime = 1;
    minTimeDiff = 1;
    distinctTypes = 0;
    that.traverseTypes(function(gid, tid, t) {
      t.deleteType();
    });
    groups = {};
    eventMap = {};
    hBars.forEach(function(b) {
      b.sel && b.sel.remove();
    });
    vBars.forEach(function(b) {
      b.sel && b.sel.remove();
    });
    vSpan.forEach(function(b) {
      b.sel && b.sel.remove();
    });
    hBars = [];
    vBars = [];
    vSpan = [];
    width = colW;
    that.updateLook();
  };
  this.readEvents = function(person, dictionary) {
    if(!("start" in person) || !("end" in person)) {
      // TODO compute time boundaries if missing
      console.warn("missing time bounds 'start' or 'end'", person["start"], person["end"]);
      return;
    }
    TypePool.hasWeightedEvent = false;
    var timeSpan = [parseInt(person["start"]), parseInt(person["end"])];
    startTime = timeSpan[0];
    endTime = timeSpan[1];
    var allTimes = [];
    person["events"].forEach(function(e) {
      var eve = new Event(e, that, dictionary);
      var time = eve.getTime();
      allTimes = jkjs.util.join(allTimes, [ time ]);
      if(time < startTime || time > endTime) {
        console.warn("time is out of bounds: "+startTime+" < "+time+" < "+endTime);
        console.log(eve);
      }
      if(eve.isWeighted()) {
        topTenWeights.push(eve.getWeight());
        topTenWeights.sort(d3.ascending);
        var tmp = jkjs.util.unique(topTenWeights);
        if(tmp.length > 10) {
          tmp = tmp.slice(-10);
        }
        topTenWeights = tmp;
      }
    });
    var topoTimes = {};
    allTimes.forEach(function(time, ix) {
      topoTimes[time] = ix;
    });
    allTimes = [];
    distinctTypes = 0;
    minTimeDiff = Number.POSITIVE_INFINITY
    that.traverseTypes(function(gid, tid, type) {
      var mTimeDiff = type.sortEvents();
      if(mTimeDiff < minTimeDiff) {
        minTimeDiff = mTimeDiff;
      }
      distinctTypes += 1;
    });
    if(!Number.isFinite(minTimeDiff)) {
      // slow way of getting minTimeDiff -- collecting all times
      var allEventTimes = [];
      that.traverseAllEvents(function(_, _, e) {
        allEventTimes.push(e.getTime());
      });
      allEventTimes.sort(d3.ascending);
      var lastTime = Number.NEGATIVE_INFINITY;
      allEventTimes.forEach(function(t) {
        if(t === lastTime) return;
        var diff = t - lastTime;
        if(diff < minTimeDiff) {
          minTimeDiff = diff;
        }
        lastTime = t;
      });
    }
    that.traverseEvents(function(gid, tid, e) {
      e.topoX(topoTimes[e.getTime()]);
    });
    (!Number.isFinite(minTimeDiff) || minTimeDiff <= 0) && console.warn("minTimeDiff incorrect", minTimeDiff, that);
    width = (endTime - startTime) / minTimeDiff * colW;
    d3.select("#pShowLabel").style({
      "display": TypePool.hasWeightedEvent ? null : "none"
    });
  };
  this.isInTopTenWeight = function(weight) {
    if(!topTenWeights.length) return true;
    return weight >= topTenWeights[0];
  };
  this.getTotalDistinctTypeCount = function() {
    return distinctTypes;
  };

  function noImpl() {
    console.warn("no implementation possible");
    console.trace();
  }

  function getWidth() {
    return width;
  }
  var allW = width;
  function getAllWidth() {
    return allW;
  }

  function yByEvent(name, time, sort) {
    return {
      "assignY": function(displayTypes, setY) {
        displayTypes.sort(function(ta, tb) {
          return sort(time(ta), time(tb));
        });
        var y = 0;
        displayTypes.forEach(function(type) {
          setY(type, y);
          y += rowH;
        });
        return y;
      },
      "name": name
    };
  }

  function yByGroup(name, time, join, init, sort) {
    return {
      "assignY": function(displayTypes, setY) {
        var groups = {};
        var roots = {};

        function getNode(type) {
          var group = type.getGroup();
          var id = type.getTypeId();
          if(!(group in groups)) {
            groups[group] = {};
          }
          if(!(id in groups[group])) {
            groups[group][id] = new Node(id, type);
          }
          return groups[group][id];
        }

        function createNode(type) {
          var group = type.getGroup();
          var node = getNode(type);
          node.time(time(type));
          var t = type.getParent();
          while(t) {
            var p = getNode(t);
            p.putChild(node);
            if(p.getId() == "") {
              if(!(group in roots)) {
                roots[group] = p;
              }
            }
            node = p;
            t = t.getParent();
          }
          if(!(group in roots)) {
            console.warn("no real root found");
            roots[group] = getNode({
              "getGroup": function() {
                return group;
              },
              "getTypeId": function() {
                return "";
              },
              "isValid": function() {
                return true;
              }
            });
            roots[group].putChild(node);
          }
        }

        function Node(id, type) {
          var that = this;
          var children = {};
          var time = init;

          this.putChild = function(node) {
            var id = node.getId();
            if(id === that.getId()) {
              console.warn("tried to add itself as child", "'" + id + "'");
              return;
            }
            children[id] = node;
            that.time(node.time());
          };
          this.getId = function() {
            return id;
          };
          this.getType = function() {
            return type;
          };
          this.time = function(_) {
            if(!arguments.length) return time;
            time = join(time, _);
          };
          this.traverseChildren = function(cb) {
            var cids = Object.keys(children).map(function(c) {
              return children[c];
            });
            cids.sort(function(ca, cb) {
              return sort(ca.time(), cb.time());
            });
            cids.forEach(cb);
          };
          this.hasChildren = function() {
            return Object.keys(children).length > 0;
          };
        } // Node

        displayTypes.forEach(function(type) {
          createNode(type);
        });
        var rootList = Object.keys(roots).map(function(k) {
          return roots[k];
        });
        rootList.sort(function(ra, rb) {
          return sort(ra.time(), rb.time());
        });

        var y = 0;
        function assign(n) {
          var t = n.getType();
          if(!t.isValid()) {
            return;
          }
          setY(t, y);
          if(n.hasChildren()) {
            n.traverseChildren(function(c) {
              assign(c);
            });
          } else {
            y += rowH;
          }
        }

        rootList.forEach(function(n) {
          assign(n);
        });
        return y;
      },
      "name": name
    };
  }

  var yModes = [
    yByGroup("Groups (First)", function(t) {
      return t.proxedMinTime();
    }, function(a, b) {
      return Math.min(a, b);
    }, Number.POSITIVE_INFINITY, d3.descending),
    yByGroup("Groups (Last)", function(t) {
      return t.proxedMaxTime();
    }, function(a, b) {
      return Math.max(a, b);
    }, Number.NEGATIVE_INFINITY, d3.ascending),
    yByEvent("First Event", function(t) {
      return t.proxedMinTime();
    }, d3.descending),
    yByEvent("Last Event", function(t) {
      return t.proxedMaxTime();
    }, d3.ascending)
  ];
  var yModeIx = 0;
  var yMode = yModes[0];
  this.yMode = function(_) {
    if(!arguments.length) return yModeIx;
    yModeIx = _;
    yMode = yModes[yModeIx];
    that.onValidityChange();
  };
  this.getYModes = function() {
    return yModes.map(function(ym) {
      return ym["name"];
    });
  };

  function assignY(displayTypes) {
    var yMap = {};

    function setY(type, y) {
      var group = type.getGroup();
      if(!(group in yMap)) {
        yMap[group] = {};
      }
      yMap[group][type.getTypeId()] = y;
      if(type.proxyType() !== type) {
        setY(type.proxyType(), y);
      }
    }

    var h = yMode["assignY"](displayTypes, setY);
    that.traverseTypes(function(gid, tid, type) {
      if(!type.isValid()) {
        type.setY(-rowH);
        return;
      }
      var pt = type;
      for(;;) {
        var pid = pt.getTypeId();
        var grp = pt.getGroup()
        if(pid in yMap[grp]) {
          type.setY(yMap[grp][pid]);
          break;
        }
        if(pt === pt.proxyType()) {
          console.warn("no mapping for "+pid, pid, grp, type.getTypeId(), type.getGroup(), yMap);
          type.setY(-rowH);
          break;
        }
        pt = pt.proxyType();
      }
    });
    return h;
  }

  var xModes = [
    {
      "byTime": function(time) {
        return (time - startTime) / (endTime - startTime) * (getWidth() - colW);
      },
      "byEvent": function(e) {
        return that.getXByTime(e.getTime());
      },
      "time": function(x) {
        return x / (getWidth() - colW) * (endTime - startTime) + startTime;
      },
      "date": function(x) {
        return new Date(that.getTimeByX(x) * 1000);
      },
      "name": "Time",
      "ticks": true,
      "linear": true,
      "vconst": true
    },
    {
      "byTime": function(time) {
        noImpl();
      },
      "byEvent": function(e) {
        return e.topoX() * colW;
      },
      "time": function(x) {
        noImpl();
      },
      "date": function(x) {
        noImpl();
      },
      "name": "Sequence",
      "ticks": true,
      "linear": false,
      "vconst": true
    },
    {
      "byTime": function(time) {
        noImpl();
      },
      "byEvent": function(e) {
        return e.ixInType() * colW;
      },
      "time": function(x) {
        noImpl();
      },
      "date": function(x) {
        noImpl();
      },
      "name": "Stacked",
      "ticks": true,
      "linear": false,
      "vconst": false
    },
  ];
  var xModeIx = 0;
  var xMode = xModes[0];
  this.xMode = function(_) {
    if(!arguments.length) return xModeIx;
    xModeIx = _;
    xMode = xModes[xModeIx];
    that.onValidityChange();
  };
  this.getXModes = function() {
    return xModes.map(function(xm) {
      return xm["name"];
    });
  };

  this.getXByTime = function(time) {
    return xMode["byTime"](time);
  };
  this.getXByEventTime = function(e) {
    return xMode["byEvent"](e);
  };
  this.getTimeByX = function(x) {
    return xMode["time"](x);
  };
  this.getDateByX = function(x) {
    return xMode["date"](x);
  };
  this.showTicks = function() {
    return xMode["ticks"];
  };
  this.linearTime = function() {
    return xMode["linear"];
  };
  this.vConst = function() {
    return xMode["vconst"];
  };
  this.getRangeY = function(type) {
    var y = type.getY();
    return [ y, y + rowH ];
  };
  this.getRangeX = function() {
    return [ that.getXByTime(startTime), that.getXByTime(endTime) ];
  };
  this.getRangeTime = function() {
    return [ startTime, endTime ];
  };
  this.getRangeDate = function() {
    return [ new Date(startTime * 1000), new Date(endTime * 1000) ];
  };
  var hasLinechart = false;
  this.hasLinechart = function(_) {
    if(!arguments.length) return hasLinechart;
    hasLinechart = _;
  }
  var selListeners = [];
  this.addSelectionsListener = function(listener) {
    selListeners.push(listener);
    listener(sel, sec);
  };
  this.setSelections = function(inner, secondary) {
    sel = inner;
    sel.datum(that);
    sec = secondary;
    helpH = sel.append("rect").attr({
      "height": rowH,
      "x": 0
    }).style({
      "fill": "darkgray"
    });
    helpV = sel.append("rect").attr({
      "width": colW,
      "y": 0
    }).style({
      "fill": "darkgray"
    });
    jkjs.util.toFront(helpH, false);
    jkjs.util.toFront(helpV, false);
    selListeners.forEach(function(l) {
      l(sel, sec);
    });
  };
  this.select = function() {
    sel || console.warn("no selection defined", sel, that);
    return sel;
  };
  this.selectSec = function() {
    sec || console.warn("no secondary selection defined", sec, that);
    return sec;
  };

  this.addHBar = function(groupId, typeId, noUpdate) {
    that.traverseTypes(function(gid, tid, type) {
      if(gid != groupId) return;
      if(type.getId() != typeId) return; // TODO maybe startsWith later
      hBars.push(type);
    });
    if(!noUpdate) {
      that.updateLook();
    }
  };
  this.addVSpan = function(from, to, styleClass, noUpdate) {
    var start = from;
    var end = Number.isNaN(to) ? from + minTimeDiff : to;
    var newBar = sel.append("rect").attr({
      "y": -jkjs.util.BIG_NUMBER * 0.5,
      "height": jkjs.util.BIG_NUMBER
    });
    vSpan.push({
      sel: newBar,
      start: start,
      end: end,
      styleClass: styleClass
    });
    if(!noUpdate) {
      that.updateLook();
    }
  }
  this.addVBar = function(time, noUpdate) {
    var newBar = sel.append("rect").attr({
      "width": colW,
      "y": -jkjs.util.BIG_NUMBER * 0.5,
      "height": jkjs.util.BIG_NUMBER
    }).style({
      "fill": "#7e7e7e"
    });
    jkjs.util.toFront(newBar, false);
    vBars.push({
      sel: newBar,
      time: time,
      labels: []
    });
    if(!noUpdate) {
      that.updateLook();
    }
  };
  this.traverseVBars = function(cb) {
    var from = startTime;
    var prevObj = null;
    vBars.forEach(function(obj) {
      cb(from, obj.time, prevObj);
      prevObj = obj;
      from = obj.time;
    });
    if(prevObj) {
      cb(from, endTime, prevObj);
    }
  };
  var inTransition = false;
  this.inTransition = function(_) {
    if(!arguments.length) return inTransition;
    inTransition = _;
  };
  var vGrids = [];
  var newVGrids = [];
  this.setVGrids = function(vg) {
    newVGrids = vg;
  };

  var hGrids = [];
  var newHGrids = [];
  var gridSize = 100;
  function updateGrid(_ /*svgport*/, viewport, scale, smooth) {
    var vrect = {
      x: 0,
      y: 0,
      width: viewport.width * scale,
      height: viewport.height * scale
    };
    if(smooth || inTransition) {
      vGrids.forEach(function(s) {
        s.remove();
      });
      vGrids = [];
      hGrids.forEach(function(s) {
        s.remove();
      });
      hGrids = [];
      return;
    }

    function adjust(arr, arrAfter, create, style) {
      if(arrAfter.length < arr.length) {
        for(var ix = arrAfter.length;ix < arr.length;ix += 1) {
          arr[ix].remove();
        }
        arr.length = arrAfter.length;
      } else {
        for(var ix = arr.length;ix < arrAfter.length;ix += 1) {
          arr.push(sec.append(create).style(style));
        }
      }
    }

    var debug = false;
    var dashes = debug ? gridSize / 2 / 3 : gridSize / 2 / 30;
    adjust(vGrids, newVGrids, "line", {
      "opacity": debug ? 1 : 0.4,
      "stroke": "black",
      "stroke-width": 0.5,
      "stroke-dasharray": dashes + ", " + dashes
    });
    vGrids.forEach(function(s, ix) {
      var x = newVGrids[ix];
      s.attr({
        "x1": x,
        "x2": x,
        "y1": vrect.y - gridSize - (viewport.y * scale - gridSize) % gridSize,
        "y2": vrect.y + vrect.height + gridSize
      });
    });
    newVGrids = [];

    newHGrids = [];
    var dist = gridSize * scale;
    while(dist < gridSize * 0.5) {
      dist *= 2;
    }
    while(dist > gridSize * 1.5) {
      dist /= 2;
    }
    var yStart = vrect.y - dist - (viewport.y * scale - dist) % dist;
    for(var yPos = yStart;yPos <= vrect.y + vrect.height;yPos += dist) {
      newHGrids.push(yPos);
    }
    adjust(hGrids, newHGrids, "line", {
      "opacity": debug ? 1 : 0.4,
      "stroke": "black",
      "stroke-width": 0.5,
      "stroke-dasharray": dashes + ", " + dashes
    });
    hGrids.forEach(function(s, ix) {
      var y = newHGrids[ix];
      s.attr({
        "x1": vrect.x - gridSize - (viewport.x * scale - gridSize) % gridSize,
        "x2": vrect.width + gridSize,
        "y1": y,
        "y2": y
      });
    });
  }

  var maxConnectSlot = 0;
  this.maxConnectSlot = function(_) {
    if(!arguments.length) return maxConnectSlot;
    if(maxConnectSlot === _) return;
    overview.clearShadow();
    maxConnectSlot = _;
    that.updateLook();
  };

  var showSpans = true;
  this.showSpans = function(_) {
    if(!arguments.length) return showSpans;
    showSpans = _;
  };
  this.updateLook = function() {
    var displayTypes = {};
    that.traverseTypes(function(gid, tid, type) {
      var pt = type;
      while(pt !== pt.proxyType()) {
        pt = pt.proxyType();
      }
      displayTypes[pt.getGroupId() + '__' + pt.getTypeId()] = pt;
    });
    displayTypes = Object.keys(displayTypes).map(function(id) {
      var type = displayTypes[id];
      type.traverseProxedEvents(function(e, ix) {
        e.ixInType(ix);
      });
      return type;
    });
    var add = 4;
    var maxY = assignY(displayTypes);
    var maxX = 0;
    that.traverseEvents(function(gid, tid, e) {
      e.updateLook();
      var eSel = e.select();
      var oldX = e.lastX();
      var newX = that.getXByEventTime(e);
      if(newX > maxX) {
        maxX = newX;
      }
      if(oldX != newX) { // only update if necessary -- very expensive!!!
        eSel.attr({
          "x": newX - add,
          "y": -add
        });
        e.lastX(newX);
      }
      e.updateAdditional(newX + colW * 0.5, rowH * 0.5);
    });
    displayTypes.forEach(function(type) {
      var prev = null;
      var prevT = Number.NaN;
      var prevX = Number.NaN;
      type.traverseProxedEvents(function(eve) {
        var t = eve.getTime();
        var x = that.getXByEventTime(eve);
        if(prev) {
          var dt = (t - prevT) / minTimeDiff;
          if(dt > maxConnectSlot) {
            dt = 1;
          }
          var dx = dt > 1 ? (x - prevX) / colW : 1;
          if(prev.width() !== dx) {
            prev.select().attr({
              "width": colW * dx + 2 * add,
              "height": rowH + 2 * add
            });
            prev.width(dx);
          }
        }
        prev = eve;
        prevT = t;
        prevX = x;
      });
      if(prev && prev.width() !== 1) {
        prev.select().attr({
          "width": colW + 2 * add,
          "height": rowH + 2 * add
        });
        prev.width(1);
      }
    });
    var w = Math.max(maxX, colW) + 2 * add;
    var h = Math.max(maxY, rowH + 2 * add);

    allW = w;
    setBox(w, h);
    helpH && helpH.attr({
      "x": -jkjs.util.BIG_NUMBER * 0.5,
      "width": jkjs.util.BIG_NUMBER
    });
    helpV && helpV.attr({
      "y": that.vConst() ? -jkjs.util.BIG_NUMBER * 0.5 : 0,
      "height": that.vConst() ? jkjs.util.BIG_NUMBER : 0
    });
    hBars.forEach(function(bar) {
      if(!bar.hBar()) {
        var newBar = sel.append("rect").attr({
          "height": rowH,
          "width": jkjs.util.BIG_NUMBER,
          "x": -jkjs.util.BIG_NUMBER * 0.5
        }).style({
          "fill": "#7e7e7e",
          "opacity": 0.5
        });
        jkjs.util.toFront(newBar, false);
        bar.hBar(newBar);
      }
      var y = bar.getProxed()[0].getY();
      bar.hBar().attr({
        "y": y
      });
    });
    var vis = that.linearTime();
    vBars.forEach(function(bar) {
      bar.sel.style({
        "opacity": vis && DEBUG_V_SEGMENTS ? 0.5 : 0
      });
      if(!vis) return;
      var x = that.getXByTime(bar.time);
      bar.sel.attr({
        "x": x
      });
    });
    vSpan.forEach(function(span) {
      span.sel.style(that.getStyleClass(span.styleClass, {
        "opacity": 0.2,
        "color": "gray"
      }));
      if(!vis || !showSpans) {
        span.sel.style({
          "opacity": 0
        });
      };
      if(!vis || !showSpans) return;
      var x1 = that.getXByTime(span.start);
      var x2 = that.getXByTime(span.end);
      span.sel.attr({
        "x": x1,
        "width": (x2 - x1)
      });
    });
  };
  this.boxSize = function() {
    return [ colW, rowH ];
  };

  var styleClasses = {};
  this.addStyleClass = function(names, styles) {
    names.split(" ").forEach(function(name) {
      var n = name.trim();
      if(!n.length) return;
      var obj = n in styleClasses ? styleClasses[n] : {};
      Object.keys(styles).forEach(function(k) {
        obj[k] = styles[k];
      });
      styleClasses[n] = obj;
    });
  };
  this.getStyleClass = function(names, defaults) {
    var res = {};
    Object.keys(defaults).forEach(function(k) {
      res[k] = defaults[k];
    });
    names.split(" ").forEach(function(name) {
      var n = name.trim();
      if(!n.length) return;
      if(n in styleClasses) {
        Object.keys(styleClasses[n]).forEach(function(k) {
          res[k] = styleClasses[n][k];
        });
      }
    });
    return res;
  };

  var szListeners = [];
  this.onSizeUpdate = function(w, h) {
    szListeners.forEach(function(l) {
      l(w, h);
    });
  };
  this.addSizeListener = function(listen) {
    szListeners.push(listen);
  };

  var vpListeners = [];
  this.onViewportChange = function(svgport, viewport, scale, smooth) {
    vpListeners.forEach(function(l) {
      l(svgport, viewport, scale, smooth);
    });
  };
  this.addViewportChangeListener = function(listen) {
    vpListeners.unshift(listen); // earlier added listeners are always called last!
  };
  this.addViewportChangeListener(function(svgport, viewport, scale, smooth) {
    updateGrid(svgport, viewport, scale, smooth);
  });

  this.getGroupColor = function(gid) {
    return that.getTypeFor(gid, "").getColor();
  };

  var inBulkSelection = 0;
  this.selectInRect = function(sRect, done) {
    if(!done) return;
    var w = getAllWidth();
    that.startBulkSelection();
    if(!this.joinSelections()) {
      that.traverseEvents(function(gid, tid, e) {
        e.setSelected(false);
      });
    }
    that.traverseTypes(function(gid, tid, type) {
      if(!type.isValid()) return;
      type.traverseEventRange(sRect.x - colW, sRect.x + sRect.width, function(e) {
        return that.getXByEventTime(e);
      }, function(e) {
        e.setSelected(true);
      });
    });
    pool.highlightMode(TypePool.HIGHLIGHT_NONE);
    that.highlightEvent(null);
    that.fixSelection(true);
    that.greyOutRest(true);
    that.endBulkSelection();
  };
  this.startBulkSelection = function() {
    inBulkSelection += 1;
  };
  this.endBulkSelection = function() {
    inBulkSelection -= 1;
    if(inBulkSelection <= 0) {
      that.updateSelection();
    }
  };
  var greyOutRest = false;
  this.greyOutRest = function(_) {
    if(!arguments.length) return greyOutRest;
    greyOutRest = _;
  };
  var fixSelection = false;
  this.fixSelection = function(_) {
    if(!arguments.length) return fixSelection;
    fixSelection = _;
  };
  var highlightEvent = null;
  var highlightListeners = [];
  var highlightMode = TypePool.HIGHLIGHT_HOR;
  var hm = highlightMode;
  this.highlightMode = function(_) {
    if(!arguments.length) return highlightMode;
    highlightMode = _;
  };
  this.highlightEvent = function(_) {
    if(!arguments.length) return highlightEvent;
    if(highlightEvent === _ && highlightMode === hm) return;
    highlightEvent = _;
    hm = highlightMode;
    if(helpV) {
      overview.clearShadow();
      var hv = highlightEvent && (highlightMode & TypePool.HIGHLIGHT_VER);
      helpV.attr({
        "x": hv ? that.getXByEventTime(highlightEvent) : 0
      }).style({
        "opacity": hv ? 1 : 0
      });
      overview.onBoxUpdate();
    }
    if(helpH) {
      var type = highlightEvent ? highlightEvent.getType() : null;
      if(type && type.getProxed().length) {
        type = type.getProxed()[0];
      }
      var hh = type && (highlightMode & TypePool.HIGHLIGHT_HOR);
      helpH.attr({
        "y": hh ? type.getY() : 0
      }).style({
        "opacity": hh ? 1 : 0
      });
    }
    if(inBulkSelection > 0) return;
    highlightListeners.forEach(function(cb) {
      cb();
    });
  };
  this.addHighlightListener = function(cb) {
    highlightListeners.push(cb);
  };
  var hasSelection = false;
  this.hasSelection = function() {
    return hasSelection;
  };
  this.updateSelection = function() {
    if(inBulkSelection > 0) return;
    overview.clearShadow();
    var onlyTime = Number.NaN;
    var repr = null;
    var types = {};
    var eventMap = {};
    that.traverseEvents(function(gid, tid, e) {
      e.updateLook();
      var type = e.getType();
      if(e.isSelected() && type.isValid()) {
        var time = e.getTime();
        if(isNaN(onlyTime)) {
          onlyTime = time;
          repr = e;
        } else if(onlyTime != time) {
          onlyTime = Number.POSITIVE_INFINITY;
          repr = null;
        }

        function addType(type) {
          var at = type.proxyType();
          var atid = at.getId();
          if(!(atid in types)) {
            types[atid] = at;
          }
        }

        addType(type);
        var fog = e.firstOfGroup();
        eventMap[fog.getId()] = fog;
      }
    });
    var events = Object.keys(eventMap).map(function(k) {
      return eventMap[k];
    });
    var singleSlot = false;
    var singleType = false;
    var onlyType = null;
    if(!isNaN(onlyTime) && Number.isFinite(onlyTime)) {
      singleSlot = true;
    }
    if(Object.keys(types).length == 1) {
      onlyType = types[Object.keys(types)[0]];
      singleType = true;
    }
    hasSelection = !!events.length;
    // ===== notify listeners =====
    seListeners.forEach(function(l) {
      l(events, types, singleSlot, singleType);
    });
    overview.onBoxUpdate();
  };
  var joinSelections = false;
  this.joinSelections = function(js) {
    if(!arguments.length) return joinSelections;
    joinSelections = !!js;
  };
  var verticalSelection = false;
  this.verticalSelection = function(_) {
    if(!arguments.length) return verticalSelection;
    verticalSelection = !!_;
  };
  var seListeners = [];
  this.addSelectionListener = function(listen) {
    seListeners.push(listen);
  };

  var inValidityChange = false;
  var inBulkValidity = 0;
  this.startBulkValidity = function() {
    inBulkValidity += 1;
  };
  this.endBulkValidity = function() {
    inBulkValidity -= 1;
    if(inBulkValidity <= 0) {
      that.onValidityChange();
    }
  };
  this.onValidityChange = function() {
    if(inValidityChange) return;
    inValidityChange = true;
    busy.setState(jkjs.busy.state.busy);
    setTimeout(function() {
      var error = true;
      try {
        overview.clearShadow();
        that.updateLook();
        that.updateSelection();
        onVC();
        error = false;
      } finally {
        inValidityChange = false;
        busy.setState(error ? jkjs.busy.state.warn : jkjs.busy.state.norm, error ? "Error during validity change." : "");
      }
    }, 0);
  };

  this.showOnlyWeightedEvents = function(s) {
    overview.clearShadow();
    that.traverseAllEvents(function(_, _, e) {
      if(s) {
        e.showOnlyWeighted();
      } else {
        e.shown(true);
      }
    });
    that.updateLook();
    that.updateSelection();
  };
} // TypePool
TypePool.hasWeightedEvent = false;
TypePool.HIGHLIGHT_NONE = 0;
TypePool.HIGHLIGHT_HOR = 1;
TypePool.HIGHLIGHT_VER = 2;
TypePool.HIGHLIGHT_BOTH = TypePool.HIGHLIGHT_HOR | TypePool.HIGHLIGHT_VER;
