import { AfterViewInit, ChangeDetectorRef, Component, ElementRef, NgZone, OnDestroy, ViewChild } from '@angular/core';
import { Subject } from 'rxjs';

import * as PDFTron from '../assets/WebViewer.4.1.0/lib/webviewer.min.js';

let PDFNet;

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
                        'Diligent Corporation(diligent.com):OEM:Diligent Boards::B+:AMS(20190116):4AA5612D0407E80AD360B13AC9A2737860615FB59F08CD3BD56425E4CF7218FE5A8AB6F5C7',
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
    public ngOnDestroy() {
        this.destroyed.next(true);
        this.destroyed.complete();
    }
}
