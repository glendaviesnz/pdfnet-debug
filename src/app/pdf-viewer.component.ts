import { AfterViewInit, ChangeDetectorRef, Component, ElementRef, NgZone, OnDestroy, ViewChild } from '@angular/core';
import { Subject } from 'rxjs';

import * as PDFTron from '../assets/WebViewer.4.1.0/lib/webviewer.min.js';

let PDFNet: any;
let docViewer: any;

@Component({
    selector: 'app-pdf-viewer',
    template: '<div #viewerContainer class="pdf-viewer"></div><button (click)="loadNextDoc()">Next Page</button>',
})
export class PdfViewerComponent implements OnDestroy, AfterViewInit {
    @ViewChild('viewerContainer') public pdfViewerContainer: ElementRef;
    public viewerIframe: any;
    public webViewer: any;
    public destroyed = new Subject<boolean>();
    private pages = ['sample1.pdf', 'sample2.pdf', 'sample3.pdf'];
    private currentPage = 0;
    private pdfNet: any;
    private webViewerInstance: any;

    constructor(
        private _zone: NgZone,
        private _changeDetectorRef: ChangeDetectorRef
    ) {
        this._changeDetectorRef.detach();
    }

    public ngAfterViewInit() {
        this.addViewerListeners();
        this.initialiseViewer();
    }

    private addViewerListeners() {
        const viewerElement = this.pdfViewerContainer.nativeElement;

        viewerElement.addEventListener('documentLoaded', () => {

            PDFNet = (document.querySelector('iframe').contentWindow as any).PDFNet;
            docViewer = this.viewerIframe.contentWindow.readerControl.docViewer;

            this.createQuicklinks();
        });

        viewerElement.addEventListener('ready', () => {
            this.webViewer.loadDocument(`/assets/${this.pages[0]}`);
            if (this.viewerIframe && this.viewerIframe.contentWindow) {
                this.webViewerInstance = this.webViewer.getInstance();
                PDFNet = this.viewerIframe.contentWindow.PDFNet;
            }
        });

    }

    private initialiseViewer() {

        this._zone.runOutsideAngular(() => {
            this.webViewer = new PDFTron.WebViewer(
                {
                    type: 'html5',
                    path: '/assets/WebViewer.4.1.0/lib',
                    config: '/assets/WebViewer.4.1.0/config.js',
                    documentType: 'pdf',
                    fullAPI: true,
                    /* tslint:disable */
                    l:
                        '',
                    /* tslint:enable */
                },
                this.pdfViewerContainer.nativeElement
            );
        });
        this.viewerIframe = document.getElementById(this.webViewer.rcId);
    }

    public loadNextDoc() {
        this.currentPage = this.currentPage < this.pages.length - 1 ? this.currentPage + 1 : 0;
        this.webViewer.loadDocument(`/assets/${this.pages[this.currentPage]}`);
    }
    private async createQuicklinks() {
        // Origin is bottom left. That is what the server gives us.
        // Replace with the real quicklink region array
        const quickLinkRects = [new PDFNet.Rect(72, 746, 145, 770), new PDFNet.Rect(153, 145, 187, 277)];

        // Need to convert to top left origin
        const pageIndex = 0;

        // Text Highlighting
        PDFNet.runGeneratorWithCleanup(highlightLinks(quickLinkRects)).then(() => {
                docViewer.refreshAll();
                docViewer.updateView();
        });
    }

    public ngOnDestroy() {
        this.destroyed.next(true);
        this.destroyed.complete();
    }
}

