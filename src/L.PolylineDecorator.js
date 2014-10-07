
L.PolylineDecorator = L.LayerGroup.extend({
    options: {
        patterns: []
    },

    initialize: function(paths, options) {
        L.LayerGroup.prototype.initialize.call(this);
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
    _initPaths: function(p) {
        this._paths = [];
        var isPolygon = false;
        if(p instanceof L.Polyline) {
            this._initPath(p.getLatLngs(), (p instanceof L.Polygon));
        } else if(L.Util.isArray(p) && p.length > 0) {
            if(p[0] instanceof L.Polyline) {
                for(var i=0; i<p.length; i++) {
                    this._initPath(p[i].getLatLngs(), (p[i] instanceof L.Polygon));
                }
            } else {
                this._initPath(p);
            }
        }
    },

    _isCoordArray: function(ll) {
        return(L.Util.isArray(ll) && ll.length > 0 && (
            ll[0] instanceof L.LatLng || 
            (L.Util.isArray(ll[0]) && ll[0].length == 2 && typeof ll[0][0] === 'number')
        ));
    },

    _initPath: function(path, isPolygon) {
        var latLngs;
        // It may still be an array of array of coordinates
        // (ex: polygon with rings)
        if(this._isCoordArray(path)) {
            latLngs = [path];
        } else {
            latLngs = path;
        }
        for(var i=0; i<latLngs.length; i++) {
            // As of Leaflet >= v0.6, last polygon vertex (=first) isn't repeated.
            // Our algorithm needs it, so we add it back explicitly.
            if(isPolygon) {
                latLngs[i].push(latLngs[i][0]);
            }
            this._paths.push(latLngs[i]);
        }
    },   

    _initPatterns: function() {
        this._isZoomDependant = false;
        this._patterns = [];
        var pattern;
        // parse pattern definitions and precompute some values
        for(var i=0;i<this.options.patterns.length;i++) {
            pattern = this._parsePatternDef(this.options.patterns[i]);
            this._patterns.push(pattern);
            // determines if we have to recompute the pattern on each zoom change
            this._isZoomDependant = this._isZoomDependant ||
                pattern.isOffsetInPixels ||
                pattern.isRepeatInPixels ||
                pattern.symbolFactory.isZoomDependant;
        }
    },

    /**
    * Changes the patterns used by this decorator 
    * and redraws the new one.
    */
    setPatterns: function(patterns) {
        this.options.patterns = patterns;
        this._initPatterns();
        this.redraw();
    },

    /**
    * Changes the patterns used by this decorator 
    * and redraws the new one.
    */
    setPaths: function(paths) {
        this._initPaths(paths);
        this.redraw();
    },

    /**
    * Parse the pattern definition
    */
    _parsePatternDef: function(patternDef, latLngs) {
        var pattern = {
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
            this._map.on('moveend', this.redraw, this);
        }
    },

    onRemove: function (map) {
        // remove optional map zoom listener
        this._map.off('moveend', this.redraw, this);
        this._map = null;
        L.LayerGroup.prototype.onRemove.call(this, map);
    },

    /**
    * Returns an array of ILayers object
    */
    _buildSymbols: function(latLngs, symbolFactory, directionPoints) {
        var symbols = [];
        for(var i=0, l=directionPoints.length; i<l; i++) {
            symbols.push(symbolFactory.buildSymbol(directionPoints[i], latLngs, this._map, i, l));
        }
        return symbols;
    },

    /**
    * Select pairs of LatLng and heading angle,
    * that define positions and directions of the symbols
    * on the path 
    */
    _getDirectionPoints: function(pathIndex, pattern) {
        var zoom = this._map.getZoom();
        var dirPoints = [];

        var pxLength = null,
            latLngs = this._paths[pathIndex];
        var map = this._map;

        var pxBounds = map.getPixelBounds();
        // TODO: Buffer pxBounds to prevent large symbols being removed when
        // rendered close to the border of the viewport. The user should maybe
        // set the buffer?
        var pxPath = latLngs.map(function (latLng) {
            return map.project(latLng);
        });

        var clippedPxPaths = L.LineUtil.PolylineDecorator.clipPath(pxPath, pxBounds);

        if (clippedPxPaths.length > 0) {
            pxLength = L.LineUtil.PolylineDecorator.getLength(pxPath);
        }

        clippedPxPaths.forEach(function (clipped) {
            var offset, repeat,
                clippedLength = L.LineUtil.PolylineDecorator.getLength(clipped.coords);

            repeat = this._calcRepeat(pattern, pxLength, clippedLength);
            offset = this._calcOffset(pattern, pxLength, clippedLength, clipped.offset, repeat * clippedLength);

            if (offset <= 1) {
                var coordsAsLatLngs = clipped.coords.map(function (p) {
                    return map.unproject(p);
                });
                dirPoints = dirPoints.concat(L.LineUtil.PolylineDecorator.projectPatternOnPath(coordsAsLatLngs, clipped.coords, offset, repeat, map));
            }

        }, this);

        return dirPoints;
    },

    _calcOffset: function (pattern, pxLength, clippedLength, clippedOffset, pxRepeat) {
        var pxOffset,
            offset;
        // Calc pattern offset in pixels
        if (pattern.isOffsetInPixels) {
            pxOffset = pattern.offset;
        } else {
            pxOffset = pattern.offset * pxLength;
        }
        // Calc pattern offset for the clipped path
        if (clippedOffset <= pxOffset) {
            offset = pxOffset - clippedOffset;
        } else {
            offset = Math.ceil((clippedOffset - pxOffset) / pxRepeat) * pxRepeat - (clippedOffset - pxOffset);
        }
        // Return pattern offset in percent
        return offset / clippedLength;
    },

    _calcRepeat: function (pattern, pxLength, clippedLength) {
        if(pattern.isRepeatInPixels) {
            return pattern.repeat / clippedLength;
        } else {
            return pattern.repeat * pxLength / clippedLength;
        }
    },

    redraw: function() {
        if(this._map === null)
            return;
        this.clearLayers();
        this._draw();
    },
    
    /**
    * Draw a single pattern
    */
    _drawPattern: function(pattern) {
        var directionPoints, symbols;
        for(var i=0; i < this._paths.length; i++) {
            directionPoints = this._getDirectionPoints(i, pattern);
            symbols = this._buildSymbols(this._paths[i], pattern.symbolFactory, directionPoints);
            for(var j=0; j < symbols.length; j++) {
                this.addLayer(symbols[j]);
            }
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
L.polylineDecorator = function (paths, options) {
    return new L.PolylineDecorator(paths, options);
};
