
L.GeometryUtil = {
    computeAngle: function(a, b) {
        return (Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI) + 90;
    },

    getPointPathPixelLength: function(pts) {
        var nbPts = pts.length;
        if(nbPts < 2) {
            return 0;
        }
        var dist = 0;
        var prevPt = pts[0], pt; 
        for(var i=1, l=pts.length; i<l; i++) {
            dist += prevPt.distanceTo(pt = pts[i]);
            prevPt = pt;
        } 
        return dist;
    },

    getPixelLength: function(pl, map) {
        var ll = (pl instanceof L.Polyline) ? pl.getLatLngs() : pl;
        var nbPts = ll.length;
        if(nbPts < 2) {
            return 0;
        }
        var dist = 0;
        var prevPt = map.latLngToLayerPoint(ll[0]), pt; 
        for(var i=1, l=ll.length; i<l; i++) {
            dist += prevPt.distanceTo(pt = map.latLngToLayerPoint(ll[i]));
            prevPt = pt;
        } 
        return dist;
    },

    /**
    * path: array of L.LatLng
    * offsetRatio: the ratio of the total pixel length where the pattern will start
    * repeatRatio: the ratio of the total pixel length between two points of the pattern 
    * map: the map, to access the current projection state
    */
    projectPatternOnPath: function (path, offsetRatio, repeatRatio, map) {
        var pathAsPoints = [];
        for(var i=0, l=path.length; i<l; i++) {
            pathAsPoints[i] = map.latLngToLayerPoint(path[i]);
        }
        // project the pattern as pixel points
        var pattern = this.projectPatternOnPointPath(pathAsPoints, offsetRatio, repeatRatio);
        // and convert it to latlngs;
        for(var i=0, l=pattern.length; i<l; i++) {
            pattern[i].latLng = map.layerPointToLatLng(pattern[i].pt);
        }        
        return pattern;
    },
    
    projectPatternOnPointPath: function (pts, offsetRatio, repeatRatio) {
        var positions = [];
        // 1. compute the absolute interval length in pixels
        var repeatIntervalLength = L.GeometryUtil.getPointPathPixelLength(pts) * repeatRatio;
        // 2. find the starting point by using the offsetRatio
        var previous = L.GeometryUtil.interpolateOnPointPath(pts, offsetRatio);
        positions.push(previous);
        if(repeatRatio > 0) {
            // 3. consider only the rest of the path, starting at the previous point
            var remainingPath = pts;
            remainingPath = remainingPath.slice(previous.predecessor);
            remainingPath[0] = previous.pt;
            var remainingLength = L.GeometryUtil.getPointPathPixelLength(remainingPath, map);
            // 4. project as a ratio of the remaining length,
            // and repeat while there is room for another point of the pattern
            while(repeatIntervalLength <= remainingLength) {
                previous = L.GeometryUtil.interpolateOnPointPath(remainingPath, repeatIntervalLength/remainingLength);
                positions.push(previous);
                remainingPath = remainingPath.slice(previous.predecessor);
                remainingPath[0] = previous.pt;
                remainingLength = L.GeometryUtil.getPointPathPixelLength(remainingPath, map);
            }
        }
        return positions;
    },

    /**
    * pts: array of L.Point
    * ratio: the ratio of the total length where the point should be computed
    * Returns null if ll has less than 2 LatLng, or an object with the following properties:
    *    latLng: the LatLng of the interpolated point
    *    predecessor: the index of the previous vertex on the path
    *    heading: the heading of the path at this point, in degrees
    */
    interpolateOnPointPath: function (pts, ratio) {
        var nbVertices = pts.length;

        if (nbVertices < 2) {
            return null;
        }
        // easy limit cases: ratio negative/zero => first vertex
        if (ratio <= 0) {
            return {
                pt: pts[0],
                predecessor: 0,
                heading: L.GeometryUtil.computeAngle(pts[0], pts[1])
            };
        }
        // ratio >=1 => last vertex
        if (ratio >= 1) {
            return {
                pt: pts[nbVertices - 1],
                predecessor: nbVertices - 1,
                heading: L.GeometryUtil.computeAngle(pts[nbVertices - 2], pts[nbVertices - 1])
            };
        }
        // 1-segment-only path => direct linear interpolation
        if (nbVertices == 2) {
            return {
                pt: L.GeometryUtil.interpolateBetweenPoints(pts[0], pts[1], ratio),
                predecessor: 0,
                heading: L.GeometryUtil.computeAngle(pts[0], pts[1])
            };
        }
            
        var pathLength = L.GeometryUtil.getPointPathPixelLength(pts);
        var a = b = pts[0],
            ratioA = ratioB = 0,
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
            pt: L.GeometryUtil.interpolateBetweenPoints(a, b, segmentRatio),
            predecessor: i-2,
            heading: L.GeometryUtil.computeAngle(a, b)
        }
    },
    
    /**
    * Finds the point which lies on the segment defined by points A and B,
    * at the given ratio of the distance from A to B, by linear interpolation. 
    */
    interpolateBetweenPoints: function (ptA, ptB, ratio) {
        if(ptB.x != ptA.x) {
            return new L.Point(
                (ptA.x * (1 - ratio)) + (ratio * ptB.x),
                (ptA.y * (1 - ratio)) + (ratio * ptB.y)
            );
        }
        // special case where points lie on the same vertical axis
        return new L.Point(ptA.x, ptA.y + (ptB.y - ptA.y) * ratio);
    }
}
﻿/**
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
        pathOptions: { }
    },
    
    initialize: function (options) {
        L.Util.setOptions(this, options);
        this.options.pathOptions.clickable = false;
    },

    buildSymbol: function(dirPoint, latLngs, map, index, total) {
        var opts = this.options;
        
        // for a dot, nothing more to compute
        if(opts.pixelSize <= 1) {
            return new L.Polyline([dirPoint.latLng, dirPoint.latLng], opts.pathOptions);
        }
        
        var midPoint = map.project(dirPoint.latLng);
        var angle = (-(dirPoint.heading - 90)) * L.LatLng.DEG_TO_RAD;
        var a = new L.Point(
                midPoint.x + opts.pixelSize * Math.cos(angle + Math.PI) / 2,
                midPoint.y + opts.pixelSize * Math.sin(angle) / 2
            );
        // compute second point by central symmetry to avoid unecessary cos/sin
        var b = midPoint.add(midPoint.subtract(a));
        return new L.Polyline([map.unproject(a), map.unproject(b)], opts.pathOptions);
    }
});

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
    
    initialize: function (options) {
        L.Util.setOptions(this, options);
        this.options.pathOptions.clickable = false;
    },

    buildSymbol: function(dirPoint, latLngs, map, index, total) {
        var opts = this.options;
        var path;
        if(opts.polygon) {
            path = new L.Polygon(this._buildArrowPath(dirPoint, map), opts.pathOptions);
        } else {
            path = new L.Polyline(this._buildArrowPath(dirPoint, map), opts.pathOptions);
        }
        return path;
    },
    
    _buildArrowPath: function (dirPoint, map) {
        var tipPoint = map.project(dirPoint.latLng);
        var direction = (-(dirPoint.heading - 90)) * L.LatLng.DEG_TO_RAD;
        var radianArrowAngle = this.options.headAngle / 2 * L.LatLng.DEG_TO_RAD; 
        
        var headAngle1 = direction + radianArrowAngle,
            headAngle2 = direction - radianArrowAngle;
        var arrowHead1 = new L.Point(
                tipPoint.x - this.options.pixelSize * Math.cos(headAngle1),
                tipPoint.y + this.options.pixelSize * Math.sin(headAngle1)),
            arrowHead2 = new L.Point(
                tipPoint.x - this.options.pixelSize * Math.cos(headAngle2),
                tipPoint.y + this.options.pixelSize * Math.sin(headAngle2));

        return [
            map.unproject(arrowHead1),
            dirPoint.latLng,
            map.unproject(arrowHead2)
        ];
    }
});

L.Symbol.Marker = L.Class.extend({
    isZoomDependant: false,

    options: {
        markerOptions: { }
    },
    
    initialize: function (options) {
        L.Util.setOptions(this, options);
        this.options.markerOptions.clickable = false;
        this.options.markerOptions.draggable = false;
    },

    buildSymbol: function(directionPoint, latLngs, map, index, total) {
        return new L.Marker(directionPoint.latLng, this.options.markerOptions);
    }
});



L.PolylineDecorator = L.LayerGroup.extend({
    options: {
        patterns: []
    },

    initialize: function(polyline, options) {
        L.LayerGroup.prototype.initialize.call(this);
        L.Util.setOptions(this, options);
        this._polyline = polyline;
        
        this._isZoomDependant = false;
        this._patterns = [];
        var pattern;
        // parse pattern definitions and precompute some values
        for(var i=0;i<this.options.patterns.length;i++) {
            pattern = this._parsePatternDef(this.options.patterns[i]);
            this._patterns.push(pattern);
            // determines if we have to recompute the pattern on each zoom change
            this._isZoomDependant = this._isZoomDependant
             || pattern.isOffsetInPixels
             || pattern.isRepeatInPixels 
             || pattern.symbolFactory.isZoomDependant;
        }
        this._directionPointCache = [];
    },

    /**
    * Parse the pattern definition
    */
    _parsePatternDef: function(patternDef, latLngs) {
        var pattern = {
            cache: [],
            symbolFactory: patternDef.symbol,
            isOffsetInPixels: false,
            isRepeatInPixels: false
        };
        
        // Parse offset and repeat values, managing the two cases:
        // absolute (in pixels) or relative (in percentage of the polyline length)
        if(typeof patternDef.offset === 'string' && patternDef.offset.indexOf('%') != -1) {
            pattern.offset = parseFloat(patternDef.offset) / 100;
        } else {
            pattern.offset = parseFloat(patternDef.offset);
            pattern.isOffsetInPixels = (pattern.offset > 0);
        }
        
        
        if(typeof patternDef.repeat === 'string' && patternDef.repeat.indexOf('%') != -1) {
            pattern.repeat = parseFloat(patternDef.repeat) / 100;
        } else {
            pattern.repeat = parseFloat(patternDef.repeat);
            pattern.isRepeatInPixels = (pattern.repeat > 0);
        }
        
        // TODO: 0 => not pixel dependant => 0%
        
        return(pattern);
    },

    onAdd: function (map) {
        this._map = map;
        this._draw();
        // listen to zoom changes to redraw pixel-spaced patterns
        if(this._isZoomDependant) {
            this._map.on('zoomend', this._softRedraw, this);
        }
    },

    onRemove: function (map) {
        // remove optional map zoom listener
        this._map.off('zoomend', this._softRedraw, this);
        L.LayerGroup.prototype.onRemove.call(this, map);
    },

    /**
    * Returns an array of ILayers object
    */
    _buildSymbols: function(symbolFactory, directionPoints) {
        var symbols = [];
        for(var i=0, l=directionPoints.length; i<l; i++) {
            symbols.push(symbolFactory.buildSymbol(directionPoints[i], this._latLngs, this._map, i, l));
        }
        return symbols;
    },

    /**
    * Select pairs of LatLng and heading angle,
    * that define positions and directions of the symbols
    * on the path 
    */
    _getDirectionPoints: function(pattern) {
        var dirPoints = pattern.cache[this._map.getZoom()];
        if(typeof dirPoints != 'undefined')
            return dirPoints;
        
        // polyline can be defined as a L.Polyline object or just an array of coordinates
        this._latLngs = (this._polyline instanceof L.Polyline) ? this._polyline.getLatLngs() : this._polyline;
        if(this._latLngs.length < 2) { return []; }

        var offset, repeat, pathPixelLength = null;
        if(pattern.isOffsetInPixels) {
            pathPixelLength =  L.GeometryUtil.getPixelLength(this._latLngs, this._map);
            offset = pattern.offset/pathPixelLength;
        } else {
            offset = pattern.offset;
        }
        if(pattern.isRepeatInPixels) {
            pathPixelLength = (pathPixelLength != null) ? pathPixelLength : L.GeometryUtil.getPixelLength(this._latLngs, this._map);
            repeat = pattern.repeat/pathPixelLength; 
        } else {
            repeat = pattern.repeat;
        }
        dirPoints = L.GeometryUtil.projectPatternOnPath(this._latLngs, offset, repeat, this._map);
        pattern.cache[this._map.getZoom()] = dirPoints;
        
        return dirPoints;
    },

    /**
    * Public redraw, invalidating the cache.
    */
    redraw: function() {
        this._redraw(true);
    },
    
    /**
    * "Soft" redraw, called internally for example on zoom changes,
    * keeping the cache. 
    */
    _softRedraw: function() {
        this._redraw(false);
    },
    
    _redraw: function(clearCache) {
        this.clearLayers();
        if(clearCache) {
            for(var i=0; i<this._patterns.length; i++) {
                this._patterns[i].cache = [];
            }
        }
        this._draw();
    },
    
    /**
    * Draw a single pattern
    */
    _drawPattern: function(pattern) {
        var directionPoints = this._getDirectionPoints(pattern);
        var symbols = this._buildSymbols(pattern.symbolFactory, directionPoints);
        for (var i=0; i < symbols.length; i++) {
            this.addLayer(symbols[i]);
        }
    },

    /**
    * Draw all patterns
    */
    _draw: function () {
        for(var i=0; i<this._patterns.length; i++) {
            this._drawPattern(this._patterns[i]);
        }
    }
});
/*
 * Allows compact syntax to be used
 */
L.polylineDecorator = function (polyline, options) {
    return new L.PolylineDecorator(polyline, options);
};