// List<Rect> quickLinkRects
function* highlightLinks(quickLinkRects: any[]) {
    const linkColor = yield PDFNet.ColorPt.init(0, 0, 1, 0);

    let elementReader = null;
    let elementWriter = null;
    let elementBuilder = null;

    try {
        const pdfDoc = yield docViewer.getDocument().getPDFDoc();
        pdfDoc.lock();
        pdfDoc.initSecurityHandler();

        elementReader = yield PDFNet.ElementReader.create();
        elementWriter = yield PDFNet.ElementWriter.create();
        elementBuilder = yield PDFNet.ElementBuilder.create();

        const flipHeight = { value: false };
        const flipWidth = { value: false };

        pdfDoc.unlock();
        yield PDFNet.finishOperation();
        yield pdfDoc.requirePage(1);
        yield PDFNet.beginOperation();
        pdfDoc.lock();

        const page = yield pdfDoc.getPage(1);
        elementReader.beginOnPage(page);
        elementWriter.beginOnPage(page, PDFNet.ElementWriter.WriteMode.e_replacement, false);

        yield* highlightLinkElements(
            linkColor,
            quickLinkRects,
            elementReader,
            elementWriter,
            elementBuilder,
            flipHeight.value,
            flipWidth.value
        );

        elementWriter.end();
        elementReader.end();
    } catch (err) {
        console.log(err);
    } finally {
        if (elementBuilder != null) {
            elementBuilder.destroy();
        }

        if (elementWriter != null) {
            elementWriter.destroy();
        }

        if (elementReader != null) {
            elementReader.destroy();
        }
    }
}

// ColorPt color,
// List<Rect> quickLinkRects,
// ElementReader elementReader,
// ElementWriter elementWriter,
// ElementBuilder elementBuilder,
// boolean flipHeight,
// boolean flipWidth
function* highlightLinkElements(
    color: any,
    quickLinkRects: any[],
    elementReader: any,
    elementWriter: any,
    elementBuilder: any,
    flipHeight: boolean,
    flipWidth: boolean
) {
    try {
        yield PDFNet.startDeallocateStack();

        let element = null;
        while ((element = yield elementReader.next()) !== null) {
            const elementType = yield element.getType();

            if (elementType === PDFNet.Element.Type.e_text) {
                yield* highlightLinkElement(color, quickLinkRects, element, elementWriter);
            } else if (elementType === PDFNet.Element.Type.e_form) {
                yield processNestedForm(
                    elementReader,
                    elementWriter,
                    elementBuilder,
                    element,
                    flipHeight,
                    flipWidth,
                    function*() {
                        try {
                            yield* highlightLinkElements(
                                color,
                                quickLinkRects,
                                elementReader,
                                elementWriter,
                                elementBuilder,
                                flipHeight,
                                flipWidth
                            );
                        } catch (err) {
                            console.log(err);
                        }
                    }
                );
            } else {
                yield elementWriter.writeElement(element);
            }
        }

        yield PDFNet.endDeallocateStack();
    } catch (err) {
        console.log(err);
    }
}

// ColorPt annotationColor,
// List<Rect> quickLinkRects,
// Element element,
// ElementWriter elementWriter,
function* highlightLinkElement(color: any, quickLinkRects: any[], element: any, elementWriter: any) {
    if (isOverlapped(quickLinkRects, yield element.getBBox())) {
        // Link Element
        const colorSpace = yield PDFNet.ColorSpace.createDeviceRGB();
        const gState = yield element.getGState();
        const savedColor = yield gState.getFillColor();
        const savedColorSpace = yield gState.getFillColorSpace();

        gState.setFillColorSpace(colorSpace);
        gState.setFillColorWithColorPt(color);
        yield elementWriter.writeElement(element);
        gState.setFillColorSpace(savedColorSpace);
        gState.setFillColorWithColorPt(savedColor);
    } else {
        // Not a link element so just write it out as is
        yield elementWriter.writeElement(element);
    }
}

// List<Rect> quickLinkRects,
// Rect elementRect
function isOverlapped(quickLinkRects: any[], elementRect: any): boolean {
    // return true;
    if (quickLinkRects === null || elementRect === null) {
        return false;
    }

    for (const quickLinkRect of quickLinkRects) {
        if (getProportionalOverlap(quickLinkRect, elementRect) >= 0.55) {
            return true;
        }
    }

    return false;
}

