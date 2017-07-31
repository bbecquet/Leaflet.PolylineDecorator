function computeSegmentHeading(a, b) {
    return (Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI) + 90;
}

const getPointPathPixelLength = pts =>
    pts.reduce((distance, pt, i) => {
        return i === 0 ? 0 : distance + pt.distanceTo(pts[i - 1]);
    }, 0);

function getPixelLength(latLngs, map) {
    const points = latLngs.map(latLng => map.project(latLng));
    return getPointPathPixelLength(points);
}

/**
* ratios is an object with the following fields:
*   offset: the ratio of the total pixel length where the pattern will start
*   endOffset: the ratio of the total pixel length where the pattern will end
*   repeat: the ratio of the total pixel length between two points of the pattern
* map: the map, to access the current projection state
*/
function projectPatternOnPath(latLngs, ratios, map) {
    const pathAsPoints = latLngs.map(latLng => map.project(latLng));

    return projectPatternOnPointPath(pathAsPoints, ratios)
        .map(point => ({
            latLng: map.unproject(point.pt),
            heading: point.heading,
        }));
}

function pointsToSegments(pts) {
    const segments = [];
    let a, b, distA = 0, distAB;
    for (let i = 1, l = pts.length; i < l; i++) {
        a = pts[i - 1];
        b = pts[i];
        distAB = a.distanceTo(b);
        segments.push({
            a,
            b,
            distA,  // distances from the start of the polyline
            distB: distA + distAB,
            heading: computeSegmentHeading(a, b),
        });
        distA += distAB;
    }
    return segments;
}

const getSegment = (segments, offset) => {
    // @TODO: polyfill Array.find
    let matchingSegment;
    segments.forEach(segment => {
        if (offset >= segment.distA && offset <= segment.distB) {
            matchingSegment = segment;
        }
    });
    return matchingSegment || segments[segments.length - 1];
}

function projectPatternOnPointPath(pts, { offset, endOffset, repeat }) {
    // 1. split the path as segment infos
    const segments = pointsToSegments(pts);

    if (segments.length === 0) { return []; }

    const totalPathLength = segments[segments.length - 1].distB;
    const repeatIntervalPixels = totalPathLength * repeat;
    const startOffsetPixels = offset > 0 ? totalPathLength * offset : 0;
    const endOffsetPixels = endOffset > 0 ? totalPathLength * endOffset : 0;

    // 2. generate the positions of the pattern as offsets from the polygon start
    const positionOffsets = [];
    let positionOffset = startOffsetPixels;
    do {
        positionOffsets.push(positionOffset);
        positionOffset += repeatIntervalPixels;
    } while(repeatIntervalPixels > 0 && positionOffset < totalPathLength - endOffsetPixels);

    return positionOffsets
    // 3. projects offsets to segments
    .map(positionOffset => ({
        positionOffset,
        segment: getSegment(segments, positionOffset),
    }))
    // 4. interpolate on segment
    .map(({ positionOffset, segment }) => {
        const segmentRatio = (positionOffset - segment.distA) / (segment.distB - segment.distA);
        return {
            pt: interpolateBetweenPoints(segment.a, segment.b, segmentRatio),
            heading: segment.heading,
        };
    });
}

/**
* Finds the point which lies on the segment defined by points A and B,
* at the given ratio of the distance from A to B, by linear interpolation.
*/
function interpolateBetweenPoints(ptA, ptB, ratio) {
    if (ptB.x !== ptA.x) {
        return L.point(
            ptA.x + ratio * (ptB.x - ptA.x),
            ptA.y + ratio * (ptB.y - ptA.y)
        );
    }
    // special case where points lie on the same vertical axis
    return L.point(ptA.x, ptA.y + (ptB.y - ptA.y) * ratio);
}

export {
    projectPatternOnPath,
    getPixelLength,
};
