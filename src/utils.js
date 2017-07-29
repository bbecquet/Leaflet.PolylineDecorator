function computeAngle(a, b) {
    return (Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI) + 90;
}

function getPointPathPixelLength(pts) {
    return pts.reduce((distance, pt, i) => {
        return i === 0 ? 0 : distance + pt.distanceTo(pts[i - 1]);
    }, 0);
}

function getPixelLength(pl, map) {
    const latLngs = (pl instanceof L.Polyline) ? pl.getLatLngs() : pl;
    const points = latLngs.map(latLng => map.project(latLng));
    return getPointPathPixelLength(points);
}

/**
* path: array of L.LatLng
* ratios is an object with the following fields:
*   offset: the ratio of the total pixel length where the pattern will start
*   endOffset: the ratio of the total pixel length where the pattern will end
*   repeat: the ratio of the total pixel length between two points of the pattern
* map: the map, to access the current projection state
*/
function projectPatternOnPath(path, ratios, map) {
    const pathAsPoints = path.map(latLng => map.project(latLng));

    // project the pattern as pixel points
    const pattern = projectPatternOnPointPath(pathAsPoints, ratios);
    // and convert it to latlngs;
    pattern.forEach(point => { point.latLng = map.unproject(point.pt); });

    return pattern;
}

function projectPatternOnPointPath(pts, { offset, endOffset, repeat }) {
    const positions = [];
    // 1. compute the absolute interval length in pixels
    const repeatIntervalLength = getPointPathPixelLength(pts) * repeat;
    // 2. find the starting point by using the offset and find the last pixel using endOffset
    let previous = interpolateOnPointPath(pts, offset);
    const endOffsetPixels = endOffset > 0 ? getPointPathPixelLength(pts) * endOffset : 0;

    positions.push(previous);
    if (repeat > 0) {
        // 3. consider only the rest of the path, starting at the previous point
        let remainingPath = pts;
        remainingPath = remainingPath.slice(previous.predecessor);

        remainingPath[0] = previous.pt;
        let remainingLength = getPointPathPixelLength(remainingPath);

        // 4. project as a ratio of the remaining length,
        // and repeat while there is room for another point of the pattern

        while (repeatIntervalLength <= remainingLength-endOffsetPixels) {
            previous = interpolateOnPointPath(remainingPath, repeatIntervalLength/remainingLength);
            positions.push(previous);
            remainingPath = remainingPath.slice(previous.predecessor);
            remainingPath[0] = previous.pt;
            remainingLength = getPointPathPixelLength(remainingPath);
        }
    }
    return positions;
}

/**
* pts: array of L.Point
* ratio: the ratio of the total length where the point should be computed
* Returns null if ll has less than 2 LatLng, or an object with the following properties:
*    latLng: the LatLng of the interpolated point
*    predecessor: the index of the previous vertex on the path
*    heading: the heading of the path at this point, in degrees
*/
function interpolateOnPointPath(pts, ratio) {
    const nbVertices = pts.length;

    if (nbVertices < 2) {
        return null;
    }
    // easy limit cases: ratio negative/zero => first vertex
    if (ratio <= 0) {
        return {
            pt: pts[0],
            predecessor: 0,
            heading: computeAngle(pts[0], pts[1])
        };
    }
    // ratio >=1 => last vertex
    if (ratio >= 1) {
        return {
            pt: pts[nbVertices - 1],
            predecessor: nbVertices - 1,
            heading: computeAngle(pts[nbVertices - 2], pts[nbVertices - 1])
        };
    }
    // 1-segment-only path => direct linear interpolation
    if (nbVertices == 2) {
        return {
            pt: interpolateBetweenPoints(pts[0], pts[1], ratio),
            predecessor: 0,
            heading: computeAngle(pts[0], pts[1])
        };
    }

    const pathLength = getPointPathPixelLength(pts);
    let a = pts[0], b = a,
        ratioA = 0, ratioB = 0,
        distB = 0;
    // follow the path segments until we find the one
    // on which the point must lie => [ab]
    let i = 1;
    for (; i < nbVertices && ratioB < ratio; i++) {
        a = b;
        ratioA = ratioB;
        b = pts[i];
        distB += a.distanceTo(b);
        ratioB = distB / pathLength;
    }

    // compute the ratio relative to the segment [ab]
    const segmentRatio = (ratio - ratioA) / (ratioB - ratioA);

    return {
        pt: interpolateBetweenPoints(a, b, segmentRatio),
        predecessor: i-2,
        heading: computeAngle(a, b)
    };
}

/**
* Finds the point which lies on the segment defined by points A and B,
* at the given ratio of the distance from A to B, by linear interpolation.
*/
function interpolateBetweenPoints(ptA, ptB, ratio) {
    if (ptB.x != ptA.x) {
        return L.point(
            (ptA.x * (1 - ratio)) + (ratio * ptB.x),
            (ptA.y * (1 - ratio)) + (ratio * ptB.y)
        );
    }
    // special case where points lie on the same vertical axis
    return L.point(ptA.x, ptA.y + (ptB.y - ptA.y) * ratio);
}

export {
    projectPatternOnPath,
    getPixelLength,
};
