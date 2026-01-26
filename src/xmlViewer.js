/**
 * MusicXML Viewer Module
 * Renders MusicXML and MXL files using OpenSheetMusicDisplay (OSMD)
 */

import { OpenSheetMusicDisplay } from 'opensheetmusicdisplay';
import JSZip from 'jszip';
import { getSignedUrl } from './supabaseClient.js';
import { clamp } from './utils.js';

/**
 * Create a MusicXML viewer instance
 * @param {HTMLElement} container - Container element
 * @param {Object} score - Score object from database
 * @param {Object} options - Viewer options
 * @returns {Object} Viewer control object
 */
export async function createXmlViewer(container, score, options = {}) {
    let osmd = null;
    let mode = 'scroll'; // 'scroll' or 'page'
    let currentPageIndex = 0;
    let totalPages = 1;
    let scrollPosition = 0;
    let signedUrl = null;
    let signedUrlExpiry = null;

    // Restore position from score
    if (score.last_position) {
        mode = score.last_position.mode || 'scroll';
        if (mode === 'page') {
            currentPageIndex = score.last_position.pageIndex || 0;
        } else {
            scrollPosition = score.last_position.scrollTop || 0;
        }
    }

    // Container setup
    container.innerHTML = `
    <div class="xml-viewer">
      <div class="xml-mode-toggle">
        <button class="mode-btn ${mode === 'scroll' ? 'active' : ''}" data-mode="scroll">
          📜 Scroll Mode
        </button>
        <button class="mode-btn ${mode === 'page' ? 'active' : ''}" data-mode="page">
          📄 Page Mode
        </button>
      </div>
      <div class="xml-render-container" id="osmd-container">
        <div class="xml-loading" id="xml-loading">
          <div class="loading-spinner"></div>
          <p>Loading score...</p>
        </div>
      </div>
    </div>
  `;

    const osmdContainer = container.querySelector('#osmd-container');
    const loadingEl = container.querySelector('#xml-loading');

    // Mode toggle buttons
    container.querySelectorAll('.mode-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const newMode = btn.dataset.mode;
            if (newMode !== mode) {
                setMode(newMode);
            }
        });
    });

    /**
     * Get or refresh signed URL
     */
    async function getUrl() {
        const now = Date.now();
        if (!signedUrl || !signedUrlExpiry || now > signedUrlExpiry - 30000) {
            signedUrl = await getSignedUrl(score.storage_bucket, score.storage_path, 300);
            signedUrlExpiry = now + 300 * 1000;
        }
        return signedUrl;
    }

    /**
     * Load MusicXML content from URL
     */
    async function loadXmlContent() {
        const url = await getUrl();
        if (!url) throw new Error('Failed to get file URL');

        const response = await fetch(url);
        if (!response.ok) throw new Error('Failed to fetch file');

        if (score.file_type === 'mxl') {
            // MXL is a compressed file - need to unzip
            const arrayBuffer = await response.arrayBuffer();
            return await extractMxl(arrayBuffer);
        } else {
            return await response.text();
        }
    }

    /**
     * Extract MusicXML from MXL compressed file
     * @param {ArrayBuffer} arrayBuffer - MXL file content
     * @returns {string} MusicXML content
     */
    async function extractMxl(arrayBuffer) {
        const zip = await JSZip.loadAsync(arrayBuffer);

        // Look for rootfile declaration in META-INF/container.xml
        const containerXml = await zip.file('META-INF/container.xml')?.async('text');
        let rootFilePath = null;

        if (containerXml) {
            const parser = new DOMParser();
            const doc = parser.parseFromString(containerXml, 'text/xml');
            const rootFile = doc.querySelector('rootfile');
            rootFilePath = rootFile?.getAttribute('full-path');
        }

        // Fall back to finding any .xml file if container.xml doesn't specify
        if (!rootFilePath) {
            for (const filename of Object.keys(zip.files)) {
                if (filename.endsWith('.xml') && !filename.startsWith('META-INF/')) {
                    rootFilePath = filename;
                    break;
                }
            }
        }

        if (!rootFilePath) {
            throw new Error('Could not find MusicXML file in MXL archive');
        }

        return await zip.file(rootFilePath).async('text');
    }

    /**
     * Load and render the score
     */
    async function loadScore() {
        try {
            loadingEl.style.display = 'flex';

            const xmlContent = await loadXmlContent();

            // Create render target (OSMD needs a fresh container)
            const renderDiv = document.createElement('div');
            renderDiv.id = 'osmd-render';
            renderDiv.className = 'osmd-render';
            osmdContainer.appendChild(renderDiv);

            // Initialize OSMD
            osmd = new OpenSheetMusicDisplay(renderDiv, {
                autoResize: true,
                drawTitle: true,
                drawSubtitle: true,
                drawComposer: true,
                drawCredits: false,
                drawPartNames: true,
                drawPartAbbreviations: false,
                drawingParameters: 'default',
                backend: 'svg'
            });

            await osmd.load(xmlContent);

            // Apply mode-specific settings and render
            applyModeSettings();
            osmd.render();

            // Calculate page count for page mode
            calculatePages();

            loadingEl.style.display = 'none';

            // Restore scroll position if in scroll mode
            if (mode === 'scroll' && scrollPosition > 0) {
                osmdContainer.scrollTop = scrollPosition;
            }

            // Notify parent
            options.onLoad?.({ mode, currentPage: currentPageIndex + 1, totalPages });
        } catch (error) {
            console.error('Failed to load MusicXML:', error);
            loadingEl.innerHTML = `
        <div class="error-message">
          <p>Failed to load score</p>
          <p class="error-detail">${error.message}</p>
          <button class="btn btn-primary" id="retry-xml">Retry</button>
        </div>
      `;
            container.querySelector('#retry-xml')?.addEventListener('click', loadScore);
        }
    }

    /**
     * Apply settings based on current mode
     */
    function applyModeSettings() {
        if (!osmd) return;

        if (mode === 'page') {
            // Page mode: fixed page height
            osmd.setOptions({
                pageFormat: 'A4_P',
                pageBackgroundColor: '#ffffff'
            });
        } else {
            // Scroll mode: no page breaks
            osmd.setOptions({
                pageFormat: 'Endless',
                pageBackgroundColor: 'transparent'
            });
        }
    }

    /**
     * Calculate number of pages in page mode
     */
    function calculatePages() {
        if (!osmd || mode !== 'page') {
            totalPages = 1;
            return;
        }

        // OSMD page count (if paginated)
        const graphicalMusicSheet = osmd.GraphicSheet;
        if (graphicalMusicSheet) {
            totalPages = Math.max(1, graphicalMusicSheet.MusicPages.length);
        }
    }

    /**
     * Set view mode
     * @param {string} newMode - 'scroll' or 'page'
     */
    function setMode(newMode) {
        if (newMode === mode) return;

        mode = newMode;

        // Update toggle buttons
        container.querySelectorAll('.mode-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.mode === mode);
        });

        // Re-render with new settings
        if (osmd) {
            applyModeSettings();
            osmd.render();
            calculatePages();

            if (mode === 'page') {
                goToPage(0);
            }

            options.onModeChange?.({ mode, currentPage: currentPageIndex + 1, totalPages });
        }
    }

    /**
     * Go to specific page (page mode)
     * @param {number} pageIndex - 0-indexed page number
     */
    function goToPage(pageIndex) {
        if (mode !== 'page') return;

        currentPageIndex = clamp(pageIndex, 0, totalPages - 1);

        // Scroll to page
        const renderDiv = container.querySelector('#osmd-render');
        if (renderDiv) {
            const pages = renderDiv.querySelectorAll('.osmd-page, [class*="page"]');
            if (pages.length > currentPageIndex) {
                pages[currentPageIndex].scrollIntoView({ behavior: 'instant', block: 'start' });
            } else {
                // Fallback: scroll by percentage
                const scrollTop = (currentPageIndex / totalPages) * renderDiv.scrollHeight;
                osmdContainer.scrollTop = scrollTop;
            }
        }

        options.onPageChange?.({ mode, currentPage: currentPageIndex + 1, totalPages });
    }

    /**
     * Next page (or scroll viewport)
     * @returns {boolean} True if position changed
     */
    function nextPage() {
        if (mode === 'page') {
            if (currentPageIndex < totalPages - 1) {
                goToPage(currentPageIndex + 1);
                return true;
            }
            return false;
        } else {
            // Scroll mode: scroll by viewport height
            const scrollAmount = osmdContainer.clientHeight * 0.9;
            const maxScroll = osmdContainer.scrollHeight - osmdContainer.clientHeight;
            const currentScroll = osmdContainer.scrollTop;

            if (currentScroll < maxScroll) {
                osmdContainer.scrollBy({ top: scrollAmount, behavior: 'smooth' });
                return true;
            }
            return false;
        }
    }

    /**
     * Previous page (or scroll viewport)
     * @returns {boolean} True if position changed
     */
    function prevPage() {
        if (mode === 'page') {
            if (currentPageIndex > 0) {
                goToPage(currentPageIndex - 1);
                return true;
            }
            return false;
        } else {
            // Scroll mode: scroll by viewport height
            const scrollAmount = osmdContainer.clientHeight * 0.9;
            const currentScroll = osmdContainer.scrollTop;

            if (currentScroll > 0) {
                osmdContainer.scrollBy({ top: -scrollAmount, behavior: 'smooth' });
                return true;
            }
            return false;
        }
    }

    /**
     * Get current position for saving
     */
    function getPosition() {
        return {
            mode,
            pageIndex: mode === 'page' ? currentPageIndex : 0,
            scrollTop: mode === 'scroll' ? osmdContainer.scrollTop : 0
        };
    }

    /**
     * Get current state
     */
    function getState() {
        return {
            mode,
            currentPage: mode === 'page' ? currentPageIndex + 1 : 1,
            totalPages: mode === 'page' ? totalPages : 1
        };
    }

    /**
     * Cleanup
     */
    function destroy() {
        if (osmd) {
            osmd.clear();
            osmd = null;
        }
    }

    // Load the score
    await loadScore();

    // Return controller
    return {
        nextPage,
        prevPage,
        goToPage: (page) => goToPage(page - 1), // Convert to 0-indexed
        setMode,
        getPosition,
        getState,
        destroy
    };
}
