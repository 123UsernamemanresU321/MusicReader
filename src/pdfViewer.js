/**
 * PDF Viewer Module
 * Renders PDF files using PDF.js with page navigation and zoom
 */

import * as pdfjsLib from 'pdfjs-dist';
import { getSignedUrl, supabase } from './supabaseClient.js';
import { showToast, clamp } from './utils.js';

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url
).toString();

/**
 * Create a PDF viewer instance
 * @param {HTMLElement} container - Container element
 * @param {Object} score - Score object from database
 * @param {Object} options - Viewer options
 * @returns {Object} Viewer control object
 */
export async function createPdfViewer(container, score, options = {}) {
    let pdfDoc = null;
    let currentPage = 1;
    let totalPages = 0;
    let scale = 1.0;
    let renderTask = null;
    let signedUrl = null;
    let signedUrlExpiry = null;

    // Initial position from score
    if (score.last_position?.pdfPage) {
        currentPage = score.last_position.pdfPage;
    }

    // Container setup
    container.innerHTML = `
    <div class="pdf-viewer">
      <div class="pdf-canvas-container">
        <canvas id="pdf-canvas"></canvas>
      </div>
      <div class="pdf-loading" id="pdf-loading">
        <div class="loading-spinner"></div>
        <p>Loading PDF...</p>
      </div>
    </div>
  `;

    const canvas = container.querySelector('#pdf-canvas');
    const ctx = canvas.getContext('2d');
    const loadingEl = container.querySelector('#pdf-loading');

    /**
     * Get or refresh signed URL
     */
    async function getUrl() {
        const now = Date.now();
        // Refresh if expired or will expire in 30 seconds
        if (!signedUrl || !signedUrlExpiry || now > signedUrlExpiry - 30000) {
            signedUrl = await getSignedUrl(score.storage_bucket, score.storage_path, 300);
            signedUrlExpiry = now + 300 * 1000;
        }
        return signedUrl;
    }

    /**
     * Load the PDF document
     */
    async function loadPdf() {
        try {
            loadingEl.style.display = 'flex';

            const url = await getUrl();
            if (!url) throw new Error('Failed to get file URL');

            const loadingTask = pdfjsLib.getDocument({
                url,
                cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.6.82/cmaps/',
                cMapPacked: true
            });

            pdfDoc = await loadingTask.promise;
            totalPages = pdfDoc.numPages;

            // Clamp current page to valid range
            currentPage = clamp(currentPage, 1, totalPages);

            await renderPage(currentPage);
            loadingEl.style.display = 'none';

            options.onLoad?.({ currentPage, totalPages, scale });
        } catch (error) {
            console.error('Failed to load PDF:', error);
            loadingEl.innerHTML = `
        <div class="error-message">
          <p>Failed to load PDF</p>
          <button class="btn btn-primary" id="retry-pdf">Retry</button>
        </div>
      `;
            container.querySelector('#retry-pdf')?.addEventListener('click', loadPdf);
        }
    }

    /**
     * Render a specific page
     * @param {number} pageNum - Page number (1-indexed)
     */
    async function renderPage(pageNum) {
        if (!pdfDoc) return;

        // Cancel any pending render
        if (renderTask) {
            renderTask.cancel();
            renderTask = null;
        }

        try {
            const page = await pdfDoc.getPage(pageNum);

            // Calculate scale to fit container width
            const containerWidth = container.clientWidth - 40; // padding
            const viewport = page.getViewport({ scale: 1 });
            const fitScale = containerWidth / viewport.width;
            const finalScale = fitScale * scale;

            const scaledViewport = page.getViewport({ scale: finalScale });

            // Handle high DPI displays
            const dpr = window.devicePixelRatio || 1;
            canvas.width = scaledViewport.width * dpr;
            canvas.height = scaledViewport.height * dpr;
            canvas.style.width = `${scaledViewport.width}px`;
            canvas.style.height = `${scaledViewport.height}px`;

            ctx.scale(dpr, dpr);

            renderTask = page.render({
                canvasContext: ctx,
                viewport: scaledViewport
            });

            await renderTask.promise;
            renderTask = null;

            currentPage = pageNum;
            options.onPageChange?.({ currentPage, totalPages, scale });
        } catch (error) {
            if (error.name !== 'RenderingCancelledException') {
                console.error('Failed to render page:', error);
            }
        }
    }

    /**
     * Go to next page
     * @returns {boolean} True if page changed
     */
    async function nextPage() {
        if (currentPage < totalPages) {
            await renderPage(currentPage + 1);
            return true;
        }
        return false;
    }

    /**
     * Go to previous page
     * @returns {boolean} True if page changed
     */
    async function prevPage() {
        if (currentPage > 1) {
            await renderPage(currentPage - 1);
            return true;
        }
        return false;
    }

    /**
     * Go to specific page
     * @param {number} pageNum - Page number
     */
    async function goToPage(pageNum) {
        const newPage = clamp(pageNum, 1, totalPages);
        if (newPage !== currentPage) {
            await renderPage(newPage);
        }
    }

    /**
     * Zoom in
     */
    async function zoomIn() {
        scale = Math.min(scale + 0.25, 3.0);
        await renderPage(currentPage);
    }

    /**
     * Zoom out
     */
    async function zoomOut() {
        scale = Math.max(scale - 0.25, 0.1);
        await renderPage(currentPage);
    }

    /**
     * Reset zoom
     */
    async function resetZoom() {
        scale = 1.0;
        await renderPage(currentPage);
    }

    /**
     * Set zoom level
     * @param {number} newScale - New scale value (1.0 = 100%)
     */
    async function setZoom(newScale) {
        scale = clamp(newScale, 0.1, 5.0);
        await renderPage(currentPage);
    }

    /**
     * Get current position for saving
     */
    function getPosition() {
        return { pdfPage: currentPage };
    }

    /**
     * Get current state
     */
    function getState() {
        return { currentPage, totalPages, scale };
    }

    /**
     * Cleanup resources
     */
    function destroy() {
        if (renderTask) {
            renderTask.cancel();
        }
        if (pdfDoc) {
            pdfDoc.destroy();
        }
    }

    // Handle window resize
    const handleResize = () => {
        if (pdfDoc && currentPage) {
            renderPage(currentPage);
        }
    };
    window.addEventListener('resize', handleResize);

    // Load the PDF
    await loadPdf();

    // Return controller
    return {
        nextPage,
        prevPage,
        goToPage,
        zoomIn,
        zoomOut,
        resetZoom,
        setZoom,
        getPosition,
        getState,
        destroy: () => {
            window.removeEventListener('resize', handleResize);
            destroy();
        }
    };
}
