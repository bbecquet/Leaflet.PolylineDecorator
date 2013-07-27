
L.PolylineDecorator = L.LayerGroup.extend({
    options: {
        patterns: []
    },

    initialize: function(polyline, options) {
        L.LayerGroup.prototype.initialize.call(this);
        L.Util.setOptions(this, options);
        this._polyline = polyline;
        this._directionPointCache = [];
        this._initPatterns();
    },

    _initPatterns: function() {
        this._directionPointCache = [];
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
    },

    /**
    * Changes the patterns used by this decorator 
    * and redraws the new one.
    */
    setPatterns: function(patterns) {
        this.options.patterns = patterns;
        this._initPatterns();
        this._softRedraw();
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
        // as of Leaflet >= v0.6, last polygon vertex (=first) isn't repeated.
        // our algorithm needs it, so we add it back explicitely.
        if(this._polyline instanceof L.Polygon) {
            this._latLngs.push(this._latLngs[0]);
        }

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


