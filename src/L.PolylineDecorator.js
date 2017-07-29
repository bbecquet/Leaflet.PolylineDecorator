import './L.PolylineDecoratorUtil.js';
import './L.Symbol.js';

L.PolylineDecorator = L.FeatureGroup.extend({
    options: {
        patterns: []
    },

    initialize: function(paths, options) {
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
    _initPaths: function(p) {
        this._paths = [];
        if (p instanceof L.Polyline) {
            this._initPath(p.getLatLngs(), (p instanceof L.Polygon));
        } else if (L.Util.isArray(p) && p.length > 0) {
            if (p[0] instanceof L.Polyline) {
                p.forEach(singleP => {
                    this._initPath(singleP, (single instanceof L.Polygon));
                });
            } else {
                this._initPath(p);
            }
        }
    },

    _isCoordArray: function(ll) {
        return (L.Util.isArray(ll) && ll.length > 0 && (
            ll[0] instanceof L.LatLng ||
            (L.Util.isArray(ll[0]) && ll[0].length == 2 && typeof ll[0][0] === 'number')
        ));
    },

    _initPath: function(path, isPolygon) {
        // It may still be an array of array of coordinates
        // (ex: polygon with rings)
        const latLngs = this._isCoordArray(path) ? [path] : path;

        for(let i=0; i<latLngs.length; i++) {
            // As of Leaflet >= v0.6, last polygon vertex (=first) isn't repeated.
            // Our algorithm needs it, so we add it back explicitly.
            if (isPolygon) {
                latLngs[i].push(latLngs[i][0]);
            }
            this._paths.push(latLngs[i]);
        }
    },

    _initPatterns: function() {
        this._isZoomDependant = false;
        this._patterns = [];
        let pattern;
        // parse pattern definitions and precompute some values
        this.options.patterns.forEach(patternDef => {
            pattern = this._parsePatternDef(patternDef);
            this._patterns.push(pattern);
            // determines if we have to recompute the pattern on each zoom change
            this._isZoomDependant = this._isZoomDependant ||
                pattern.isOffsetInPixels ||
                pattern.isEndOffsetInPixels ||
                pattern.isRepeatInPixels ||
                pattern.symbolFactory.isZoomDependant;
        });
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
    * Changes the patterns used by this decorator
    * and redraws the new one.
    */
    setPaths: function(paths) {
        this._initPaths(paths);
        this.redraw();
    },

    _parseRelativeOrAbsoluteValue: function(value) {
        if (typeof value === 'string' && value.indexOf('%') !== -1) {
            return {
                value: parseFloat(value) / 100,
                isInPixels: false,
            };
        }
        const parsedValue = value ? parseFloat(value) : 0;
        return {
            value: parsedValue,
            isInPixels: parsedValue > 0,
        };
    },

    /**
    * Parse the pattern definition
    */
    _parsePatternDef: function(patternDef, latLngs) {
        return {
            cache: [],
            symbolFactory: patternDef.symbol,
            // Parse offset and repeat values, managing the two cases:
            // absolute (in pixels) or relative (in percentage of the polyline length)
            offset: this._parseRelativeOrAbsoluteValue(patternDef.offset),
            endOffset: this._parseRelativeOrAbsoluteValue(patternDef.endOffset),
            repeat: this._parseRelativeOrAbsoluteValue(patternDef.repeat),
        };
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
        this._map = null;
        L.LayerGroup.prototype.onRemove.call(this, map);
    },

    /**
    * Returns an array of ILayers object
    */
    _buildSymbols: function(latLngs, symbolFactory, directionPoints) {
        return directionPoints.map((directionPoint, i) =>
            symbolFactory.buildSymbol(directionPoint, latLngs, this._map, i, directionPoints.length)
        );
    },

    _getCache: function(pattern, zoom, pathIndex) {
        const zoomCache = pattern.cache[zoom];
        if (!zoomCache) {
            pattern.cache[zoom] = [];
            return null;
        }
        return zoomCache[pathIndex];
    },

    _asRatioToPathLength: function({ value, isInPixels }, totalPathLength) {
        return isInPixels ? value / totalPathLength : value;
    },

    /**
    * Select pairs of LatLng and heading angle,
    * that define positions and directions of the symbols
    * on the path
    */
    _getDirectionPoints: function(pathIndex, pattern) {
        const zoom = this._map.getZoom();
        const cachedDirPoints = this._getCache(pattern, zoom, pathIndex);
        if (cachedDirPoints) {
            return cachedDirPoints;
        }

        const latLngs = this._paths[pathIndex];
        if (latLngs.length < 2) {
            return [];
        }

        const pathPixelLength = L.PolylineDecoratorUtil.getPixelLength(latLngs, this._map);
        const ratios = {
            offset: this._asRatioToPathLength(pattern.offset, pathPixelLength),
            endOffset: this._asRatioToPathLength(pattern.endOffset, pathPixelLength),
            repeat: this._asRatioToPathLength(pattern.repeat, pathPixelLength),
        };

        const dirPoints = L.PolylineDecoratorUtil.projectPatternOnPath(latLngs, ratios, this._map);
        // save in cache to avoid recomputing this
        pattern.cache[zoom][pathIndex] = dirPoints;

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
        if (!this._map) {
            return;
        }
        this.clearLayers();
        if (clearCache) {
            this._patterns.forEach(pattern => { pattern.cache = []; });
        }
        this._draw();
    },

    /**
    * Returns all symbols for a given pattern as an array of LayerGroup
    */
    _getPatternLayers: function(pattern) {
        let directionPoints, symbols;
        return this._paths.map((path, i) => {
            directionPoints = this._getDirectionPoints(i, pattern);
            return L.layerGroup(this._buildSymbols(path, pattern.symbolFactory, directionPoints));
        });
    },

    /**
    * Draw all patterns
    */
    _draw: function () {
        this._patterns.forEach(pattern => {
            const layers = this._getPatternLayers(pattern);
            this.addLayer(L.layerGroup(layers));
        });
    }
});
/*
 * Allows compact syntax to be used
 */
L.polylineDecorator = function (paths, options) {
    return new L.PolylineDecorator(paths, options);
};
