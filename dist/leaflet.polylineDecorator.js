(function (global, factory) {
	typeof exports === 'object' && typeof module !== 'undefined' ? factory() :
	typeof define === 'function' && define.amd ? define(factory) :
	(factory());
}(this, (function () { 'use strict';

function computeAngle(a, b) {
    return Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI + 90;
}

function getPointPathPixelLength(pts) {
    return pts.reduce(function (distance, pt, i) {
        return i === 0 ? 0 : distance + pt.distanceTo(pts[i - 1]);
    }, 0);
}

function getPixelLength(pl, map) {
    var latLngs = pl instanceof L.Polyline ? pl.getLatLngs() : pl;
    var points = latLngs.map(function (latLng) {
        return map.project(latLng);
    });
    return getPointPathPixelLength(points);
}

/**
* path: array of L.LatLng
* ratios is an object with the following fields:
*   offset: the ratio of the total pixel length where the pattern will start
*   endOffset: the ratio of the total pixel length where the pattern will end
*   repeat: the ratio of the total pixel length between two points of the pattern
* map: the map, to access the current projection state
*/
function projectPatternOnPath(path, ratios, map) {
    var pathAsPoints = path.map(function (latLng) {
        return map.project(latLng);
    });

    // project the pattern as pixel points
    var pattern = projectPatternOnPointPath(pathAsPoints, ratios);
    // and convert it to latlngs;
    pattern.forEach(function (point) {
        point.latLng = map.unproject(point.pt);
    });

    return pattern;
}

function projectPatternOnPointPath(pts, _ref) {
    var offset = _ref.offset,
        endOffset = _ref.endOffset,
        repeat = _ref.repeat;

    var positions = [];
    // 1. compute the absolute interval length in pixels
    var repeatIntervalLength = getPointPathPixelLength(pts) * repeat;
    // 2. find the starting point by using the offset and find the last pixel using endOffset
    var previous = interpolateOnPointPath(pts, offset);
    var endOffsetPixels = endOffset > 0 ? getPointPathPixelLength(pts) * endOffset : 0;

    positions.push(previous);
    if (repeat > 0) {
        // 3. consider only the rest of the path, starting at the previous point
        var remainingPath = pts;
        remainingPath = remainingPath.slice(previous.predecessor);

        remainingPath[0] = previous.pt;
        var remainingLength = getPointPathPixelLength(remainingPath);

        // 4. project as a ratio of the remaining length,
        // and repeat while there is room for another point of the pattern

        while (repeatIntervalLength <= remainingLength - endOffsetPixels) {
            previous = interpolateOnPointPath(remainingPath, repeatIntervalLength / remainingLength);
            positions.push(previous);
            remainingPath = remainingPath.slice(previous.predecessor);
            remainingPath[0] = previous.pt;
            remainingLength = getPointPathPixelLength(remainingPath);
        }
    }
    return positions;
}

/**
* pts: array of L.Point
* ratio: the ratio of the total length where the point should be computed
* Returns null if ll has less than 2 LatLng, or an object with the following properties:
*    latLng: the LatLng of the interpolated point
*    predecessor: the index of the previous vertex on the path
*    heading: the heading of the path at this point, in degrees
*/
function interpolateOnPointPath(pts, ratio) {
    var nbVertices = pts.length;

    if (nbVertices < 2) {
        return null;
    }
    // easy limit cases: ratio negative/zero => first vertex
    if (ratio <= 0) {
        return {
            pt: pts[0],
            predecessor: 0,
            heading: computeAngle(pts[0], pts[1])
        };
    }
    // ratio >=1 => last vertex
    if (ratio >= 1) {
        return {
            pt: pts[nbVertices - 1],
            predecessor: nbVertices - 1,
            heading: computeAngle(pts[nbVertices - 2], pts[nbVertices - 1])
        };
    }
    // 1-segment-only path => direct linear interpolation
    if (nbVertices == 2) {
        return {
            pt: interpolateBetweenPoints(pts[0], pts[1], ratio),
            predecessor: 0,
            heading: computeAngle(pts[0], pts[1])
        };
    }

    var pathLength = getPointPathPixelLength(pts);
    var a = pts[0],
        b = a,
        ratioA = 0,
        ratioB = 0,
        distB = 0;
    // follow the path segments until we find the one
    // on which the point must lie => [ab]
    var i = 1;
    for (; i < nbVertices && ratioB < ratio; i++) {
        a = b;
        ratioA = ratioB;
        b = pts[i];
        distB += a.distanceTo(b);
        ratioB = distB / pathLength;
    }

    // compute the ratio relative to the segment [ab]
    var segmentRatio = (ratio - ratioA) / (ratioB - ratioA);

    return {
        pt: interpolateBetweenPoints(a, b, segmentRatio),
        predecessor: i - 2,
        heading: computeAngle(a, b)
    };
}

/**
* Finds the point which lies on the segment defined by points A and B,
* at the given ratio of the distance from A to B, by linear interpolation.
*/
function interpolateBetweenPoints(ptA, ptB, ratio) {
    if (ptB.x != ptA.x) {
        return L.point(ptA.x * (1 - ratio) + ratio * ptB.x, ptA.y * (1 - ratio) + ratio * ptB.y);
    }
    // special case where points lie on the same vertical axis
    return L.point(ptA.x, ptA.y + (ptB.y - ptA.y) * ratio);
}

(function() {
    // save these original methods before they are overwritten
    var proto_initIcon = L.Marker.prototype._initIcon;
    var proto_setPos = L.Marker.prototype._setPos;

    var oldIE = (L.DomUtil.TRANSFORM === 'msTransform');

    L.Marker.addInitHook(function () {
        var iconOptions = this.options.icon && this.options.icon.options;
        var iconAnchor = iconOptions && this.options.icon.options.iconAnchor;
        if (iconAnchor) {
            iconAnchor = (iconAnchor[0] + 'px ' + iconAnchor[1] + 'px');
        }
        this.options.rotationOrigin = this.options.rotationOrigin || iconAnchor || 'center bottom' ;
        this.options.rotationAngle = this.options.rotationAngle || 0;

        // Ensure marker keeps rotated during dragging
        this.on('drag', function(e) { e.target._applyRotation(); });
    });

    L.Marker.include({
        _initIcon: function() {
            proto_initIcon.call(this);
        },

        _setPos: function (pos) {
            proto_setPos.call(this, pos);
            this._applyRotation();
        },

        _applyRotation: function () {
            if(this.options.rotationAngle) {
                this._icon.style[L.DomUtil.TRANSFORM+'Origin'] = this.options.rotationOrigin;

                if(oldIE) {
                    // for IE 9, use the 2D rotation
                    this._icon.style[L.DomUtil.TRANSFORM] = 'rotate(' + this.options.rotationAngle + 'deg)';
                } else {
                    // for modern browsers, prefer the 3D accelerated version
                    this._icon.style[L.DomUtil.TRANSFORM] += ' rotateZ(' + this.options.rotationAngle + 'deg)';
                }
            }
        },

        setRotationAngle: function(angle) {
            this.options.rotationAngle = angle;
            this.update();
            return this;
        },

        setRotationOrigin: function(origin) {
            this.options.rotationOrigin = origin;
            this.update();
            return this;
        }
    });
})();

// enable rotationAngle and rotationOrigin support on L.Marker
/**
* Defines several classes of symbol factories,
* to be used with L.PolylineDecorator
*/

L.Symbol = L.Symbol || {};

/**
* A simple dash symbol, drawn as a Polyline.
* Can also be used for dots, if 'pixelSize' option is given the 0 value.
*/
L.Symbol.Dash = L.Class.extend({
    isZoomDependant: true,

    options: {
        pixelSize: 10,
        pathOptions: {}
    },

    initialize: function initialize(options) {
        L.Util.setOptions(this, options);
        this.options.pathOptions.clickable = false;
    },

    buildSymbol: function buildSymbol(dirPoint, latLngs, map, index, total) {
        var opts = this.options;
        var d2r = Math.PI / 180;

        // for a dot, nothing more to compute
        if (opts.pixelSize <= 1) {
            return L.polyline([dirPoint.latLng, dirPoint.latLng], opts.pathOptions);
        }

        var midPoint = map.project(dirPoint.latLng);
        var angle = -(dirPoint.heading - 90) * d2r;
        var a = L.point(midPoint.x + opts.pixelSize * Math.cos(angle + Math.PI) / 2, midPoint.y + opts.pixelSize * Math.sin(angle) / 2);
        // compute second point by central symmetry to avoid unecessary cos/sin
        var b = midPoint.add(midPoint.subtract(a));
        return L.polyline([map.unproject(a), map.unproject(b)], opts.pathOptions);
    }
});

L.Symbol.dash = function (options) {
    return new L.Symbol.Dash(options);
};

L.Symbol.ArrowHead = L.Class.extend({
    isZoomDependant: true,

    options: {
        polygon: true,
        pixelSize: 10,
        headAngle: 60,
        pathOptions: {
            stroke: false,
            weight: 2
        }
    },

    initialize: function initialize(options) {
        L.Util.setOptions(this, options);
        this.options.pathOptions.clickable = false;
    },

    buildSymbol: function buildSymbol(dirPoint, latLngs, map, index, total) {
        return this.options.polygon ? L.polygon(this._buildArrowPath(dirPoint, map), this.options.pathOptions) : L.polyline(this._buildArrowPath(dirPoint, map), this.options.pathOptions);
    },

    _buildArrowPath: function _buildArrowPath(dirPoint, map) {
        var d2r = Math.PI / 180;
        var tipPoint = map.project(dirPoint.latLng);
        var direction = -(dirPoint.heading - 90) * d2r;
        var radianArrowAngle = this.options.headAngle / 2 * d2r;

        var headAngle1 = direction + radianArrowAngle;
        var headAngle2 = direction - radianArrowAngle;
        var arrowHead1 = L.point(tipPoint.x - this.options.pixelSize * Math.cos(headAngle1), tipPoint.y + this.options.pixelSize * Math.sin(headAngle1));
        var arrowHead2 = L.point(tipPoint.x - this.options.pixelSize * Math.cos(headAngle2), tipPoint.y + this.options.pixelSize * Math.sin(headAngle2));

        return [map.unproject(arrowHead1), dirPoint.latLng, map.unproject(arrowHead2)];
    }
});

L.Symbol.arrowHead = function (options) {
    return new L.Symbol.ArrowHead(options);
};

L.Symbol.Marker = L.Class.extend({
    isZoomDependant: false,

    options: {
        markerOptions: {},
        rotate: false
    },

    initialize: function initialize(options) {
        L.Util.setOptions(this, options);
        this.options.markerOptions.clickable = false;
        this.options.markerOptions.draggable = false;
        this.isZoomDependant = L.Browser.ie && this.options.rotate;
    },

    buildSymbol: function buildSymbol(directionPoint, latLngs, map, index, total) {
        if (this.options.rotate) {
            this.options.markerOptions.rotationAngle = directionPoint.heading + (this.options.angleCorrection || 0);
        }
        return L.marker(directionPoint.latLng, this.options.markerOptions);
    }
});

L.Symbol.marker = function (options) {
    return new L.Symbol.Marker(options);
};

L.PolylineDecorator = L.FeatureGroup.extend({
    options: {
        patterns: []
    },

    initialize: function initialize(paths, options) {
        L.FeatureGroup.prototype.initialize.call(this);
        L.Util.setOptions(this, options);
        this._map = null;
        this._initPaths(paths);
        this._initPatterns();
    },

    /**
    * Deals with all the different cases. p can be one of these types:
    * array of LatLng, array of 2-number arrays, Polyline, Polygon,
    * array of one of the previous.
    */
    _initPaths: function _initPaths(p) {
        var _this = this;

        this._paths = [];
        if (p instanceof L.Polyline) {
            this._initPath(p.getLatLngs(), p instanceof L.Polygon);
        } else if (L.Util.isArray(p) && p.length > 0) {
            if (p[0] instanceof L.Polyline) {
                p.forEach(function (singleP) {
                    _this._initPath(singleP, single instanceof L.Polygon);
                });
            } else {
                this._initPath(p);
            }
        }
    },

    _isCoordArray: function _isCoordArray(ll) {
        return L.Util.isArray(ll) && ll.length > 0 && (ll[0] instanceof L.LatLng || L.Util.isArray(ll[0]) && ll[0].length == 2 && typeof ll[0][0] === 'number');
    },

    _initPath: function _initPath(path, isPolygon) {
        // It may still be an array of array of coordinates
        // (ex: polygon with rings)
        var latLngs = this._isCoordArray(path) ? [path] : path;

        for (var i = 0; i < latLngs.length; i++) {
            // As of Leaflet >= v0.6, last polygon vertex (=first) isn't repeated.
            // Our algorithm needs it, so we add it back explicitly.
            if (isPolygon) {
                latLngs[i].push(latLngs[i][0]);
            }
            this._paths.push(latLngs[i]);
        }
    },

    _initPatterns: function _initPatterns() {
        var _this2 = this;

        this._isZoomDependant = false;
        this._patterns = [];
        var pattern = void 0;
        // parse pattern definitions and precompute some values
        this.options.patterns.forEach(function (patternDef) {
            pattern = _this2._parsePatternDef(patternDef);
            _this2._patterns.push(pattern);
            // determines if we have to recompute the pattern on each zoom change
            _this2._isZoomDependant = _this2._isZoomDependant || pattern.isOffsetInPixels || pattern.isEndOffsetInPixels || pattern.isRepeatInPixels || pattern.symbolFactory.isZoomDependant;
        });
    },

    /**
    * Changes the patterns used by this decorator
    * and redraws the new one.
    */
    setPatterns: function setPatterns(patterns) {
        this.options.patterns = patterns;
        this._initPatterns();
        this._softRedraw();
    },

    /**
    * Changes the patterns used by this decorator
    * and redraws the new one.
    */
    setPaths: function setPaths(paths) {
        this._initPaths(paths);
        this.redraw();
    },

    _parseRelativeOrAbsoluteValue: function _parseRelativeOrAbsoluteValue(value) {
        if (typeof value === 'string' && value.indexOf('%') !== -1) {
            return {
                value: parseFloat(value) / 100,
                isInPixels: false
            };
        }
        var parsedValue = value ? parseFloat(value) : 0;
        return {
            value: parsedValue,
            isInPixels: parsedValue > 0
        };
    },

    /**
    * Parse the pattern definition
    */
    _parsePatternDef: function _parsePatternDef(patternDef, latLngs) {
        return {
            cache: [],
            symbolFactory: patternDef.symbol,
            // Parse offset and repeat values, managing the two cases:
            // absolute (in pixels) or relative (in percentage of the polyline length)
            offset: this._parseRelativeOrAbsoluteValue(patternDef.offset),
            endOffset: this._parseRelativeOrAbsoluteValue(patternDef.endOffset),
            repeat: this._parseRelativeOrAbsoluteValue(patternDef.repeat)
        };
    },

    onAdd: function onAdd(map) {
        this._map = map;
        this._draw();
        // listen to zoom changes to redraw pixel-spaced patterns
        if (this._isZoomDependant) {
            this._map.on('zoomend', this._softRedraw, this);
        }
    },

    onRemove: function onRemove(map) {
        // remove optional map zoom listener
        this._map.off('zoomend', this._softRedraw, this);
        this._map = null;
        L.LayerGroup.prototype.onRemove.call(this, map);
    },

    /**
    * Returns an array of ILayers object
    */
    _buildSymbols: function _buildSymbols(latLngs, symbolFactory, directionPoints) {
        var _this3 = this;

        return directionPoints.map(function (directionPoint, i) {
            return symbolFactory.buildSymbol(directionPoint, latLngs, _this3._map, i, directionPoints.length);
        });
    },

    _getCache: function _getCache(pattern, zoom, pathIndex) {
        var zoomCache = pattern.cache[zoom];
        if (!zoomCache) {
            pattern.cache[zoom] = [];
            return null;
        }
        return zoomCache[pathIndex];
    },

    _asRatioToPathLength: function _asRatioToPathLength(_ref, totalPathLength) {
        var value = _ref.value,
            isInPixels = _ref.isInPixels;

        return isInPixels ? value / totalPathLength : value;
    },

    /**
    * Select pairs of LatLng and heading angle,
    * that define positions and directions of the symbols
    * on the path
    */
    _getDirectionPoints: function _getDirectionPoints(pathIndex, pattern) {
        var zoom = this._map.getZoom();
        var cachedDirPoints = this._getCache(pattern, zoom, pathIndex);
        if (cachedDirPoints) {
            return cachedDirPoints;
        }

        var latLngs = this._paths[pathIndex];
        if (latLngs.length < 2) {
            return [];
        }

        var pathPixelLength = getPixelLength(latLngs, this._map);
        var ratios = {
            offset: this._asRatioToPathLength(pattern.offset, pathPixelLength),
            endOffset: this._asRatioToPathLength(pattern.endOffset, pathPixelLength),
            repeat: this._asRatioToPathLength(pattern.repeat, pathPixelLength)
        };

        var dirPoints = projectPatternOnPath(latLngs, ratios, this._map);
        // save in cache to avoid recomputing this
        pattern.cache[zoom][pathIndex] = dirPoints;

        return dirPoints;
    },

    /**
    * Public redraw, invalidating the cache.
    */
    redraw: function redraw() {
        this._redraw(true);
    },

    /**
    * "Soft" redraw, called internally for example on zoom changes,
    * keeping the cache.
    */
    _softRedraw: function _softRedraw() {
        this._redraw(false);
    },

    _redraw: function _redraw(clearCache) {
        if (!this._map) {
            return;
        }
        this.clearLayers();
        if (clearCache) {
            this._patterns.forEach(function (pattern) {
                pattern.cache = [];
            });
        }
        this._draw();
    },

    /**
    * Returns all symbols for a given pattern as an array of LayerGroup
    */
    _getPatternLayers: function _getPatternLayers(pattern) {
        var _this4 = this;

        var directionPoints = void 0,
            symbols = void 0;
        return this._paths.map(function (path, i) {
            directionPoints = _this4._getDirectionPoints(i, pattern);
            return L.layerGroup(_this4._buildSymbols(path, pattern.symbolFactory, directionPoints));
        });
    },

    /**
    * Draw all patterns
    */
    _draw: function _draw() {
        var _this5 = this;

        this._patterns.forEach(function (pattern) {
            var layers = _this5._getPatternLayers(pattern);
            _this5.addLayer(L.layerGroup(layers));
        });
    }
});
/*
 * Allows compact syntax to be used
 */
L.polylineDecorator = function (paths, options) {
    return new L.PolylineDecorator(paths, options);
};

})));
