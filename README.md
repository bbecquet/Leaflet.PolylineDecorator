# Leaflet PolylineDecorator

A Leaflet plug-in to define and draw patterns on existing Polylines or along coordinate paths.

## Examples

* Dashed or dotted lines
* Arrows
* Markers following line
* Works on Polygons too! (easy, as Polygon extends Polyline)
* And much more, as you have full control of the way symbols are generated

The `polyline` parameter can be a single array of `L.LatLng` or, with Leaflet's simplified syntax, an array of 2-cells arrays of coordinates. 
It is useful if you don't want to actually display a polyline, but just a pattern following coordinates, like a dotted line.
Although for simple cases, you should probably use instead the `dashArray` property of `L.Path`, as it's natively drawn by the browser. 

