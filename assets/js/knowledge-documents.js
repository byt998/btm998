// =========================================================
// File: assets/js/knowledge-documents.js
// Procedury: lista PDF z tabeli knowledge_documents + PDF.js viewer.
// =========================================================

(() => {
    const PDFJS_MODULE_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@5.7.284/build/pdf.mjs';
    const PDFJS_WORKER_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@5.7.284/build/pdf.worker.mjs';
    const MIN_ZOOM = 0.6;
    const MAX_ZOOM = 2.4;
    const ZOOM_STEP = 0.2;

    const selectors = {
        screens: '[data-procedure-screen]',
        navButtons: '[data-procedure-nav]',
        grid: '[data-knowledge-documents-grid]',
        status: '[data-knowledge-documents-status]',
        quickGrid: '[data-procedure-quick-grid]',
        quickStatus: '[data-procedure-quick-status]',
        quickModal: '[data-quick-image-modal]',
        quickModalTitle: '[data-quick-image-title]',
        quickModalImage: '[data-quick-image]',
        quickModalClose: '[data-quick-image-close]',
        quickModalViewport: '[data-quick-image-viewport]',
        modal: '[data-pdf-modal]',
        modalTitle: '[data-pdf-title]',
        modalClose: '[data-pdf-close]',
        modalOpenTarget: '[data-pdf-open-target]',
        modalPages: '[data-pdf-pages]',
        modalStatus: '[data-pdf-status]',
        pageInfo: '[data-pdf-page-info]',
        zoomOut: '[data-pdf-zoom-out]',
        zoomIn: '[data-pdf-zoom-in]',
        zoomReset: '[data-pdf-zoom-reset]'
    };

    const state = {
        supabase: null,
        pdfjsLib: null,
        pdfDocument: null,
        loadingTask: null,
        currentPdfUrl: '',
        currentTitle: '',
        currentPage: 1,
        pageCount: 0,
        baseScale: 1,
        zoom: 1,
        renderToken: 0,
        scrollFrame: null,
        documentsLoaded: false,
        quickCardsLoaded: false,
        quickImageZoomed: false
    };

    document.addEventListener('DOMContentLoaded', initKnowledgeDocuments);

    async function initKnowledgeDocuments() {
        state.supabase = window.AppCommon?.supabase || null;
        bindScreenEvents();
        bindModalEvents();
        showProcedureScreen('home');

        if (!state.supabase) {
            showStatus('Brak konfiguracji Supabase. Nie mo\u017cna pobra\u0107 dokument\u00f3w.', 'error');
            showQuickStatus('Brak konfiguracji Supabase. Nie mo\u017cna pobra\u0107 kart.', 'error');
            return;
        }
    }

    function bindScreenEvents() {
        document.querySelectorAll(selectors.navButtons).forEach((button) => {
            button.addEventListener('click', () => {
                const target = button.getAttribute('data-procedure-nav') || 'home';
                showProcedureScreen(target);
            });
        });
    }

    function bindModalEvents() {
        document.querySelector(selectors.modalClose)?.addEventListener('click', closePdfModal);
        document.querySelector(selectors.modal)?.addEventListener('click', (event) => {
            if (event.target === event.currentTarget) {
                closePdfModal();
            }
        });
        document.querySelector(selectors.modalPages)?.addEventListener('scroll', queuePageInfoUpdate);
        document.querySelector(selectors.zoomOut)?.addEventListener('click', () => changeZoom(-ZOOM_STEP));
        document.querySelector(selectors.zoomIn)?.addEventListener('click', () => changeZoom(ZOOM_STEP));
        document.querySelector(selectors.zoomReset)?.addEventListener('click', resetZoom);
        document.querySelector(selectors.quickModalClose)?.addEventListener('click', closeQuickImageModal);
        document.querySelector(selectors.quickModal)?.addEventListener('click', (event) => {
            if (event.target === event.currentTarget) {
                closeQuickImageModal();
            }
        });
        document.querySelector(selectors.quickModalImage)?.addEventListener('click', toggleQuickImageZoom);
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                closePdfModal();
                closeQuickImageModal();
            }
        });
    }

    function showProcedureScreen(screenName) {
        document.querySelectorAll(selectors.screens).forEach((screen) => {
            screen.hidden = screen.getAttribute('data-procedure-screen') !== screenName;
        });

        if (screenName !== 'documents') {
            closePdfModal();
        }
        if (screenName !== 'quick') {
            closeQuickImageModal();
        }

        if (screenName === 'documents' && !state.documentsLoaded) {
            showStatus('\u0141adowanie dokument\u00f3w...', 'info');
            loadDocuments();
        }
        if (screenName === 'quick' && !state.quickCardsLoaded) {
            showQuickStatus('\u0141adowanie kart...', 'info');
            loadQuickCards();
        }
    }

    async function loadDocuments() {
        const grid = document.querySelector(selectors.grid);
        if (!grid) {
            return;
        }

        grid.innerHTML = '';

        if (!state.supabase) {
            showStatus('Brak konfiguracji Supabase. Nie mo\u017cna pobra\u0107 dokument\u00f3w.', 'error');
            return;
        }

        const { data, error } = await state.supabase
            .from('knowledge_documents')
            .select('title, pdf_url, sort_order')
            .order('sort_order', { ascending: true });

        if (error) {
            console.error('Knowledge documents: fetch failed', error);
            showStatus('Nie uda\u0142o si\u0119 pobra\u0107 dokument\u00f3w z Supabase.', 'error');
            return;
        }

        const documents = (data || []).map(normalizeDocument).filter(Boolean);
        if (!documents.length) {
            showStatus('Brak dokument\u00f3w do wy\u015bwietlenia.', 'info');
            state.documentsLoaded = true;
            return;
        }

        showStatus('');
        documents.forEach((documentItem) => {
            grid.appendChild(createDocumentCard(documentItem));
        });
        state.documentsLoaded = true;
    }

    async function loadQuickCards() {
        const grid = document.querySelector(selectors.quickGrid);
        if (!grid) {
            return;
        }

        grid.innerHTML = '';

        if (!state.supabase) {
            showQuickStatus('Brak konfiguracji Supabase. Nie mo\u017cna pobra\u0107 kart.', 'error');
            return;
        }

        const { data, error } = await state.supabase
            .from('procedure_quick_cards')
            .select('title, image_url, sort_order')
            .order('sort_order', { ascending: true });

        if (error) {
            console.error('Procedure quick cards: fetch failed', error);
            showQuickStatus('Nie uda\u0142o si\u0119 pobra\u0107 kart z Supabase.', 'error');
            return;
        }

        const cards = (data || []).map(normalizeQuickCard).filter(Boolean);
        if (!cards.length) {
            showQuickStatus('Brak kart do wy\u015bwietlenia.', 'info');
            state.quickCardsLoaded = true;
            return;
        }

        showQuickStatus('');
        cards.forEach((card) => {
            grid.appendChild(createQuickCard(card));
        });
        state.quickCardsLoaded = true;
    }

    function normalizeDocument(row) {
        const title = normalizeText(row?.title);
        const pdfUrl = normalizeText(row?.pdf_url);
        if (!title || !pdfUrl) {
            console.log('Knowledge documents: skipped invalid row', row);
            return null;
        }

        return {
            title,
            pdfUrl
        };
    }

    function createDocumentCard(documentItem) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'knowledge-document-card';

        const icon = document.createElement('span');
        icon.className = 'knowledge-document-card__icon';
        icon.setAttribute('aria-hidden', 'true');
        icon.textContent = 'PDF';

        const title = document.createElement('span');
        title.className = 'knowledge-document-card__title';
        title.textContent = documentItem.title;

        button.append(icon, title);
        button.addEventListener('click', () => openPdfModal(documentItem));
        return button;
    }

    function normalizeQuickCard(row) {
        const title = normalizeText(row?.title);
        const imageUrl = normalizeText(row?.image_url);
        if (!title || !imageUrl) {
            console.log('Procedure quick cards: skipped invalid row', row);
            return null;
        }

        return {
            title,
            imageUrl
        };
    }

    function createQuickCard(card) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'procedure-quick-card';

        const title = document.createElement('span');
        title.className = 'procedure-quick-card__title';
        title.textContent = card.title;

        button.appendChild(title);
        button.addEventListener('click', () => openQuickImageModal(card));
        return button;
    }

    function openQuickImageModal(card) {
        const modal = document.querySelector(selectors.quickModal);
        const title = document.querySelector(selectors.quickModalTitle);
        const image = document.querySelector(selectors.quickModalImage);
        const viewport = document.querySelector(selectors.quickModalViewport);
        if (!modal || !image) {
            window.open(card.imageUrl, '_blank', 'noopener');
            return;
        }

        if (title) {
            title.textContent = card.title;
        }
        if (viewport) {
            viewport.classList.remove('is-zoomed');
            viewport.scrollTop = 0;
            viewport.scrollLeft = 0;
        }
        image.src = card.imageUrl;
        image.alt = card.title;
        image.classList.remove('is-zoomed');
        state.quickImageZoomed = false;
        image.onerror = () => {
            closeQuickImageModal();
            window.open(card.imageUrl, '_blank', 'noopener');
        };
        modal.hidden = false;
        document.body.classList.add('is-quick-image-open');
    }

    function toggleQuickImageZoom(event) {
        const image = event.currentTarget;
        const viewport = document.querySelector(selectors.quickModalViewport);
        if (!image?.src || !viewport) {
            return;
        }

        event.stopPropagation();
        state.quickImageZoomed = !state.quickImageZoomed;
        image.classList.toggle('is-zoomed', state.quickImageZoomed);
        viewport.classList.toggle('is-zoomed', state.quickImageZoomed);

        if (state.quickImageZoomed) {
            requestAnimationFrame(() => {
                viewport.scrollLeft = Math.max(0, (viewport.scrollWidth - viewport.clientWidth) / 2);
                viewport.scrollTop = Math.max(0, (viewport.scrollHeight - viewport.clientHeight) / 2);
            });
        } else {
            viewport.scrollTop = 0;
            viewport.scrollLeft = 0;
        }
    }

    function closeQuickImageModal() {
        const modal = document.querySelector(selectors.quickModal);
        const image = document.querySelector(selectors.quickModalImage);
        const viewport = document.querySelector(selectors.quickModalViewport);
        if (!modal) {
            return;
        }

        modal.hidden = true;
        if (image) {
            image.removeAttribute('src');
            image.alt = '';
            image.onerror = null;
            image.classList.remove('is-zoomed');
        }
        viewport?.classList.remove('is-zoomed');
        state.quickImageZoomed = false;
        document.body.classList.remove('is-quick-image-open');
    }

    async function openPdfModal(documentItem) {
        const modal = document.querySelector(selectors.modal);
        const title = document.querySelector(selectors.modalTitle);
        const openTarget = document.querySelector(selectors.modalOpenTarget);
        const pages = document.querySelector(selectors.modalPages);
        if (!modal || !pages || !openTarget) {
            openPdfFallback(documentItem.pdfUrl);
            return;
        }

        destroyPdfDocument();
        resetPdfState();
        state.currentPdfUrl = documentItem.pdfUrl;
        state.currentTitle = documentItem.title;
        state.renderToken += 1;
        const token = state.renderToken;

        if (title) {
            title.textContent = documentItem.title;
        }
        openTarget.href = documentItem.pdfUrl;
        modal.hidden = false;
        document.body.classList.add('is-pdf-viewer-open');
        showPdfStatus('\u0141adowanie PDF...');
        updatePageInfo();
        updateZoomControls();

        try {
            await loadPdfDocument(token);
            await renderPdfPages(token);
        } catch (error) {
            if (token !== state.renderToken) {
                return;
            }
            console.error('Knowledge documents: PDF.js failed', error);
            closePdfModal();
            openPdfFallback(documentItem.pdfUrl);
        }
    }

    async function loadPdfDocument(token) {
        const pdfjsLib = await loadPdfJs();
        if (token !== state.renderToken) {
            return;
        }

        state.loadingTask = pdfjsLib.getDocument({ url: state.currentPdfUrl });
        state.pdfDocument = await state.loadingTask.promise;
        if (token !== state.renderToken || !state.pdfDocument) {
            return;
        }

        state.pageCount = state.pdfDocument.numPages;
        state.currentPage = 1;
        updatePageInfo();
    }

    async function loadPdfJs() {
        if (state.pdfjsLib) {
            return state.pdfjsLib;
        }

        const pdfjsLib = await import(PDFJS_MODULE_URL);
        pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
        state.pdfjsLib = pdfjsLib;
        return pdfjsLib;
    }

    async function renderPdfPages(token, preferredPage = state.currentPage) {
        const pages = document.querySelector(selectors.modalPages);
        if (!pages || !state.pdfDocument) {
            return;
        }

        pages.innerHTML = '';
        showPdfStatus('Renderowanie stron...');
        updateZoomControls();

        const firstPage = await state.pdfDocument.getPage(1);
        if (token !== state.renderToken) {
            return;
        }

        const firstViewport = firstPage.getViewport({ scale: 1 });
        const availableWidth = Math.max(280, (pages.clientWidth || window.innerWidth) - 32);
        state.baseScale = Math.min(Math.max(availableWidth / firstViewport.width, 0.45), 2);

        for (let pageNumber = 1; pageNumber <= state.pageCount; pageNumber += 1) {
            if (token !== state.renderToken) {
                return;
            }
            const page = pageNumber === 1 ? firstPage : await state.pdfDocument.getPage(pageNumber);
            await renderSinglePage(page, pageNumber, token);
        }

        if (token !== state.renderToken) {
            return;
        }
        showPdfStatus('');
        updatePageInfo();
        scrollToPage(Math.min(preferredPage, state.pageCount));
    }

    async function renderSinglePage(page, pageNumber, token) {
        const pages = document.querySelector(selectors.modalPages);
        if (!pages || token !== state.renderToken) {
            return;
        }

        const viewport = page.getViewport({ scale: state.baseScale * state.zoom });
        const outputScale = Math.min(window.devicePixelRatio || 1, 2);

        const pageWrap = document.createElement('article');
        pageWrap.className = 'pdf-viewer-modal__page';
        pageWrap.dataset.pageNumber = String(pageNumber);

        const pageLabel = document.createElement('span');
        pageLabel.className = 'pdf-viewer-modal__page-label';
        pageLabel.textContent = `Strona ${pageNumber}`;

        const canvas = document.createElement('canvas');
        canvas.className = 'pdf-viewer-modal__canvas';
        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.height = Math.floor(viewport.height * outputScale);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;

        pageWrap.append(pageLabel, canvas);
        pages.appendChild(pageWrap);

        const context = canvas.getContext('2d');
        const transform = outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : null;
        await page.render({ canvasContext: context, viewport, transform }).promise;
    }

    function changeZoom(delta) {
        if (!state.pdfDocument) {
            return;
        }

        const nextZoom = clamp(Number((state.zoom + delta).toFixed(2)), MIN_ZOOM, MAX_ZOOM);
        if (nextZoom === state.zoom) {
            return;
        }

        state.zoom = nextZoom;
        const token = state.renderToken + 1;
        state.renderToken = token;
        renderPdfPages(token).catch((error) => {
            if (token !== state.renderToken) {
                return;
            }
            console.error('Knowledge documents: zoom render failed', error);
            const fallbackUrl = state.currentPdfUrl;
            closePdfModal();
            openPdfFallback(fallbackUrl);
        });
    }

    function resetZoom() {
        if (!state.pdfDocument) {
            return;
        }
        state.zoom = 1;
        const token = state.renderToken + 1;
        state.renderToken = token;
        renderPdfPages(token).catch((error) => {
            if (token !== state.renderToken) {
                return;
            }
            console.error('Knowledge documents: reset zoom render failed', error);
            const fallbackUrl = state.currentPdfUrl;
            closePdfModal();
            openPdfFallback(fallbackUrl);
        });
    }

    function closePdfModal() {
        const modal = document.querySelector(selectors.modal);
        if (!modal) {
            return;
        }

        state.renderToken += 1;
        modal.hidden = true;
        destroyPdfDocument();
        resetPdfState();
        document.body.classList.remove('is-pdf-viewer-open');
    }

    function resetPdfState() {
        const pages = document.querySelector(selectors.modalPages);
        if (pages) {
            pages.innerHTML = '';
            pages.scrollTop = 0;
        }

        state.currentPdfUrl = '';
        state.currentTitle = '';
        state.currentPage = 1;
        state.pageCount = 0;
        state.baseScale = 1;
        state.zoom = 1;
        state.loadingTask = null;
        state.pdfDocument = null;
        showPdfStatus('');
        updatePageInfo();
        updateZoomControls();
    }

    function destroyPdfDocument() {
        try {
            state.loadingTask?.destroy?.();
            state.pdfDocument?.destroy?.();
        } catch (error) {
            console.warn('Knowledge documents: PDF cleanup failed', error);
        }
    }

    function queuePageInfoUpdate() {
        if (state.scrollFrame) {
            window.cancelAnimationFrame(state.scrollFrame);
        }
        state.scrollFrame = window.requestAnimationFrame(() => {
            state.scrollFrame = null;
            updateCurrentPageFromScroll();
        });
    }

    function updateCurrentPageFromScroll() {
        const pages = document.querySelector(selectors.modalPages);
        if (!pages) {
            return;
        }

        const pageElements = Array.from(pages.querySelectorAll('.pdf-viewer-modal__page'));
        if (!pageElements.length) {
            return;
        }

        const containerRect = pages.getBoundingClientRect();
        const anchor = containerRect.top + Math.min(180, pages.clientHeight * 0.35);
        let currentPage = 1;

        pageElements.forEach((pageElement) => {
            const rect = pageElement.getBoundingClientRect();
            if (rect.top <= anchor) {
                currentPage = Number(pageElement.dataset.pageNumber) || currentPage;
            }
        });

        state.currentPage = currentPage;
        updatePageInfo();
    }

    function scrollToPage(pageNumber) {
        const pages = document.querySelector(selectors.modalPages);
        const pageElement = pages?.querySelector(`[data-page-number="${pageNumber}"]`);
        if (!pages || !pageElement) {
            return;
        }

        pages.scrollTo({
            top: pageElement.offsetTop - 12,
            behavior: 'auto'
        });
        state.currentPage = pageNumber;
        updatePageInfo();
    }

    function updatePageInfo() {
        const pageInfo = document.querySelector(selectors.pageInfo);
        if (!pageInfo) {
            return;
        }

        pageInfo.textContent = `Strona ${state.pageCount ? state.currentPage : 0} / ${state.pageCount}`;
    }

    function updateZoomControls() {
        const zoomOut = document.querySelector(selectors.zoomOut);
        const zoomIn = document.querySelector(selectors.zoomIn);
        const zoomReset = document.querySelector(selectors.zoomReset);

        if (zoomOut) {
            zoomOut.disabled = !state.pdfDocument || state.zoom <= MIN_ZOOM;
        }
        if (zoomIn) {
            zoomIn.disabled = !state.pdfDocument || state.zoom >= MAX_ZOOM;
        }
        if (zoomReset) {
            zoomReset.disabled = !state.pdfDocument;
            zoomReset.textContent = `${Math.round(state.zoom * 100)}%`;
        }
    }

    function showPdfStatus(message) {
        const status = document.querySelector(selectors.modalStatus);
        if (!status) {
            return;
        }

        status.textContent = message || '';
        status.hidden = !message;
    }

    function openPdfFallback(pdfUrl) {
        if (pdfUrl) {
            window.open(pdfUrl, '_blank', 'noopener');
        }
    }

    function showStatus(message, type = 'info') {
        const status = document.querySelector(selectors.status);
        if (!status) {
            return;
        }

        status.textContent = message || '';
        status.hidden = !message;
        status.classList.toggle('is-error', type === 'error');
    }

    function showQuickStatus(message, type = 'info') {
        const status = document.querySelector(selectors.quickStatus);
        if (!status) {
            return;
        }

        status.textContent = message || '';
        status.hidden = !message;
        status.classList.toggle('is-error', type === 'error');
    }

    function normalizeText(value) {
        return String(value ?? '').trim();
    }

    function clamp(value, min, max) {
        return Math.min(Math.max(value, min), max);
    }
})();
