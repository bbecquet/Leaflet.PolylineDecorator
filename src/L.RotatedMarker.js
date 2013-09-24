L.RotatedMarker = L.Marker.extend({
    options: {
        angle: 0
    },
    statics: {
        // determine the best and only CSS transform rule to use for this browser
        bestTransform: L.DomUtil.testProp([
            'transform',
            'WebkitTransform',
            'msTransform',
            'MozTransform',
            'OTransform'
        ])
    },
    _setPos: function (pos) {
        L.Marker.prototype._setPos.call(this, pos);
        
        var rotate = ' rotate(' + this.options.angle + 'deg)';
        if (L.RotatedMarker.bestTransform) {
            // use the CSS transform rule if available
            this._icon.style[L.RotatedMarker.bestTransform] += rotate;
        } else if(L.Browser.ie) {
            // fallback for IE6, IE7, IE8
            var rad = this.options.angle * L.LatLng.DEG_TO_RAD,
                costheta = Math.cos(rad),
                sintheta = Math.sin(rad);
            this._icon.style.filter += ' progid:DXImageTransform.Microsoft.Matrix(sizingMethod=\'auto expand\', M11=' + 
                costheta + ', M12=' + (-sintheta) + ', M21=' + sintheta + ', M22=' + costheta + ')';                
        }
    }
});

L.rotatedMarker = function (pos, options) {
    return new L.RotatedMarker(pos, options);
};