
L.LineUtil.PolylineDecorator = {
    computeAngle: function(a, b) {
        return (Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI) + 90;
    },

    getPointPathPixelLength: function(pts) {
        var nbPts = pts.length;
        if(nbPts < 2) {
            return 0;
        }
        var dist = 0,
            prevPt = pts[0],
            pt;
        for(var i=1; i<nbPts; i++) {
            dist += prevPt.distanceTo(pt = pts[i]);
            prevPt = pt;
        } 
        return dist;
    },

    /**
    * Calculates the length of the given path
    * path: array of L.Point objects (pixel coordinates)
    * Returns the length of the given path
    */
    getLength: function(path) {
        var numPoints = path.length;
        if (numPoints < 2) {
            return 0;
        }
        var i, len = 0, pt, prevPt = path[0];
        for (i = 1; i < numPoints; ++i) {
            len += prevPt.distanceTo(pt = path[i]);
            prevPt = pt;
        }
        return len;
    },

    getPixelLength: function(pl, map) {
        var ll = (pl instanceof L.Polyline) ? pl.getLatLngs() : pl,
            nbPts = ll.length;
        if(nbPts < 2) {
            return 0;
        }
        var dist = 0,
            prevPt = map.project(ll[0]), pt; 
        for(var i=1; i<nbPts; i++) {
            dist += prevPt.distanceTo(pt = map.project(ll[i]));
            prevPt = pt;
        } 
        return dist;
    },

    /**
    * path: array of L.LatLng
    * pathAsPoints: array of L.Point
    * offsetRatio: the ratio of the total pixel length where the pattern will start
    * repeatRatio: the ratio of the total pixel length between two points of the pattern 
    * map: the map, to access the current projection state
    */
    projectPatternOnPath: function (path, pathAsPoints, offsetRatio, repeatRatio, map) {
        var i;
        // project the pattern as pixel points
        var pattern = this.projectPatternOnPointPath(pathAsPoints, offsetRatio, repeatRatio);
        // and convert it to latlngs;
        for(i=0, l=pattern.length; i<l; i++) {
            pattern[i].latLng = map.unproject(pattern[i].pt);
        }        
        return pattern;
    },
    
    projectPatternOnPointPath: function (pts, offsetRatio, repeatRatio) {
        var positions = [];
        // 1. compute the absolute interval length in pixels
        var repeatIntervalLength = this.getPointPathPixelLength(pts) * repeatRatio;
        // 2. find the starting point by using the offsetRatio
        var previous = this.interpolateOnPointPath(pts, offsetRatio);
        positions.push(previous);
        if(repeatRatio > 0) {
            // 3. consider only the rest of the path, starting at the previous point
            var remainingPath = pts;
            remainingPath = remainingPath.slice(previous.predecessor);
            remainingPath[0] = previous.pt;
            var remainingLength = this.getPointPathPixelLength(remainingPath);
            // 4. project as a ratio of the remaining length,
            // and repeat while there is room for another point of the pattern
            while(repeatIntervalLength <= remainingLength) {
                previous = this.interpolateOnPointPath(remainingPath, repeatIntervalLength/remainingLength);
                positions.push(previous);
                remainingPath = remainingPath.slice(previous.predecessor);
                remainingPath[0] = previous.pt;
                remainingLength = this.getPointPathPixelLength(remainingPath);
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
                heading: this.computeAngle(pts[0], pts[1])
            };
        }
        // ratio >=1 => last vertex
        if (ratio >= 1) {
            return {
                pt: pts[nbVertices - 1],
                predecessor: nbVertices - 1,
                heading: this.computeAngle(pts[nbVertices - 2], pts[nbVertices - 1])
            };
        }
        // 1-segment-only path => direct linear interpolation
        if (nbVertices == 2) {
            return {
                pt: this.interpolateBetweenPoints(pts[0], pts[1], ratio),
                predecessor: 0,
                heading: this.computeAngle(pts[0], pts[1])
            };
        }
            
        var pathLength = this.getPointPathPixelLength(pts);
        var a = pts[0], b = a,
            ratioA = 0, ratioB = 0,
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
            pt: this.interpolateBetweenPoints(a, b, segmentRatio),
            predecessor: i-2,
            heading: this.computeAngle(a, b)
        };
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
    },

    /**
    * Returns the resulting paths when clipping the given path with the given
    * bounds
    * path: array of Point objects (pixel coordinates)
    * bounds: pixel bounds
    * Returns array of clipped paths. Each clipped path carries its offset
    * from the beginning of the source path
    */
    clipPath: function (path, bounds) {
        var pathBounds = L.bounds(path);
        if (bounds.contains(pathBounds)) {
            return [{
                coords: path,
                offset: 0
            }];
        }

        var paths = [],
            i,
            distance = 0,
            p;

        for (i = 0; i < (path.length - 1); ++i) {
            // Assumes L.LineUtil.clipSegment return false if the line is
            // outside the bounds
            // Assumes that L.LineUtil.clipSegment does not modify p1/p2
            // directly
            var clipped = L.LineUtil.clipSegment(path[i], path[i + 1], bounds);
            if (clipped !== false) {

                var p1 = clipped[0],
                    p2 = clipped[1],
                    distInSegment = p1.distanceTo(path[i]);

                // Start new path
                if (p === undefined) {
                    p = {
                        coords: [p1, p2],
                        offset: distance + distInSegment
                    };
                }

                // Continue existing path?
                else {

                    // Add coordinate to already started path
                    if (p.coords[p.coords.length - 1].equals(p1)) {
                        p.coords.push(p2);
                    }

                    // End started path, and start a new path
                    else {
                        paths.push(p);
                        p = {
                            coords: [p1, p2],
                            offset: distance + distInSegment
                        };
                    }

                }

            }

            // Keep track of the distance to the current point
            distance += path[i].distanceTo(path[i + 1]);

        }

        if (p !== undefined) {
            paths.push(p);
        }

        return paths;
    }

};
