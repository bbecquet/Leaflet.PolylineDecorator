
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
