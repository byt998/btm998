// =========================================================
// File: assets/js/zadania-rot.js
// Interaktywny modul "Zadania Rot" w sekcji Wiedza
// =========================================================

(() => {
    const PLACEHOLDER = 'W przygotowaniu';

    const SCENARIOS = {
        fire1: {
            label: 'Pożar I wóz',
            seats: {
                driver: {
                    role: 'Kierowca',
                    gear: [
                        'Ustawia samochód',
                        'Obsługuje autopompę',
                        'Zabezpiecza miejsce zdarzenia',
                        'Spisuje służby'
                    ],
                    tasks: [
                        'Ustawia samochód',
                        'Obsługuje autopompę',
                        'Zabezpiecza miejsce zdarzenia',
                        'Spisuje służby'
                    ]
                },
                commander: {
                    role: 'Dowódca "15" lub DARIA 1',
                    gear: [
                        'Kamerę termowizyjną',
                        'Kurtynę dymową',
                        'Linkę ratowniczą'
                    ],
                    tasks: [
                        'Lokalizacja mieszkania objętego pożarem',
                        'Sprawdzenie dostępu do mieszkania ("nacisnąć na klamkę" - czy drzwi trzeba otwierać siłowo, czy trzeba zażądać dodatkowego sprzętu: hydraulika ręczna, piła tarczowa itp.)',
                        'Przygotowanie do wejścia do mieszkania',
                        'Zabezpieczenie linii gaśniczej podpinką przy rozdzielaczu mieszkaniowym',
                        'Wypełnienie pakietu wodą',
                        'Założenie kurtyny dymowej (w razie potrzeby)',
                        'Założenie taśmy na klamkę (w razie potrzeby)',
                        'Wejście i gaszenie zgodnie z procedurą',
                        'Przeszukanie i ewakuacja poszkodowanych z mieszkania na klatkę schodową',
                        'Wstępne oddymienie pomieszczeń (w zależności od warunków pożarowych)'
                    ]
                },
                rear1: {
                    role: 'Przodownik I roty (STOPER 1)',
                    gear: [
                        'Pakiet',
                        'Amerykan',
                        'Linkę ratowniczą',
                        'Podpinkę wężową',
                        'Taśmę na klamkę'
                    ],
                    tasks: [
                        'Lokalizacja mieszkania objętego pożarem',
                        'Sprawdzenie dostępu do mieszkania ("nacisnąć na klamkę" - czy drzwi trzeba otwierać siłowo, czy trzeba zażądać dodatkowego sprzętu: hydraulika ręczna, piła tarczowa itp.)',
                        'Przygotowanie do wejścia do mieszkania',
                        'Zabezpieczenie linii gaśniczej podpinką przy rozdzielaczu mieszkaniowym',
                        'Wypełnienie pakietu wodą',
                        'Założenie kurtyny dymowej (w razie potrzeby)',
                        'Założenie taśmy na klamkę (w razie potrzeby)',
                        'Wejście i gaszenie zgodnie z procedurą',
                        'Przeszukanie i ewakuacja poszkodowanych z mieszkania na klatkę schodową',
                        'Wstępne oddymienie pomieszczeń (w zależności od warunków pożarowych)'
                    ]
                },
                rear2: {
                    role: 'Pomocnik I roty (STOPER 2)',
                    gear: [
                        'Odcinki wężowe W52 - budowa linii gaśniczej (od rozdzielacza do rozdzielacza z pakietu)',
                        'Podpinkę wężową',
                        'Rozdzielacz przed wejście do budynku (linia główna / linia gaśnicza)'
                    ],
                    tasks: [
                        'Zbudowanie linii głównej (w razie konieczności; jeśli jest krótka buduje ją kierowca z 1 wozu)',
                        'Zbudowanie linii gaśniczej po klatce schodowej (od wejścia do budynku do rozdzielacza mieszkaniowego)',
                        'Pozostanie przy drzwiach wejściowych do mieszkania po wejściu "szpicy" i kontrola wentylacji pożarowej (przymknięcie drzwi, kontrola kurtyny dymowej)',
                        'Ewakuacja poszkodowanych przejętych od "szpicy" po klatce schodowej do punktu medycznego (w razie potrzeby)',
                        'Ustawienie głównego rozdzielacza przed wejściem do budynku',
                        'Podpięcie linii gaśniczej do rozdzielacza głównego',
                        'Zabezpieczenie linii gaśniczej podpinką (w razie potrzeby)'
                    ]
                },
                rear3: {
                    role: 'Pomocnik II roty (STOPER 3)',
                    gear: [
                        'Odcinki wężowe W52 - budowa linii gaśniczej (od rozdzielacza do rozdzielacza z pakietu)',
                        'Dodatkowy rezerwowy odcinek W52 w kręgu do rozdzielacza przy pakiecie'
                    ],
                    tasks: [
                        'Zbudowanie linii głównej (w razie konieczności; jeśli jest krótka buduje ją kierowca z 1 wozu)',
                        'Zbudowanie linii gaśniczej po klatce schodowej (od wejścia do budynku do rozdzielacza mieszkaniowego)',
                        'Pozostanie przy drzwiach wejściowych do mieszkania po wejściu "szpicy" i kontrola wentylacji pożarowej (przymknięcie drzwi, kontrola kurtyny dymowej)',
                        'Ewakuacja poszkodowanych przejętych od "szpicy" po klatce schodowej do punktu medycznego (w razie potrzeby)',
                        'Dostarczenie zapasowego odcinka W52 po klatce i zostawienie go obok rozdzielacza mieszkaniowego'
                    ]
                },
                rear4: {
                    role: 'Przodownik II roty (STOPER 4)',
                    gear: [
                        'Torba gazownika / elektryka',
                        'Drabinka teleskopowa'
                    ],
                    tasks: [
                        'Lokalizacja i wyłączenie przeciwpożarowego lub głównego wyłącznika prądu (w blokach mieszkalnych z windą przed odłączeniem prądu sprowadzić windy na dół, skontrolować i dopiero wyłączyć prąd)',
                        'Lokalizacja i na wyraźne polecenie KDR-a zamknięcie głównego zaworu gazu do budynku',
                        'Współorganizacja punktu medycznego i punktu RIT - w miejscu wskazanym przez dowódcę lub, jeśli nie było wskazanego miejsca, w okolicy 1 wozu w miejscu bezpiecznym',
                        'Udzielanie KPP w punkcie medycznym (w razie potrzeby)'
                    ]
                }
            }
        },
        fire2: {
            label: 'Pożar II wóz',
            seats: {
                driver: {
                    role: 'Kierowca',
                    gear: [
                        'Zabezpieczenie miejsca zdarzenia (taśma, stożki ostrzegawcze, dyski świetlne itp.)',
                        'Zasilenie w wodę 1 wozu',
                        'Zorganizowanie zasilania z hydrantu przy współudziale DARII 2 i innych w danej chwili wolnych strażaków'
                    ],
                    tasks: [
                        'Zabezpieczenie miejsca zdarzenia (taśma, stożki ostrzegawcze, dyski świetlne itp.)',
                        'Zasilenie w wodę 1 wozu',
                        'Zorganizowanie zasilania z hydrantu przy współudziale DARII 2 i innych w danej chwili wolnych strażaków'
                    ]
                },
                commander: {
                    role: 'Dowódca "16" lub DARIA 2',
                    gear: [
                        'Nadzoruje ewakuację'
                    ],
                    tasks: [
                        'Wsparcie KDR-a w prowadzeniu rozpoznania',
                        'Kontrola nad organizacją oddymiania klatki schodowej',
                        'Kontrola nad przeszukiwaniem mieszkań sąsiednich i powyższych w stosunku do mieszkania objętego pożarem',
                        'Kontrola nad organizacją punktu pomocy medycznej i punktem RIT'
                    ]
                },
                rear1: {
                    role: 'Przodownik I roty (STOPER 5)',
                    gear: [
                        'Amerykan',
                        'Linkę ratowniczą (minimum jedna linka na rotę)',
                        'Maskę ucieczkową do ewakuacji poszkodowanego'
                    ],
                    tasks: [
                        'Przeszukiwanie mieszkań sąsiednich i powyższych w stosunku do mieszkania objętego pożarem',
                        'Ewakuacja poszkodowanych z zadymionych pomieszczeń',
                        'Organizacja oddymiania klatki schodowej',
                        'Ewakuacja poszkodowanych przy użyciu drabin przystawnych (w razie konieczności)',
                        'Ewakuacja poszkodowanych przy użyciu technik linowych (w razie konieczności)'
                    ]
                },
                rear2: {
                    role: 'Pomocnik I roty (STOPER 6)',
                    gear: [
                        'Linkę ratowniczą (minimum jedna linka na rotę)',
                        'Maskę ucieczkową do ewakuacji poszkodowanego'
                    ],
                    tasks: [
                        'Przeszukiwanie mieszkań sąsiednich i powyższych w stosunku do mieszkania objętego pożarem',
                        'Ewakuacja poszkodowanych z zadymionych pomieszczeń',
                        'Organizacja oddymiania klatki schodowej',
                        'Ewakuacja poszkodowanych przy użyciu drabin przystawnych (w razie konieczności)',
                        'Ewakuacja poszkodowanych przy użyciu technik linowych (w razie konieczności)'
                    ]
                },
                rear3: {
                    role: 'Przodownik II roty (STOPER 8)',
                    gear: [
                        'Stanowisko RIT',
                        'Wyznaczenie stanowiska i przygotowanie niezbędnego sprzętu do podjęcia działań w zakresie RIT',
                        'Sprawdzenie budynku pod kątem RIT',
                        'Poinformowanie KDR o wykonanych czynnościach'
                    ],
                    tasks: [
                        'Przeszukiwanie mieszkań sąsiednich i powyższych w stosunku do mieszkania objętego pożarem',
                        'Ewakuacja poszkodowanych z zadymionych pomieszczeń',
                        'Organizacja oddymiania klatki schodowej',
                        'Ewakuacja poszkodowanych przy użyciu drabin przystawnych (w razie konieczności)',
                        'Ewakuacja poszkodowanych przy użyciu technik linowych (w razie konieczności)'
                    ]
                },
                rear4: {
                    role: 'Pomocnik II roty (STOPER 7)',
                    gear: [
                        'Stanowisko RIT',
                        'Wyznaczenie stanowiska i przygotowanie niezbędnego sprzętu do podjęcia działań w zakresie RIT',
                        'Sprawdzenie budynku pod kątem RIT',
                        'Poinformowanie KDR o wykonanych czynnościach'
                    ],
                    tasks: [
                        'Przeszukiwanie mieszkań sąsiednich i powyższych w stosunku do mieszkania objętego pożarem',
                        'Ewakuacja poszkodowanych z zadymionych pomieszczeń',
                        'Organizacja oddymiania klatki schodowej',
                        'Ewakuacja poszkodowanych przy użyciu drabin przystawnych (w razie konieczności)',
                        'Ewakuacja poszkodowanych przy użyciu technik linowych (w razie konieczności)'
                    ]
                }
            }
        },
        accident: {
            label: 'Wypadek',
            seats: {
                driver: {
                    role: 'Kierowca',
                    gear: [PLACEHOLDER],
                    tasks: [
                        'Zabezpieczenie miejsca zdarzenia',
                        'Spisywanie wszystkich sluzb przybylych na miejsce',
                        'Pomoc w dzialaniach'
                    ]
                },
                commander: {
                    role: 'Dowódca',
                    gear: [PLACEHOLDER],
                    tasks: [
                        'Rozpoznanie'
                    ]
                },
                rear1: {
                    role: 'Przodownik I roty',
                    gear: [PLACEHOLDER],
                    tasks: [
                        'Idzie z dowodca na rozpoznanie',
                        'Odlacza stacyjke i akumulator',
                        'Sprawdza czy jest instalacja gazowa i odlacza ja',
                        'Sprawdza stan poszkodowanych i zabezpiecza ich kocem',
                        'Zaklada zabezpieczenie na poduszke powietrzna'
                    ]
                },
                rear2: {
                    role: 'Pomocnik I roty',
                    gear: [PLACEHOLDER],
                    tasks: [
                        'Rozklada sprzet hydrauliczny z SRt lub GBA'
                    ]
                },
                rear3: {
                    role: 'Przodownik II roty',
                    gear: [PLACEHOLDER],
                    tasks: [
                        'Buduje linie gasnicza zakonczona pradownica pianowa',
                        'Aparat, gasnica, obserwacja terenu wypadku'
                    ]
                },
                rear4: {
                    role: 'Pomocnik II roty',
                    gear: [PLACEHOLDER],
                    tasks: [
                        'Zabezpiecza teren - pacholki, tasma, trojkat, znaki'
                    ]
                }
            }
        }
    };

    const MODE_LABELS = {
        gear: 'Co zabrać',
        tasks: 'Zadania'
    };

    // Korekta nazwy roli po stronie danych (bez zaleznosci od kodowania pliku).
    if (SCENARIOS.accident && SCENARIOS.accident.seats && SCENARIOS.accident.seats.commander) {
        SCENARIOS.accident.seats.commander.role = 'Dowodca';
    }

    const state = {
        scenario: '',
        mode: 'gear',
        selectedSeat: '',
        lastFocusedHelmet: null
    };

    const dom = {};

    document.addEventListener('DOMContentLoaded', initModule);

    function initModule() {
        dom.scenarioButtons = Array.from(document.querySelectorAll('[data-rota-scenario]'));
        dom.modeButtons = Array.from(document.querySelectorAll('[data-rota-mode]'));
        dom.modeGroup = document.querySelector('[data-rota-mode-group]');
        dom.hint = document.querySelector('[data-rota-hint]');
        dom.map = document.querySelector('[data-rota-map]');
        dom.mapImage = document.querySelector('[data-rota-image]');
        dom.helmets = Array.from(document.querySelectorAll('[data-rota-seat]'));
        dom.modal = document.querySelector('[data-rota-modal]');
        dom.modalTitle = document.getElementById('rota-modal-title');
        dom.modalContext = document.querySelector('[data-rota-modal-context]');
        dom.modalList = document.querySelector('[data-rota-modal-list]');
        dom.modalCloseButtons = Array.from(document.querySelectorAll('[data-rota-modal-close]'));

        if (!dom.scenarioButtons.length || !dom.modeButtons.length || !dom.map || !dom.modal) {
            return;
        }

        dom.scenarioButtons.forEach((button) => {
            button.addEventListener('click', () => setScenario(button.dataset.rotaScenario || ''));
        });

        dom.modeButtons.forEach((button) => {
            button.addEventListener('click', () => setMode(button.dataset.rotaMode || ''));
        });

        dom.helmets.forEach((helmet) => {
            helmet.addEventListener('click', () => openSeatDetails(helmet.dataset.rotaSeat || '', helmet));
        });

        dom.modalCloseButtons.forEach((button) => {
            button.addEventListener('click', closeModal);
        });

        dom.modal.addEventListener('click', (event) => {
            if (event.target === dom.modal) {
                closeModal();
            }
        });

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && !dom.modal.hidden) {
                closeModal();
            }
        });

        setupPreferredMapImage();
        updateControls();
        updateHelmetLabels();
        updateHint();
    }

    function setupPreferredMapImage() {
        if (!dom.mapImage) {
            return;
        }

        const preferredRaw = dom.mapImage.dataset.rotaImagePreferred || '';
        const preferredPaths = preferredRaw
            .split(',')
            .map((path) => path.trim())
            .filter(Boolean);

        if (!preferredPaths.length) {
            return;
        }

        probePreferredPath(preferredPaths, 0);
    }

    function probePreferredPath(paths, index) {
        if (!Array.isArray(paths) || index >= paths.length) {
            return;
        }

        const candidate = paths[index];
        const probeImage = new Image();

        probeImage.addEventListener('load', () => {
            dom.mapImage.setAttribute('src', candidate);
        });

        probeImage.addEventListener('error', () => {
            probePreferredPath(paths, index + 1);
        });

        probeImage.src = candidate;
    }

    function setScenario(nextScenario) {
        if (!SCENARIOS[nextScenario]) {
            return;
        }

        state.scenario = nextScenario;
        state.mode = 'gear';
        state.selectedSeat = '';
        closeModal();

        updateControls();
        updateHelmetLabels();
        updateHint();
    }

    function setMode(nextMode) {
        if (!state.scenario || !MODE_LABELS[nextMode]) {
            return;
        }

        state.mode = nextMode;
        state.selectedSeat = '';
        closeModal();

        updateControls();
        updateHint();
    }

    function updateControls() {
        dom.scenarioButtons.forEach((button) => {
            const isActive = button.dataset.rotaScenario === state.scenario;
            button.classList.toggle('is-active', isActive);
            button.setAttribute('aria-pressed', String(isActive));
        });

        const hasScenario = Boolean(state.scenario);
        dom.modeGroup.hidden = !hasScenario;
        dom.map.hidden = !hasScenario;

        dom.modeButtons.forEach((button) => {
            const isActive = hasScenario && button.dataset.rotaMode === state.mode;
            button.classList.toggle('is-active', isActive);
            button.setAttribute('aria-pressed', String(isActive));
            button.disabled = !hasScenario;
        });

        dom.helmets.forEach((helmet) => {
            const isSelected = helmet.dataset.rotaSeat === state.selectedSeat;
            helmet.classList.toggle('is-selected', isSelected);
            helmet.disabled = !hasScenario;
        });
    }

    function updateHelmetLabels() {
        dom.helmets.forEach((helmet) => {
            const seatId = helmet.dataset.rotaSeat || '';
            const roleName = getRoleName(seatId);
            helmet.title = roleName;
            helmet.setAttribute('aria-label', roleName);
        });
    }

    function updateHint() {
        if (!dom.hint) {
            return;
        }

        if (!state.scenario) {
            dom.hint.textContent = 'Wybierz scenariusz, aby aktywować mapę z rolami.';
            return;
        }

        const scenarioLabel = SCENARIOS[state.scenario]?.label || '';
        const modeLabel = MODE_LABELS[state.mode] || '';

        if (state.scenario === 'accident' && state.mode === 'gear') {
            dom.hint.textContent = `${scenarioLabel}: materiały są w przygotowaniu.`;
            return;
        }

        dom.hint.textContent = `${scenarioLabel} - ${modeLabel}. Kliknij hełm, aby zobaczyć szczegóły.`;
    }

    function getRoleName(seatId) {
        const seatData = SCENARIOS[state.scenario]?.seats?.[seatId];
        if (seatData?.role) {
            return seatData.role;
        }

        const fallbackRoles = {
            driver: 'Kierowca',
            commander: 'Dowódca',
            rear1: 'Rota 1',
            rear2: 'Rota 2',
            rear3: 'Rota 3',
            rear4: 'Rota 4'
        };

        return fallbackRoles[seatId] || 'Rola';
    }

    function openSeatDetails(seatId, sourceHelmet) {
        if (!state.scenario || !seatId) {
            return;
        }

        const seatData = SCENARIOS[state.scenario]?.seats?.[seatId];
        const role = seatData?.role || getRoleName(seatId);
        const items = state.mode === 'tasks' ? seatData?.tasks : seatData?.gear;
        const resolvedItems = Array.isArray(items) && items.length ? items : [PLACEHOLDER];

        state.selectedSeat = seatId;
        state.lastFocusedHelmet = sourceHelmet || null;
        updateControls();

        if (dom.modalTitle) {
            dom.modalTitle.textContent = role;
        }
        if (dom.modalContext) {
            dom.modalContext.textContent = `${SCENARIOS[state.scenario]?.label || ''} - ${MODE_LABELS[state.mode] || ''}`;
        }
        if (dom.modalList) {
            dom.modalList.innerHTML = '';
            resolvedItems.forEach((item) => {
                const li = document.createElement('li');
                li.textContent = item;
                dom.modalList.appendChild(li);
            });
        }

        dom.modal.hidden = false;
        const closeBtn = dom.modal.querySelector('[data-rota-modal-close]');
        closeBtn?.focus();
    }

    function closeModal() {
        if (!dom.modal) {
            return;
        }

        dom.modal.hidden = true;
        state.selectedSeat = '';
        updateControls();

        if (state.lastFocusedHelmet) {
            state.lastFocusedHelmet.focus();
            state.lastFocusedHelmet = null;
        }
    }
})();