// Rect quickLinkRect,
// Rect elementRect
function getProportionalOverlap(quickLinkRect: any, elementRect: any): number {
    if (quickLinkRect === null || elementRect === null) {
        return 0;
    }

    if (
        elementRect.x2 <= quickLinkRect.x1 ||
        elementRect.x1 >= quickLinkRect.x2 ||
        elementRect.y1 >= quickLinkRect.y2 ||
        elementRect.y2 <= quickLinkRect.y1
    ) {
        return 0;
    }

    if (
        elementRect.x2 <= quickLinkRect.x2 &&
        elementRect.x1 >= quickLinkRect.x1 &&
        elementRect.y1 >= quickLinkRect.y1 &&
        elementRect.y2 <= quickLinkRect.y2
    ) {
        return 1;
    }

    const maxLeft = Math.max(elementRect.x1, quickLinkRect.x1);
    const minRight = Math.min(elementRect.x2, quickLinkRect.x2);
    const maxBottom = Math.max(elementRect.y1, quickLinkRect.y1);
    const minTop = Math.min(elementRect.y2, quickLinkRect.y2);

    const intersectWidth = minRight - maxLeft;
    const intersectHeight = minTop - maxBottom;

    const elementWidth = elementRect.x2 - elementRect.x1;
    const elementHeight = elementRect.y2 - elementRect.y1;

    return (intersectWidth * intersectHeight) / (elementWidth * elementHeight);
}

// ElementReader reader,
// ElementWriter writer,
// ElementBuilder builder,
// Element element,
// boolean flipHeight,
// boolean flipWidth,
function* processNestedForm(
    reader: any,
    writer: any,
    builder: any,
    element: any,
    flipHeight: boolean,
    flipWidth: boolean,
    processNestedElementsMethod: () => any
) {
    // Determine the transformation matrix
    const formMatrix = element.getGState().getTransform();
    const matrix = element.getXObject().findObj('Matrix');
    if (matrix !== null) {
        formMatrix.concat(
            matrix.getAt(0).getNumber(),
            matrix.getAt(1).getNumber(),
            matrix.getAt(2).getNumber(),
            matrix.getAt(3).getNumber(),
            matrix.getAt(4).getNumber(),
            matrix.getAt(5).getNumber()
        );
    }

    // If form has a bounding box, add a clipping region to match
    const boundingBox = element.getXObject().findObj('BBox');
    if (boundingBox != null) {
        let boundingBoxRect = new PDFNet.Rect(boundingBox);
        boundingBoxRect.normalize();
        boundingBoxRect = transformRect(boundingBoxRect, formMatrix);

        if (flipHeight) {
            const temp = boundingBoxRect.y1;
            boundingBoxRect.setY1(boundingBoxRect.y2);
            boundingBoxRect.setY2(temp);
        }
        if (flipWidth) {
            const temp = boundingBoxRect.x1;
            boundingBoxRect.setX1(boundingBoxRect.x2);
            boundingBoxRect.setX2(temp);
        }

        const clip = builder.createRect(boundingBoxRect.x1, boundingBoxRect.y1, boundingBoxRect.x2, boundingBoxRect.y2);

        clip.setPathClip(true);
        clip.setPathFill(false);
        clip.setPathStroke(false);

        yield writer.writeElement(clip);
    }

    // Save the graphics state and set the forms transform
    const groupElement = builder.createGroupBegin();
    groupElement.getGState().setTransform(formMatrix);
    yield writer.writeElement(groupElement);

    // Process the content stream of the form
    reader.formBegin();

    processNestedElementsMethod();

    // Restore the graphics state
    yield writer.writeElement(builder.createGroupEnd());
    reader.end();
}

// rect: Rect,
// matrix: Matrix2D
function transformRect(rect: any, matrix: any): any {
    const p1 = matrix.multPoint(rect.x1, rect.y1);
    const p2 = matrix.multPoint(rect.x2, rect.y1);
    const p3 = matrix.multPoint(rect.x2, rect.y2);
    const p4 = matrix.multPoint(rect.x1, rect.y2);

    return new PDFNet.Rect(
        Math.min(Math.min(Math.min(p1.x, p2.x), p3.x), p4.x),
        Math.min(Math.min(Math.min(p1.y, p2.y), p3.y), p4.y),
        Math.max(Math.max(Math.max(p1.x, p2.x), p3.x), p4.x),
        Math.max(Math.max(Math.max(p1.y, p2.y), p3.y), p4.y)
    );
}

