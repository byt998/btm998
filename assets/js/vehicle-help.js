// =========================================================
// File: assets/js/vehicle-help.js
// Instrukcja obslugi dla sekcji "Lista Wozow"
// =========================================================

(() => {
    const SLIDES = [
        {
            step: 1,
            title: 'Sprawdzenie sprzętu',
            description: 'Klikaj nazwy sprzętu, aby oznaczyć element jako obecny na wozie. Zaznaczony sprzęt zmienia kolor na zielony.',
            image: 'assets/img/listy-wozow-help/01-sprawdzenie-sprzetu.webp',
            alt: 'Ekran zaznaczania sprzętu jako obecny na liście wozów.'
        },
        {
            step: 2,
            title: 'Szybkie zaznaczanie skrytki',
            description: 'Przytrzymaj nazwę skrytki, aby zaznaczyć na zielono cały sprzęt znajdujący się w tej skrytce.',
            image: 'assets/img/listy-wozow-help/02-szybkie-zaznaczanie-skrytki.webp',
            alt: 'Przytrzymanie nazwy skrytki i zaznaczanie całej skrytki.'
        },
        {
            step: 3,
            title: 'Sprawdzenie całego wozu',
            description: 'Jeśli jakiegoś elementu nie ma, pozostaw go niezaznaczonego. Po sprawdzeniu całego wozu kliknij przycisk "Wyślij braki".',
            image: 'assets/img/listy-wozow-help/03-sprawdzenie-calego-wozu.webp',
            alt: 'Widok sprawdzonego wozu z przyciskiem Wyślij braki.'
        },
        {
            step: 4,
            title: 'Lista braków',
            description: 'System pokaże listę sprzętu, który nie został oznaczony na zielono. Przycisk "Wyślij" pozwoli przesłać wiadomość na grupowego WhatsAppa i dokonać ewentualnych korekt np. w ilości.',
            image: 'assets/img/listy-wozow-help/04-lista-brakow.webp',
            alt: 'Modal z listą braków i przyciskiem wysyłki do WhatsApp.'
        },
        {
            step: 5,
            title: 'Szczegóły sprzętu',
            description: 'Przytrzymaj nazwę sprzętu, aby otworzyć szczegóły. Możesz dodać uwagi, oznaczyć status i zrobić zdjęcie uszkodzonego elementu.',
            image: 'assets/img/listy-wozow-help/05-szczegoly-sprzetu.webp',
            alt: 'Okno szczegółów sprzętu z polami uwag, statusem i zdjęciem.'
        },
        {
            step: 6,
            title: 'Panel Dowódcy',
            description: 'Po zapisaniu szczegółów dane pojawią się w Panelu Dowódcy. Kliknięcie kryptonimu wozu pokaże szczegóły, a kliknięcie ikony w kolumnie "Uwagi" otworzy zapisane informacje.',
            image: 'assets/img/listy-wozow-help/06-panel-dowodcy.webp',
            alt: 'Panel Dowódcy z widocznym statusem pojazdu i ikoną uwag.'
        },
        {
            step: 7,
            title: 'Status sprzętu',
            description: 'Zapisany status jest widoczny dla wszystkich użytkowników. W panelu dowódcy widoczna jest zmiana dokonująca wpisu. Status "W normie" usuwa wcześniejsze uwagi i statusy.',
            image: 'assets/img/listy-wozow-help/07-status-sprzetu.webp',
            alt: 'Widok statusu sprzętu współdzielonego dla wszystkich użytkowników.'
        }
    ];

    const state = {
        currentIndex: 0,
        lastFocusedElement: null
    };

    const selectors = {
        open: '[data-vehicle-help-open]',
        close: '[data-vehicle-help-close]',
        overlay: '[data-vehicle-help-overlay]',
        step: '[data-vehicle-help-step]',
        title: '[data-vehicle-help-slide-title]',
        description: '[data-vehicle-help-slide-description]',
        image: '[data-vehicle-help-image]',
        placeholder: '[data-vehicle-help-placeholder]',
        prev: '[data-vehicle-help-prev]',
        next: '[data-vehicle-help-next]'
    };

    document.addEventListener('DOMContentLoaded', initVehicleHelp);

    function initVehicleHelp() {
        const openButton = document.querySelector(selectors.open);
        const overlay = document.querySelector(selectors.overlay);
        const prevButton = document.querySelector(selectors.prev);
        const nextButton = document.querySelector(selectors.next);

        if (!openButton || !overlay || !prevButton || !nextButton) {
            return;
        }

        openButton.addEventListener('click', () => {
            state.lastFocusedElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
            state.currentIndex = 0;
            renderSlide();
            showModal();
        });

        document.querySelectorAll(selectors.close).forEach((button) => {
            button.addEventListener('click', hideModal);
        });

        prevButton.addEventListener('click', () => {
            if (state.currentIndex === 0) {
                return;
            }
            state.currentIndex -= 1;
            renderSlide();
        });

        nextButton.addEventListener('click', () => {
            if (state.currentIndex >= SLIDES.length - 1) {
                hideModal();
                return;
            }
            state.currentIndex += 1;
            renderSlide();
        });

        overlay.addEventListener('click', (event) => {
            if (event.target === overlay) {
                hideModal();
            }
        });

        document.addEventListener('keydown', (event) => {
            if (overlay.hidden) {
                return;
            }

            if (event.key === 'Escape') {
                hideModal();
            }

            if (event.key === 'ArrowRight' && state.currentIndex < SLIDES.length - 1) {
                state.currentIndex += 1;
                renderSlide();
            }

            if (event.key === 'ArrowLeft' && state.currentIndex > 0) {
                state.currentIndex -= 1;
                renderSlide();
            }
        });
    }

    function renderSlide() {
        const slide = SLIDES[state.currentIndex];
        const stepElement = document.querySelector(selectors.step);
        const titleElement = document.querySelector(selectors.title);
        const descriptionElement = document.querySelector(selectors.description);
        const imageElement = document.querySelector(selectors.image);
        const placeholderElement = document.querySelector(selectors.placeholder);
        const prevButton = document.querySelector(selectors.prev);
        const nextButton = document.querySelector(selectors.next);

        if (!slide || !stepElement || !titleElement || !descriptionElement || !imageElement || !placeholderElement || !prevButton || !nextButton) {
            return;
        }

        stepElement.textContent = `Krok ${slide.step} / ${SLIDES.length}`;
        titleElement.textContent = slide.title;
        descriptionElement.textContent = slide.description;

        prevButton.disabled = state.currentIndex === 0;
        nextButton.textContent = state.currentIndex === SLIDES.length - 1 ? 'Zamknij' : 'Następny';

        imageElement.hidden = true;
        imageElement.removeAttribute('src');
        imageElement.alt = slide.alt;
        placeholderElement.hidden = false;
        placeholderElement.textContent = `Dodaj screenshot kroku ${slide.step} do: ${slide.image}`;

        imageElement.onerror = () => {
            imageElement.hidden = true;
            placeholderElement.hidden = false;
            placeholderElement.textContent = `Dodaj screenshot kroku ${slide.step} do: ${slide.image}`;
        };

        imageElement.onload = () => {
            imageElement.hidden = false;
            placeholderElement.hidden = true;
        };

        imageElement.src = slide.image;
    }

    function showModal() {
        const overlay = document.querySelector(selectors.overlay);
        if (!overlay) {
            return;
        }

        overlay.hidden = false;
        document.body.classList.add('has-vehicle-help-modal');
        document.querySelector(selectors.next)?.focus();
    }

    function hideModal() {
        const overlay = document.querySelector(selectors.overlay);
        if (!overlay) {
            return;
        }

        overlay.hidden = true;
        document.body.classList.remove('has-vehicle-help-modal');
        state.lastFocusedElement?.focus();
    }
})();
