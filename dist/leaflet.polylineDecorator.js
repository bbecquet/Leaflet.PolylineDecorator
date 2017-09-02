(function (global, factory) {
	typeof exports === 'object' && typeof module !== 'undefined' ? factory() :
	typeof define === 'function' && define.amd ? define(factory) :
	(factory());
}(this, (function () { 'use strict';

var computeSegmentHeading = function computeSegmentHeading(a, b) {
    return (Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI + 90 + 360) % 360;
};

var getPointPathPixelLength = function getPointPathPixelLength(pts) {
    return pts.reduce(function (distance, pt, i) {
        return i === 0 ? 0 : distance + pt.distanceTo(pts[i - 1]);
    }, 0);
};

var asRatioToPathLength = function asRatioToPathLength(_ref, totalPathLength) {
    var value = _ref.value,
        isInPixels = _ref.isInPixels;
    return isInPixels ? value / totalPathLength : value;
};

function parseRelativeOrAbsoluteValue(value) {
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
}

function projectPatternOnPath(latLngs, pattern, map) {
    var pathAsPoints = latLngs.map(function (latLng) {
        return map.project(latLng);
    });
    var pathPixelLength = getPointPathPixelLength(pathAsPoints);

    if (pathPixelLength === 0) {
        return [];
    }

    var ratios = {
        offset: asRatioToPathLength(pattern.offset, pathPixelLength),
        endOffset: asRatioToPathLength(pattern.endOffset, pathPixelLength),
        repeat: asRatioToPathLength(pattern.repeat, pathPixelLength)
    };

    return projectPatternOnPointPath(pathAsPoints, ratios).map(function (point) {
        return {
            latLng: map.unproject(point.pt),
            heading: point.heading
        };
    });
}

function pointsToSegments(pts) {
    var segments = [];
    var a = void 0,
        b = void 0,
        distA = 0,
        distAB = void 0;
    for (var i = 1, l = pts.length; i < l; i++) {
        a = pts[i - 1];
        b = pts[i];
        distAB = a.distanceTo(b);
        segments.push({
            a: a,
            b: b,
            distA: distA, // distances from the start of the polyline
            distB: distA + distAB,
            heading: computeSegmentHeading(a, b)
        });
        distA += distAB;
    }
    return segments;
}

function projectPatternOnPointPath(pts, _ref2) {
    var offset = _ref2.offset,
        endOffset = _ref2.endOffset,
        repeat = _ref2.repeat;

    // 1. split the path as segment infos
    var segments = pointsToSegments(pts);
    var nbSegments = segments.length;

    if (nbSegments === 0) {
        return [];
    }

    var totalPathLength = segments[nbSegments - 1].distB;
    var repeatIntervalPixels = totalPathLength * repeat;
    var startOffsetPixels = offset > 0 ? totalPathLength * offset : 0;
    var endOffsetPixels = endOffset > 0 ? totalPathLength * endOffset : 0;

    // 2. generate the positions of the pattern as offsets from the polygon start
    var positionOffsets = [];
    var positionOffset = startOffsetPixels;
    do {
        positionOffsets.push(positionOffset);
        positionOffset += repeatIntervalPixels;
    } while (repeatIntervalPixels > 0 && positionOffset < totalPathLength - endOffsetPixels);

    // 3. projects offsets to segments
    var segmentIndex = 0;
    var segment = segments[0];
    return positionOffsets.map(function (positionOffset) {
        // find the segment matching the offset,
        // starting from the previous one as offsets are ordered
        while (positionOffset > segment.distB && segmentIndex < nbSegments - 1) {
            segmentIndex++;
            segment = segments[segmentIndex];
        }

        var segmentRatio = (positionOffset - segment.distA) / (segment.distB - segment.distA);
        return {
            pt: interpolateBetweenPoints(segment.a, segment.b, segmentRatio),
            heading: segment.heading
        };
    });
}

/**
* Finds the point which lies on the segment defined by points A and B,
* at the given ratio of the distance from A to B, by linear interpolation.
*/
function interpolateBetweenPoints(ptA, ptB, ratio) {
    if (ptB.x !== ptA.x) {
        return L.point(ptA.x + ratio * (ptB.x - ptA.x), ptA.y + ratio * (ptB.y - ptA.y));
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
    options: {
        markerOptions: {},
        rotate: false
    },

    initialize: function initialize(options) {
        L.Util.setOptions(this, options);
        this.options.markerOptions.clickable = false;
        this.options.markerOptions.draggable = false;
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

        this._patterns = [];
        var pattern = void 0;
        // parse pattern definitions and precompute some values
        this.options.patterns.forEach(function (patternDef) {
            pattern = _this2._parsePatternDef(patternDef);
            _this2._patterns.push(pattern);
        });
    },

    /**
    * Changes the patterns used by this decorator
    * and redraws the new one.
    */
    setPatterns: function setPatterns(patterns) {
        this.options.patterns = patterns;
        this._initPatterns();
        this.redraw();
    },

    /**
    * Changes the patterns used by this decorator
    * and redraws the new one.
    */
    setPaths: function setPaths(paths) {
        this._initPaths(paths);
        this.redraw();
    },

    /**
    * Parse the pattern definition
    */
    _parsePatternDef: function _parsePatternDef(patternDef, latLngs) {
        return {
            symbolFactory: patternDef.symbol,
            // Parse offset and repeat values, managing the two cases:
            // absolute (in pixels) or relative (in percentage of the polyline length)
            offset: parseRelativeOrAbsoluteValue(patternDef.offset),
            endOffset: parseRelativeOrAbsoluteValue(patternDef.endOffset),
            repeat: parseRelativeOrAbsoluteValue(patternDef.repeat)
        };
    },

    onAdd: function onAdd(map) {
        this._map = map;
        this._draw();
        this._map.on('moveend', this.redraw, this);
    },

    onRemove: function onRemove(map) {
        this._map.off('moveend', this.redraw, this);
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

    /**
    * Select pairs of LatLng and heading angle,
    * that define positions and directions of the symbols
    * on the path
    */
    _getDirectionPoints: function _getDirectionPoints(pathIndex, pattern) {
        var latLngs = this._paths[pathIndex];
        if (latLngs.length < 2) {
            return [];
        }

        return projectPatternOnPath(latLngs, pattern, this._map);
    },

    /**
    * Public redraw, invalidating the cache.
    */
    redraw: function redraw() {
        if (!this._map) {
            return;
        }
        this.clearLayers();
        this._draw();
    },

    /**
    * Returns all symbols for a given pattern as an array of LayerGroup
    */
    _getPatternLayers: function _getPatternLayers(pattern) {
        var _this4 = this;

        var directionPoints = void 0,
            symbols = void 0;
        var mapBounds = this._map.getBounds().pad(0.1);
        return this._paths.map(function (path, i) {
            directionPoints = _this4._getDirectionPoints(i, pattern)
            // filter out invisible points
            .filter(function (point) {
                return mapBounds.contains(point.latLng);
            });

            return L.layerGroup(_this4._buildSymbols(path, pattern.symbolFactory, directionPoints));
        });
    },

    /**
    * Draw all patterns
    */
    _draw: function _draw() {
        var _this5 = this;

        this._patterns.map(function (pattern) {
            return _this5._getPatternLayers(pattern);
        }).forEach(function (layers) {
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
