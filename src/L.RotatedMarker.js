L.RotatedMarker = L.Marker.extend({
    options: {
        angle: 0
    },
    _setPos: function (pos) {
        L.Marker.prototype._setPos.call(this, pos);
        if (!L.Browser.ie || L.Browser.ie3d) {
            var rotate = ' rotate(' + this.options.angle + 'deg)';
            this._icon.style.MozTransform += rotate;
            this._icon.style.MsTransform += rotate;
            this._icon.style.OTransform += rotate;
            this._icon.style.WebkitTransform += rotate;
        } else {
            // IE6, IE7, IE8
            var rad = this.options.angle * L.LatLng.DEG_TO_RAD,
                costheta = Math.cos(rad),
                sintheta = Math.sin(rad);
            this._icon.style.filter += ' progid:DXImageTransform.Microsoft.Matrix(sizingMethod=\'auto expand\', M11=' + costheta + ', M12=' + (-sintheta) + ', M21=' + sintheta + ', M22=' + costheta + ')';
        }
    }
});