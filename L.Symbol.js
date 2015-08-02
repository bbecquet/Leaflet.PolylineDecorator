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
        pathOptions: { }
    },
    
    initialize: function (options) {
        L.Util.setOptions(this, options);
        this.options.pathOptions.clickable = false;
    },

    buildSymbol: function(dirPoint, latLngs, map, index, total) {
        var opts = this.options,
            d2r = Math.PI / 180;
        
        // for a dot, nothing more to compute
        if(opts.pixelSize <= 1) {
            return new L.Polyline([dirPoint.latLng, dirPoint.latLng], opts.pathOptions);
        }
        
        var midPoint = map.project(dirPoint.latLng);
        var angle = (-(dirPoint.heading - 90)) * d2r;
        var a = new L.Point(
                midPoint.x + opts.pixelSize * Math.cos(angle + Math.PI) / 2,
                midPoint.y + opts.pixelSize * Math.sin(angle) / 2
            );
        // compute second point by central symmetry to avoid unecessary cos/sin
        var b = midPoint.add(midPoint.subtract(a));
        return new L.Polyline([map.unproject(a), map.unproject(b)], opts.pathOptions);
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
        var d2r = Math.PI / 180;
        var tipPoint = map.project(dirPoint.latLng);
        var direction = (-(dirPoint.heading - 90)) * d2r;
        var radianArrowAngle = this.options.headAngle / 2 * d2r;
        
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

L.Symbol.arrowHead = function (options) {
    return new L.Symbol.ArrowHead(options);
};

L.Symbol.Marker = L.Class.extend({
    isZoomDependant: false,

    options: {
        markerOptions: { },
        rotate: false
    },
    
    initialize: function (options) {
        L.Util.setOptions(this, options);
        this.options.markerOptions.clickable = false;
        this.options.markerOptions.draggable = false;
        this.isZoomDependant = (L.Browser.ie && this.options.rotate);
    },

    buildSymbol: function(directionPoint, latLngs, map, index, total) {
        if(!this.options.rotate) {
            return new L.Marker(directionPoint.latLng, this.options.markerOptions);
        }
        else {
            this.options.markerOptions.angle = directionPoint.heading;
            return new L.RotatedMarker(directionPoint.latLng, this.options.markerOptions);
        }
    }
});

L.Symbol.marker = function (options) {
    return new L.Symbol.Marker(options);
};

L.Symbol.GradientDash = L.Class.extend({
    isZoomDependant: true,
    options: {
        pixelSize: 10,
        pathOptions: { },
		startColor: '#ff0000',
		endColor: '#00ff00'
    },
    
	_totalDistance: 0,
	_isLatLngsProcessed: false,
	_colorMap: [],
	_startColor: undefined,
	_endColor: undefined,
	
	// 0 <= percent <= 1
	_getColor: function(percent) {
	   if(percent < 0) percent = 0;
	   if(percent > 1) percent = 1;
	   // get colors
	   var start_red = this._endColor.r, start_green = this._endColor.g, start_blue = this._endColor.b;
	   var end_red = this._startColor.r, end_green = this._startColor.g, end_blue = this._startColor.b;

	   // calculate new color
	   var diff_red = end_red - start_red;
	   var diff_green = end_green - start_green;
	   var diff_blue = end_blue - start_blue;

	   diff_red = ( (diff_red * percent) + start_red ).toString(16).split('.')[0];
	   diff_green = ( (diff_green * percent) + start_green ).toString(16).split('.')[0];
	   diff_blue = ( (diff_blue * percent) + start_blue ).toString(16).split('.')[0];

	   // ensure 2 digits by color
	   if (diff_red.length == 1) diff_red = '0' + diff_red;
	   if (diff_green.length == 1) diff_green = '0' + diff_green;
	   if (diff_blue.length == 1) diff_blue = '0' + diff_blue;

	   return '#' + diff_red + diff_green + diff_blue;
	 },
	
	_hexToRgb: function(hex){
		// Expand shorthand form (e.g. "03F") to full form (e.g. "0033FF")
		var shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
		hex = hex.replace(shorthandRegex, function(m, r, g, b) {
			return r + r + g + g + b + b;
		});

		var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
		return result ? {
			r: parseInt(result[1], 16),
			g: parseInt(result[2], 16),
			b: parseInt(result[3], 16)
		} : null;
	},
	
    initialize: function (options) {
        L.Util.setOptions(this, options);
        this.options.pathOptions.clickable = false;
		this._startColor = this._hexToRgb(this.options.startColor);
		this._endColor = this._hexToRgb(this.options.endColor);
    },

    buildSymbol: function(dirPoint, latLngs, map, index, total) {
        var opts = this.options,
            d2r = Math.PI / 180;
        
        // for a dot, nothing more to compute
        if(opts.pixelSize <= 1) {
            return new L.Polyline([dirPoint.latLng, dirPoint.latLng], opts.pathOptions);
        }
        
        var midPoint = map.project(dirPoint.latLng);
        var angle = (-(dirPoint.heading - 90)) * d2r;
        var a = new L.Point(
                midPoint.x + opts.pixelSize * Math.cos(angle + Math.PI) / 2,
                midPoint.y + opts.pixelSize * Math.sin(angle) / 2
            );
        // compute second point by central symmetry to avoid unecessary cos/sin
        var b = midPoint.add(midPoint.subtract(a));
		opts.pathOptions.color = this._getColor((index+1)/total);
        return new L.Polyline([map.unproject(a), map.unproject(b)], opts.pathOptions);
    }
});

L.Symbol.gradientDash = function (options) {
    return new L.Symbol.GradientDash(options);
};

