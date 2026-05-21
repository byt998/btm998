// =========================================================
// Plik: assets/js/shortages.js
// Spis treści logiki:
// 1. Pobieranie zgłoszonych braków z Supabase
// 2. Filtrowanie wyników po wozie, dacie oraz sprzęcie
// 3. Renderowanie tabeli wyników oraz obsługa komunikatów
// =========================================================

(() => {
    document.addEventListener('DOMContentLoaded', () => {
        const form = document.getElementById('shortage-filters');
        const tableWrapper = document.querySelector('[data-shortage-table]');
        const tableBody = document.querySelector('[data-shortage-list]');
        const hint = document.querySelector('[data-shortage-hint]');
        const resetButton = document.querySelector('[data-action="reset-filters"]');

        const vehicleField = document.getElementById('filter-vehicle');
        const dateFromField = document.getElementById('filter-date-from');
        const dateToField = document.getElementById('filter-date-to');
        const equipmentField = document.getElementById('filter-equipment');

        const { supabase } = window.AppCommon;
        if (!supabase || !form || !tableWrapper || !tableBody || !hint) {
            hint.textContent = 'Brak konfiguracji Supabase lub elementów interfejsu.';
            return;
        }

        let shortages = [];

        form.addEventListener('submit', (event) => {
            event.preventDefault();
            renderTable(applyFilters());
        });

        resetButton?.addEventListener('click', () => {
            form.reset();
            renderTable(shortages);
        });

        loadShortages();

        async function loadShortages() {
            hint.textContent = 'Ładowanie danych...';
            tableWrapper.hidden = true;

            const { data, error } = await supabase
                .from('equipment_shortages')
                .select('*')
                .order('reported_at', { ascending: false });

            if (error) {
                console.error(error);
                hint.textContent = 'Nie udało się pobrać zgłoszeń. Sprawdź konfigurację Supabase.';
                return;
            }

            shortages = Array.isArray(data) ? data : [];

            if (!shortages.length) {
                hint.textContent = 'Brak zgłoszonych braków.';
                return;
            }

            hint.textContent = `${shortages.length} zgłoszeń.`;
            tableWrapper.hidden = false;
            renderTable(shortages);
        }

        function applyFilters() {
            const vehicleValue = vehicleField.value.trim();
            const dateFromValue = dateFromField.value ? new Date(dateFromField.value) : null;
            const dateToValue = dateToField.value ? new Date(dateToField.value) : null;
            const equipmentValue = equipmentField.value.trim().toLowerCase();

            return shortages.filter((item) => {
                const matchesVehicle = vehicleValue ? item.vehicle_code === vehicleValue : true;

                const reportedAt = item.reported_at ? new Date(item.reported_at) : null;
                let matchesDate = true;
                if (dateFromValue && reportedAt) {
                    matchesDate = reportedAt >= startOfDay(dateFromValue);
                }
                if (matchesDate && dateToValue && reportedAt) {
                    matchesDate = reportedAt <= endOfDay(dateToValue);
                }

                const matchesEquipment = equipmentValue
                    ? `${item.equipment_name || ''}`.toLowerCase().includes(equipmentValue)
                    : true;

                return matchesVehicle && matchesDate && matchesEquipment;
            });
        }

        function renderTable(rows) {
            tableBody.innerHTML = '';

            if (!rows.length) {
                hint.textContent = 'Brak zgłoszeń spełniających kryteria.';
                tableWrapper.hidden = true;
                return;
            }

            hint.textContent = `Znaleziono ${rows.length} zgłoszeń.`;
            tableWrapper.hidden = false;

            rows.forEach((row) => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${formatDate(row.reported_at)}</td>
                    <td>${row.vehicle_code || '-'}</td>
                    <td>${row.compartment || '-'}</td>
                    <td>${row.equipment_name || '-'}</td>
                    <td>${row.quantity ?? '-'}</td>
                    <td>${row.reporter_name || '-'}</td>
                    <td>${row.reporter_shift || '-'}</td>
                `;
                tableBody.appendChild(tr);
            });
        }

        function formatDate(isoString) {
            if (!isoString) {
                return '-';
            }
            const date = new Date(isoString);
            if (Number.isNaN(date.getTime())) {
                return isoString;
            }
            return date.toLocaleString('pl-PL');
        }

        function startOfDay(date) {
            const clone = new Date(date);
            clone.setHours(0, 0, 0, 0);
            return clone;
        }

        function endOfDay(date) {
            const clone = new Date(date);
            clone.setHours(23, 59, 59, 999);
            return clone;
        }
    });
})();
