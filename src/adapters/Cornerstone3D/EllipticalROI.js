import { vec2, vec3 } from "gl-matrix";
import MeasurementReport from "./MeasurementReport";
import TID300Ellipse from "../../utilities/TID300/Ellipse";
import CORNERSTONE_3D_TAG from "./cornerstone3DTag";

const ELLIPTICALROI = "EllipticalROI";
const FINDING = "121071";
const FINDING_SITE = "G-C0E3";
const EPSILON = 1e-4;

const trackingIdentifierTextValue = "Cornerstone3DTools@^0.1.0:EllipticalROI";

class EllipticalROI {
    constructor() {}

    static getMeasurementData(
        MeasurementGroup,
        imageId,
        imageToWorldCoords,
        metadata
    ) {
        const {
            defaultState,
            NUMGroup,
            SCOORDGroup
        } = MeasurementReport.getSetupMeasurementData(MeasurementGroup);

        const { GraphicData } = SCOORDGroup;

        // GraphicData is ordered as [majorAxisStartX, majorAxisStartY, majorAxisEndX, majorAxisEndY, minorAxisStartX, minorAxisStartY, minorAxisEndX, minorAxisEndY]
        // But Cornerstone3D points are ordered as top, bottom, left, right for the
        // ellipse so we need to identify if the majorAxis is horizontal or vertical
        // in the image plane and then choose the correct points to use for the ellipse.
        const pointsWorld = [];
        for (let i = 0; i < GraphicData.length; i += 2) {
            const worldPos = imageToWorldCoords(imageId, [
                GraphicData[i],
                GraphicData[i + 1]
            ]);

            pointsWorld.push(worldPos);
        }

        const majorAxisStart = vec3.fromValues(...pointsWorld[0]);
        const majorAxisEnd = vec3.fromValues(...pointsWorld[1]);
        const minorAxisStart = vec3.fromValues(...pointsWorld[2]);
        const minorAxisEnd = vec3.fromValues(...pointsWorld[3]);

        const majorAxisVec = vec3.create();
        vec3.sub(majorAxisVec, majorAxisEnd, majorAxisStart);

        // normalize majorAxisVec to avoid scaling issues
        vec3.normalize(majorAxisVec, majorAxisVec);

        const minorAxisVec = vec3.create();
        vec3.sub(minorAxisVec, minorAxisEnd, minorAxisStart);
        vec3.normalize(minorAxisVec, minorAxisVec);

        const imagePlaneModule = metadata.get("imagePlaneModule", imageId);

        if (!imagePlaneModule) {
            throw new Error("imageId does not have imagePlaneModule metadata");
        }

        const { columnCosines } = imagePlaneModule;

        // find which axis is parallel to the columnCosines
        const columnCosinesVec = vec3.fromValues(...columnCosines);

        const projectedMajorAxisOnColVec = vec3.dot(
            columnCosinesVec,
            majorAxisVec
        );

        const projectedMinorAxisOnColVec = vec3.dot(
            columnCosinesVec,
            minorAxisVec
        );

        const absoluteOfMajorDotProduct = Math.abs(projectedMajorAxisOnColVec);
        const absoluteOfMinorDotProduct = Math.abs(projectedMinorAxisOnColVec);

        let ellipsePoints = [];
        if (Math.abs(absoluteOfMajorDotProduct - 1) < EPSILON) {
            ellipsePoints = [
                pointsWorld[0],
                pointsWorld[1],
                pointsWorld[2],
                pointsWorld[3]
            ];
        } else if (Math.abs(absoluteOfMinorDotProduct - 1) < EPSILON) {
            ellipsePoints = [
                pointsWorld[2],
                pointsWorld[3],
                pointsWorld[0],
                pointsWorld[1]
            ];
        } else {
            console.warn("OBLIQUE ELLIPSE NOT YET SUPPORTED");
        }

        const state = {
            ...defaultState,
            toolType: EllipticalROI.toolType,
            data: {
                handles: {
                    points: [...ellipsePoints],
                    activeHandleIndex: 0,
                    textBox: {
                        hasMoved: false
                    }
                },
                cachedStats: {
                    [`imageId:${imageId}`]: {
                        area: NUMGroup.MeasuredValueSequence.NumericValue
                    }
                }
            }
        };
        return state;
    }

    static getTID300RepresentationArguments(tool, worldToImageCoords) {
        const { data, finding, findingSites, metadata } = tool;
        const { cachedStats, handles } = data;

        const { referencedImageId } = metadata;

        if (!referencedImageId) {
            throw new Error(
                "EllipticalROI.getTID300RepresentationArguments: referencedImageId is not defined"
            );
        }

        const top = worldToImageCoords(referencedImageId, handles.points[0]);
        const bottom = worldToImageCoords(referencedImageId, handles.points[1]);
        const left = worldToImageCoords(referencedImageId, handles.points[2]);
        const right = worldToImageCoords(referencedImageId, handles.points[3]);

        // find the major axis and minor axis
        const topBottomLength = Math.abs(top[1] - bottom[1]);
        const leftRightLength = Math.abs(left[0] - right[0]);

        let points = [];
        if (topBottomLength > leftRightLength) {
            // major axis is bottom to top
            points.push({ x: top[0], y: top[1] });
            points.push({ x: bottom[0], y: bottom[1] });

            // minor axis is left to right
            points.push({ x: left[0], y: left[1] });
            points.push({ x: right[0], y: right[1] });
        } else {
            // major axis is left to right
            points.push({ x: left[0], y: left[1] });
            points.push({ x: right[0], y: right[1] });

            // minor axis is bottom to top
            points.push({ x: top[0], y: top[1] });
            points.push({ x: bottom[0], y: bottom[1] });
        }

        const { area } = cachedStats[`imageId:${referencedImageId}`];

        return {
            area,
            points,
            trackingIdentifierTextValue,
            finding,
            findingSites: findingSites || []
        };
    }
}

EllipticalROI.toolType = ELLIPTICALROI;
EllipticalROI.utilityToolType = ELLIPTICALROI;
EllipticalROI.TID300Representation = TID300Ellipse;
EllipticalROI.isValidCornerstoneTrackingIdentifier = TrackingIdentifier => {
    if (!TrackingIdentifier.includes(":")) {
        return false;
    }

    const [cornerstone4Tag, toolType] = TrackingIdentifier.split(":");

    if (cornerstone4Tag !== CORNERSTONE_3D_TAG) {
        return false;
    }

    return toolType === ELLIPTICALROI;
};

MeasurementReport.registerTool(EllipticalROI);

export default EllipticalROI;
