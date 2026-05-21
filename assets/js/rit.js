// =========================================================
// File: assets/js/rit.js
// Toggle RIT bag contents and load data from Supabase
// =========================================================

(() => {
    const selectors = {
        trigger: '[data-action="show-rit-kit"]',
        section: '[data-rit-section]',
        tableBody: '[data-rit-table-body]',
        status: '[data-rit-status]',
        introImage: '.rit-intro__image img'
    };

    const IMAGE_CLOSED = 'https://rescuesystem.pl/3415-large_default/torba-rit-pack-one-torba-rit-courant.jpg';
    const IMAGE_OPEN = 'https://rescuesystem.pl/3951-large_default/zestaw-dla-rot-asekuracyjnych-s1rit-torba-rit-z-wyposazeniem.jpg';
    const TABLE_NAME = 'rit_equipment';

    const state = {
        supabase: null,
        isOpen: false,
        dataLoaded: false
    };

    document.addEventListener('DOMContentLoaded', () => {
        const button = document.querySelector(selectors.trigger);
        const section = document.querySelector(selectors.section);
        const introImage = document.querySelector(selectors.introImage);

        if (!button || !section || !introImage) {
            return;
        }

        state.supabase = window.AppCommon?.supabase ?? null;

        button.addEventListener('click', async () => {
            state.isOpen = !state.isOpen;

            if (state.isOpen) {
                section.hidden = false;
                introImage.src = IMAGE_OPEN;
                button.textContent = 'Ukryj zawartość';

                if (!state.dataLoaded) {
                    await loadEquipment();
                }
            } else {
                section.hidden = true;
                introImage.src = IMAGE_CLOSED;
                button.textContent = 'Pokaż zawartość';
                updateStatus('');
            }
        });
    });

    async function loadEquipment() {
        const tableBody = document.querySelector(selectors.tableBody);
        if (!tableBody) {
            return;
        }

        if (!state.supabase) {
            updateStatus('Brak konfiguracji Supabase. Skontaktuj się z administratorem.', 'error');
            return;
        }

        updateStatus('Ładuję dane...', 'info');

        const { data, error } = await state.supabase
            .from(TABLE_NAME)
            .select('equipment_name, quantity')
            .order('position', { ascending: true, nullsLast: true })
            .order('equipment_name', { ascending: true });

        if (error) {
            console.error('Błąd podczas pobierania zawartości torby RIT:', error);
            updateStatus('Nie udało się pobrać danych. Sprawdź konfigurację Supabase.', 'error');
            return;
        }

        updateStatus('');
        state.dataLoaded = true;

        if (!data || !data.length) {
            tableBody.innerHTML = '<tr><td colspan="2">Brak danych w tabeli. Uzupełnij zawartość torby RIT w Supabase.</td></tr>';
            return;
        }

        tableBody.innerHTML = data
            .map((row) => `
                <tr>
                    <td>${row.equipment_name || 'Sprzęt bez nazwy'}</td>
                    <td>${row.quantity || 'brak danych'}</td>
                </tr>
            `)
            .join('');
    }

    function updateStatus(message, type) {
        const statusEl = document.querySelector(selectors.status);
        if (!statusEl) {
            return;
        }
        if (!message) {
            statusEl.hidden = true;
            statusEl.textContent = '';
            statusEl.className = 'rit-status';
            return;
        }
        statusEl.hidden = false;
        statusEl.textContent = message;
        statusEl.className = `rit-status rit-status--${type}`;
    }
})();
