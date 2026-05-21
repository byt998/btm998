// =========================================================
// File: assets/js/measurement-devices.js
// Manage measurement device list and threshold details from Supabase
// =========================================================

(() => {
    const selectors = {
        deviceList: '[data-device-list]',
        deviceDetail: '[data-device-detail]',
        deviceImage: '[data-device-image]',
        deviceNoImage: '[data-device-no-image]',
        deviceName: '[data-device-name]',
        deviceTableBody: '[data-device-table]',
        deviceStatus: '[data-device-status]',
        devicePlaceholder: '[data-device-placeholder]'
    };

    const state = {
        supabase: null,
        devices: [],
        deviceMap: new Map(),
        detailCache: new Map(),
        activeId: null,
        activeButton: null
    };

    const STATUS_CLASS = {
        info: 'measurement-devices__status--info',
        error: 'measurement-devices__status--error',
        success: 'measurement-devices__status--success'
    };

    document.addEventListener('DOMContentLoaded', initModule);

    async function initModule() {
        const { supabase } = window.AppCommon || {};
        state.supabase = supabase ?? null;

        if (!state.supabase) {
            updateStatus('Brak konfiguracji Supabase. Skontaktuj sie z administratorem.', 'error');
            return;
        }

        await loadDevices();
    }

    async function loadDevices() {
        resetInterface();
        updateStatus('Ladowanie listy urzadzen...', 'info');

        const listEl = document.querySelector(selectors.deviceList);
        const placeholder = listEl?.querySelector(selectors.devicePlaceholder);

        if (placeholder) {
            placeholder.textContent = 'Trwa ladowanie listy urzadzen...';
            placeholder.hidden = false;
        }

        const { data, error } = await state.supabase
            .from('measurement_devices')
            .select('id, device_name, image_url, display_order')
            .order('display_order', { ascending: true, nullsLast: true })
            .order('device_name', { ascending: true });

        if (error) {
            console.error('Nie mozna pobrac listy urzadzen', error);
            updateStatus('Nie udalo sie pobrac listy urzadzen. Sprobuj ponownie pozniej.', 'error');
            return;
        }

        state.devices = data ?? [];
        state.deviceMap = new Map(state.devices.map((device) => [device.id, device]));

        renderDeviceButtons();

        if (!state.devices.length) {
            if (placeholder) {
                placeholder.textContent = 'Brak urzadzen w bazie. Dodaj je w Supabase.';
                placeholder.hidden = false;
            }
            updateStatus('Brak urzadzen do wyswietlenia.', 'info');
            return;
        }

        if (placeholder) {
            placeholder.hidden = true;
        }

        updateStatus('');
        await selectDevice(state.devices[0].id);
    }

    function renderDeviceButtons() {
        const listEl = document.querySelector(selectors.deviceList);
        if (!listEl) {
            return;
        }

        listEl.querySelectorAll('.measurement-devices__button').forEach((btn) => btn.remove());

        state.devices.forEach((device) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'measurement-devices__button';
            button.textContent = device.device_name;
            button.dataset.deviceId = device.id;
            button.addEventListener('click', () => selectDevice(device.id));
            listEl.appendChild(button);
        });
    }

    async function selectDevice(deviceId) {
        if (!deviceId || !state.deviceMap.has(deviceId)) {
            return;
        }
        if (state.activeId === deviceId) {
            return;
        }

        state.activeId = deviceId;
        highlightActiveButton(deviceId);

        const device = state.deviceMap.get(deviceId);
        if (!device) {
            return;
        }

        if (state.detailCache.has(deviceId)) {
            renderDeviceDetail(device, state.detailCache.get(deviceId));
            updateStatus('');
            return;
        }

        updateStatus(`Ladowanie danych dla: ${device.device_name}`, 'info');

        const { data, error } = await state.supabase
            .from('measurement_device_thresholds')
            .select('sensor, low_alarm, high_alarm, position')
            .eq('device_id', deviceId)
            .order('position', { ascending: true, nullsLast: true })
            .order('sensor', { ascending: true });

        if (error) {
            console.error('Nie mozna pobrac progow alarmowych', error);
            updateStatus('Nie udalo sie pobrac danych urzadzenia.', 'error');
            return;
        }

        const rows = data ?? [];
        state.detailCache.set(deviceId, rows);
        updateStatus('');
        renderDeviceDetail(device, rows);
    }

    function renderDeviceDetail(device, rows) {
        const detailEl = document.querySelector(selectors.deviceDetail);
        const nameEl = document.querySelector(selectors.deviceName);
        const tableBody = document.querySelector(selectors.deviceTableBody);
        const imageEl = document.querySelector(selectors.deviceImage);
        const noImageEl = document.querySelector(selectors.deviceNoImage);

        if (!detailEl || !nameEl || !tableBody || !imageEl || !noImageEl) {
            return;
        }

        detailEl.hidden = false;
        nameEl.textContent = device.device_name;

        if (device.image_url) {
            imageEl.src = device.image_url;
            imageEl.alt = `Zdjecie: ${device.device_name}`;
            imageEl.hidden = false;
            noImageEl.hidden = true;
        } else {
            imageEl.removeAttribute('src');
            imageEl.alt = '';
            imageEl.hidden = true;
            noImageEl.hidden = false;
        }

        if (!rows.length) {
            tableBody.innerHTML = '<tr><td colspan="3">Brak zdefiniowanych progow alarmowych dla tego urzadzenia.</td></tr>';
            return;
        }

        tableBody.innerHTML = rows.map((row) => `
            <tr>
                <td>${escapeHtml(row.sensor)}</td>
                <td>${formatValue(row.low_alarm)}</td>
                <td>${formatValue(row.high_alarm)}</td>
            </tr>
        `).join('');
    }

    function highlightActiveButton(deviceId) {
        const listEl = document.querySelector(selectors.deviceList);
        if (!listEl) {
            return;
        }

        let nextActive = null;
        listEl.querySelectorAll('.measurement-devices__button').forEach((button) => {
            if (button.dataset.deviceId === deviceId) {
                nextActive = button;
            } else {
                button.classList.remove('is-active');
            }
        });

        if (nextActive) {
            nextActive.classList.add('is-active');
            state.activeButton = nextActive;
        } else {
            state.activeButton = null;
        }
    }

    function resetInterface() {
        state.activeId = null;
        state.activeButton = null;
        state.detailCache.clear();

        const detailEl = document.querySelector(selectors.deviceDetail);
        const tableBody = document.querySelector(selectors.deviceTableBody);
        const nameEl = document.querySelector(selectors.deviceName);
        const imageEl = document.querySelector(selectors.deviceImage);
        const noImageEl = document.querySelector(selectors.deviceNoImage);

        if (detailEl) {
            detailEl.hidden = true;
        }
        if (tableBody) {
            tableBody.innerHTML = '';
        }
        if (nameEl) {
            nameEl.textContent = '';
        }
        if (imageEl) {
            imageEl.hidden = true;
            imageEl.removeAttribute('src');
            imageEl.alt = '';
        }
        if (noImageEl) {
            noImageEl.hidden = true;
        }
    }

    function updateStatus(message, type = 'info') {
        const statusEl = document.querySelector(selectors.deviceStatus);
        if (!statusEl) {
            return;
        }

        statusEl.textContent = message || '';
        statusEl.hidden = !message;

        Object.values(STATUS_CLASS).forEach((className) => {
            statusEl.classList.remove(className);
        });

        if (message && STATUS_CLASS[type]) {
            statusEl.classList.add(STATUS_CLASS[type]);
        }
    }

    function escapeHtml(value) {
        if (value == null) {
            return '';
        }
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function formatValue(value) {
        if (value == null || value === '') {
            return '-';
        }
        return escapeHtml(value);
    }
})();
