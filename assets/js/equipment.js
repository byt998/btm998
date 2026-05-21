// =========================================================
// File: assets/js/equipment.js
// Global equipment search across all vehicle tables in Supabase
// =========================================================

(() => {
    const VEHICLE_TABLES = {
        '411-22': 'vehicle_411_22',
        '411-23': 'vehicle_411_23',
        '411-25': 'vehicle_411_25',
        '411-26': 'vehicle_411_26',
        '411-51': 'vehicle_411_51',
        '411-43': 'vehicle_411_43',
        '411-71': 'vehicle_411_71',
        '411-91': 'vehicle_411_91',
        '411-59': 'vehicle_411_59',
        '411-22-tyl': 'vehicle_411_22_tyl',
        '411-23-tyl': 'vehicle_411_23_tyl',
    };

    const selectors = {
        form: '#equipment-search-form',
        query: '#equipment-query',
        vehicleFilter: '#equipment-vehicle-filter',
        suggestions: '#equipment-suggestions',
        status: '[data-search-status]',
        empty: '[data-results-empty]',
        list: '[data-results-list]',
    };

    const suggestionState = {
        loaded: false,
        loading: false,
        allNames: [],
    };

    document.addEventListener('DOMContentLoaded', () => {
        const form = document.querySelector(selectors.form);
        const queryInput = document.querySelector(selectors.query);
        const vehicleFilter = document.querySelector(selectors.vehicleFilter);
        const suggestions = document.querySelector(selectors.suggestions);
        const status = document.querySelector(selectors.status);
        const empty = document.querySelector(selectors.empty);
        const list = document.querySelector(selectors.list);
        const { supabase } = window.AppCommon;

        if (!form || !queryInput || !status || !empty || !list || !supabase) {
            if (empty) {
                empty.textContent = 'Brak konfiguracji Supabase lub elementów interfejsu.';
                empty.hidden = false;
            }
            return;
        }

        if (suggestions) {
            queryInput.addEventListener('focus', () => {
                ensureSuggestionsLoaded(supabase, suggestions);
            }, { once: true });
            queryInput.addEventListener('input', async () => {
                if (!suggestionState.loaded && !suggestionState.loading) {
                    await ensureSuggestionsLoaded(supabase, suggestions);
                }
                updateSuggestionsByTerm(queryInput.value, suggestions);
            });

            // Preload w tle, aby podpowiedzi były gotowe możliwie szybko.
            ensureSuggestionsLoaded(supabase, suggestions);
        }

        form.addEventListener('submit', async (event) => {
            event.preventDefault();
            const searchTerm = queryInput.value.trim();
            const selectedVehicle = vehicleFilter?.value?.trim() || '';
            if (!searchTerm) {
                empty.textContent = 'Wpisz nazwę sprzętu, aby rozpocząć wyszukiwanie.';
                empty.hidden = false;
                list.innerHTML = '';
                status.hidden = true;
                return;
            }

            status.hidden = false;
            status.textContent = 'Wyszukiwanie...';
            empty.hidden = true;
            list.innerHTML = '';

            const results = await fetchEquipment(searchTerm.toLowerCase(), supabase, selectedVehicle);

            status.hidden = true;
            if (results.length === 0) {
                empty.textContent = 'Nie znaleziono sprzętu o podanej nazwie.';
                empty.hidden = false;
                return;
            }

            renderResults(results, list);
        });
    });

    async function ensureSuggestionsLoaded(supabaseClient, datalist) {
        if (suggestionState.loaded || suggestionState.loading) {
            return;
        }

        suggestionState.loading = true;
        const uniqueNames = new Set();

        const tasks = Object.values(VEHICLE_TABLES).map(async (tableName) => {
            const { data, error } = await supabaseClient
                .from(tableName)
                .select('*');

            if (error) {
                console.warn(`Błąd podczas pobierania podpowiedzi z ${tableName}:`, error);
                return;
            }

            (data || []).forEach((row) => {
                const name = extractValue(row, ['equipment_name', 'SPRZĘT', 'SPRZET', 'sprzęt', 'sprzet']);
                if (name) {
                    uniqueNames.add(name);
                }
            });
        });

        await Promise.all(tasks);

        suggestionState.allNames = Array.from(uniqueNames)
            .sort((a, b) => a.localeCompare(b, 'pl', { sensitivity: 'base' }));
        suggestionState.loaded = true;
        suggestionState.loading = false;

        renderSuggestionOptions(suggestionState.allNames.slice(0, 20), datalist);
    }

    function updateSuggestionsByTerm(term, datalist) {
        if (!datalist || !suggestionState.loaded) {
            return;
        }

        const normalizedTerm = normalizeForSearch(term.trim());
        if (!normalizedTerm) {
            renderSuggestionOptions(suggestionState.allNames.slice(0, 20), datalist);
            return;
        }

        const filtered = suggestionState.allNames
            .filter((name) => normalizeForSearch(name).includes(normalizedTerm))
            .slice(0, 20);

        renderSuggestionOptions(filtered, datalist);
    }

    function renderSuggestionOptions(values, datalist) {
        datalist.innerHTML = '';
        values.forEach((value) => {
            const option = document.createElement('option');
            option.value = value;
            datalist.appendChild(option);
        });
    }

    function normalizeForSearch(value) {
        return value
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '');
    }

    async function fetchEquipment(term, supabaseClient, vehicleCodeFilter = '') {
        const results = [];
        const entries = Object.entries(VEHICLE_TABLES)
            .filter(([vehicleCode]) => !vehicleCodeFilter || vehicleCode === vehicleCodeFilter);

        const tasks = entries.map(async ([vehicleCode, tableName]) => {
            const baseSelect = 'compartment, equipment_name, quantity, created_at';
            const imageColumn = 'img';
            const selectWithImage = `${baseSelect}, ${imageColumn}`;

            const executeQuery = (selectColumns, withOrder) => {
                let query = supabaseClient.from(tableName).select(selectColumns);
                if (withOrder) {
                    query = query
                        .order('position', { ascending: true, nullsLast: true })
                        .order('created_at', { ascending: true, nullsLast: true });
                }
                return query;
            };

            let selectColumns = selectWithImage;
            let supportsImage = true;
            let { data, error } = await executeQuery(selectColumns, true);

            if (error) {
                const isMissingColumn =
                    error.code === '42703' ||
                    (typeof error.message === 'string' && error.message.includes(imageColumn));

                if (isMissingColumn) {
                    supportsImage = false;
                    selectColumns = baseSelect;
                    ({ data, error } = await executeQuery(selectColumns, true));
                }
            }

            if (error) {
                console.warn(`Błąd podczas pobierania ${tableName} z sortowaniem:`, error);
                ({ data, error } = await executeQuery(selectColumns, false));

                if (error && supportsImage) {
                    const isStillMissingImage =
                        error.code === '42703' ||
                        (typeof error.message === 'string' && error.message.includes(imageColumn));
                    if (isStillMissingImage) {
                        supportsImage = false;
                        selectColumns = baseSelect;
                        ({ data, error } = await executeQuery(selectColumns, false));
                    }
                }

                if (error) {
                    console.warn(`Błąd podczas pobierania ${tableName} (fallback):`, error);
                    return;
                }
            }

            (data || [])
                .filter((row) => {
                    const name = extractValue(row, ['equipment_name', 'SPRZĘT', 'SPRZET', 'sprzęt', 'sprzet']);
                    return name.toLowerCase().includes(term);
                })
                .forEach((row) => {
                    results.push({
                        vehicleCode,
                        compartment: extractValue(row, ['compartment']) || 'Nieoznaczona skrytka',
                        equipment: extractValue(row, ['equipment_name', 'SPRZĘT', 'SPRZET', 'sprzęt', 'sprzet']) || 'Sprzęt bez nazwy',
                        quantity: extractValue(row, ['quantity', 'ILOŚĆ', 'ILOSC', 'ilość', 'ilosc']),
                        imageUrl: extractValue(row, ['img', 'IMG', 'obraz', 'image']),
                    });
                });
        });

        await Promise.all(tasks);
        return results;
    }

    function extractValue(row, keys) {
        for (const key of keys) {
            if (row[key] !== undefined && row[key] !== null) {
                const value = String(row[key]).trim();
                if (value.length > 0) {
                    return value;
                }
            }
        }
        return '';
    }

    function renderResults(results, container) {
        container.innerHTML = '';
        results.forEach((item) => {
            const card = document.createElement('article');
            card.className = 'equipment-card search-card';

            const media = document.createElement('div');
            media.className = 'search-card__media';
            if (item.imageUrl) {
                const img = document.createElement('img');
                img.src = item.imageUrl;
                img.alt = item.equipment;
                img.loading = 'lazy';
                media.appendChild(img);
            } else {
                const placeholder = document.createElement('div');
                placeholder.className = 'search-card__media--placeholder';
                placeholder.textContent = 'Brak zdjęcia';
                media.appendChild(placeholder);
            }

            const content = document.createElement('div');
            content.className = 'search-card__content';

            const header = document.createElement('div');
            header.className = 'search-card__header';

            const title = document.createElement('h3');
            title.className = 'search-card__title';
            title.textContent = item.equipment;
            header.appendChild(title);

            const details = document.createElement('dl');
            details.className = 'search-card__details';

            const pairs = [
                { term: 'Wóz', value: item.vehicleCode },
                { term: 'Skrytka', value: item.compartment },
                { term: 'Ilość', value: item.quantity || 'brak danych' },
            ];
            pairs.forEach(({ term, value }) => {
                const wrapper = document.createElement('div');
                const dt = document.createElement('dt');
                dt.textContent = term;
                const dd = document.createElement('dd');
                dd.textContent = value;
                wrapper.appendChild(dt);
                wrapper.appendChild(dd);
                details.appendChild(wrapper);
            });

            content.appendChild(header);
            content.appendChild(details);

            card.appendChild(media);
            card.appendChild(content);
            container.appendChild(card);
        });
    }
})();
